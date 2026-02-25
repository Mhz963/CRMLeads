import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function getSupabasePublic() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public config')
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseMaybeJson(input) {
  if (!input) return {}
  if (typeof input === 'string') {
    try {
      return JSON.parse(input)
    } catch {
      return {}
    }
  }
  return input
}

async function fetchPlaceDetails(placeId) {
  if (!placeId) return null
  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  detailsUrl.searchParams.set('place_id', placeId)
  detailsUrl.searchParams.set(
    'fields',
    [
      'name',
      'formatted_address',
      'website',
      'formatted_phone_number',
      'international_phone_number',
      'url',
    ].join(',')
  )
  detailsUrl.searchParams.set('key', googleMapsApiKey)

  const resp = await fetch(detailsUrl.toString())
  if (!resp.ok) return null
  const payload = await resp.json()
  if (payload.status !== 'OK') return null
  return payload.result || null
}

function toBusiness(place, details) {
  return {
    place_id: place.place_id || null,
    name: details?.name || place.name || 'Unknown',
    address: details?.formatted_address || place.formatted_address || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviews: Number.isFinite(place.user_ratings_total) ? place.user_ratings_total : 0,
    business_status: place.business_status || '',
    open_now: typeof place?.opening_hours?.open_now === 'boolean'
      ? place.opening_hours.open_now
      : null,
    contact_no:
      details?.international_phone_number ||
      details?.formatted_phone_number ||
      null,
    website: details?.website || null,
    maps_url: details?.url || (place.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
      : null),
    types: Array.isArray(place.types) ? place.types : [],
  }
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' })
  }

  if (!googleMapsApiKey) {
    return res.status(500).json({
      success: false,
      error: 'GOOGLE_MAPS_API_KEY is not configured on server.',
    })
  }

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing authorization token.' })
    }

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ success: false, error: 'Invalid session token.' })
    }

    const body = parseMaybeJson(req.body)
    const query = (body.query || 'plumber in Auckland New Zealand').trim()
    const region = (body.region || 'nz').trim()
    const maxResultsRaw = Number(body.max_results || 20)
    const maxResults = Number.isFinite(maxResultsRaw)
      ? Math.max(1, Math.min(60, maxResultsRaw))
      : 20

    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
    searchUrl.searchParams.set('query', query)
    searchUrl.searchParams.set('region', region)
    searchUrl.searchParams.set('key', googleMapsApiKey)

    const mapsResp = await fetch(searchUrl.toString())
    if (!mapsResp.ok) {
      return res.status(502).json({
        success: false,
        error: `Google Maps API failed with status ${mapsResp.status}.`,
      })
    }

    const mapsData = await mapsResp.json()
    if (mapsData.status !== 'OK' && mapsData.status !== 'ZERO_RESULTS') {
      return res.status(400).json({
        success: false,
        error: `Google Maps error: ${mapsData.status}${mapsData.error_message ? ` - ${mapsData.error_message}` : ''}`,
      })
    }

    const sliced = (mapsData.results || []).slice(0, maxResults)
    const enriched = await Promise.all(
      sliced.map(async (place) => {
        const details = await fetchPlaceDetails(place.place_id)
        return toBusiness(place, details)
      })
    )

    return res.status(200).json({
      success: true,
      query,
      total: enriched.length,
      next_page_token: mapsData.next_page_token || null,
      businesses: enriched,
    })
  } catch (err) {
    console.error('GBM search API error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
