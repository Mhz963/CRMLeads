import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
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

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin config')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchTextSearchPage({ query, region, pageToken }) {
  const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  if (pageToken) {
    // Google requires pagetoken for subsequent pages.
    searchUrl.searchParams.set('pagetoken', pageToken)
  } else {
    searchUrl.searchParams.set('query', query)
    searchUrl.searchParams.set('region', region)
  }
  searchUrl.searchParams.set('key', googleMapsApiKey)

  const resp = await fetch(searchUrl.toString())
  if (!resp.ok) {
    return { ok: false, status: resp.status, data: null }
  }
  const data = await resp.json()
  return { ok: true, status: resp.status, data }
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

async function readTokenState(supabaseAdmin, query, region) {
  const { data, error } = await supabaseAdmin
    .from('gbm_query_state')
    .select('next_page_token, hit_count')
    .eq('query', query)
    .eq('region', region)
    .maybeSingle()

  if (error) return null
  return data || null
}

async function writeTokenState(supabaseAdmin, {
  query,
  region,
  nextPageToken,
  lastStatus,
  lastError = null,
  lastUsedToken = null,
  hitCount = 0,
}) {
  await supabaseAdmin
    .from('gbm_query_state')
    .upsert({
      query,
      region,
      next_page_token: nextPageToken || null,
      last_status: lastStatus || null,
      last_error: lastError,
      last_used_token: lastUsedToken,
      hit_count: hitCount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'query,region' })
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
    const requestedPageToken = (body.page_token || '').trim()
    const advanceToken = body.advance_token === true || body.advance_token === 'true'
    const maxResultsRaw = Number(body.max_results || 20)
    const maxResults = Number.isFinite(maxResultsRaw)
      ? Math.max(1, Math.min(60, maxResultsRaw))
      : 20

    const supabaseAdmin = getSupabaseAdmin()
    const tokenState = await readTokenState(supabaseAdmin, query, region)
    const effectivePageToken = requestedPageToken || (advanceToken ? (tokenState?.next_page_token || '') : '')
    const nextHitCount = Number(tokenState?.hit_count || 0) + 1

    let fetchResult = await fetchTextSearchPage({
      query,
      region,
      pageToken: effectivePageToken,
    })
    if (!fetchResult.ok) {
      await writeTokenState(supabaseAdmin, {
        query,
        region,
        nextPageToken: tokenState?.next_page_token || null,
        lastStatus: 'HTTP_ERROR',
        lastError: `Google Maps API failed with status ${fetchResult.status}.`,
        lastUsedToken: effectivePageToken || null,
        hitCount: nextHitCount,
      })
      return res.status(502).json({
        success: false,
        error: `Google Maps API failed with status ${fetchResult.status}.`,
      })
    }

    let mapsData = fetchResult.data
    // next_page_token can need a short delay before becoming valid.
    if (effectivePageToken && mapsData.status === 'INVALID_REQUEST') {
      const retryDelays = [1500, 2200, 3000, 3800]
      for (const delay of retryDelays) {
        await sleep(delay)
        fetchResult = await fetchTextSearchPage({ query, region, pageToken: effectivePageToken })
        if (!fetchResult.ok) {
          await writeTokenState(supabaseAdmin, {
            query,
            region,
            nextPageToken: tokenState?.next_page_token || null,
            lastStatus: 'HTTP_ERROR',
            lastError: `Google Maps API failed with status ${fetchResult.status}.`,
            lastUsedToken: effectivePageToken || null,
            hitCount: nextHitCount,
          })
          return res.status(502).json({
            success: false,
            error: `Google Maps API failed with status ${fetchResult.status}.`,
          })
        }
        mapsData = fetchResult.data
        if (mapsData.status !== 'INVALID_REQUEST') {
          break
        }
      }
    }
    if (mapsData.status !== 'OK' && mapsData.status !== 'ZERO_RESULTS') {
      await writeTokenState(supabaseAdmin, {
        query,
        region,
        nextPageToken: tokenState?.next_page_token || null,
        lastStatus: mapsData.status,
        lastError: mapsData.error_message || null,
        lastUsedToken: effectivePageToken || null,
        hitCount: nextHitCount,
      })
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

    // Persist query results into GBM table without duplicates (unique place_id).
    const placeIds = enriched.map((b) => b.place_id).filter(Boolean)
    let inserted_count = 0
    let updated_count = 0
    if (placeIds.length) {
      const { data: existingRows, error: existingErr } = await supabaseAdmin
        .from('gbm_businesses')
        .select('place_id')
        .in('place_id', placeIds)

      if (existingErr) {
        return res.status(500).json({
          success: false,
          error: 'Failed to read existing GBM rows.',
        })
      }

      const existingSet = new Set((existingRows || []).map((r) => r.place_id))
      inserted_count = placeIds.filter((id) => !existingSet.has(id)).length
      updated_count = placeIds.filter((id) => existingSet.has(id)).length

      const nowIso = new Date().toISOString()
      const upsertRows = enriched.map((b) => ({
        place_id: b.place_id,
        name: b.name,
        formatted_address: b.address || null,
        contact_no: b.contact_no || null,
        email: null,
        website: b.website || null,
        rating: b.rating,
        reviews: b.reviews,
        business_status: b.business_status || null,
        maps_url: b.maps_url || null,
        types: b.types || [],
        first_query: query,
        last_query: query,
        last_seen_at: nowIso,
        updated_at: nowIso,
      }))

      const { error: upsertErr } = await supabaseAdmin
        .from('gbm_businesses')
        .upsert(upsertRows, { onConflict: 'place_id' })

      if (upsertErr) {
        return res.status(500).json({
          success: false,
          error: 'Failed to persist GBM rows.',
        })
      }
    }

    await writeTokenState(supabaseAdmin, {
      query,
      region,
      nextPageToken: mapsData.next_page_token || null,
      lastStatus: mapsData.status || 'OK',
      lastError: null,
      lastUsedToken: effectivePageToken || null,
      hitCount: nextHitCount,
    })

    return res.status(200).json({
      success: true,
      query,
      region,
      total: enriched.length,
      inserted_count,
      updated_count,
      token_used: effectivePageToken || null,
      from_stored_token: advanceToken && !requestedPageToken,
      next_page_token: mapsData.next_page_token || null,
      businesses: enriched,
    })
  } catch (err) {
    console.error('GBM search API error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
