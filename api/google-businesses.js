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

function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase server config')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getSupabasePublic() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase public config')
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
      'rating',
      'user_ratings_total',
      'business_status',
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

function normalizePlace(place, details, searchQuery, assignedTo, createdBy, userIp) {
  const name = details?.name || place.name || ''
  const address = details?.formatted_address || place.formatted_address || ''
  const website = details?.website || null
  const phone = details?.international_phone_number || details?.formatted_phone_number || null
  const rating = typeof details?.rating === 'number'
    ? details.rating
    : (typeof place.rating === 'number' ? place.rating : null)
  const reviews = Number.isFinite(details?.user_ratings_total)
    ? details.user_ratings_total
    : (Number.isFinite(place.user_ratings_total) ? place.user_ratings_total : null)
  const mapsUrl = details?.url || (place.place_id
    ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
    : null)
  const ratingText = typeof rating === 'number' ? `${rating}/5` : 'N/A'
  const reviewsText = reviews ?? 0

  const notesLines = [
    `Imported from Google Maps`,
    `Search Query: ${searchQuery}`,
    place.place_id ? `Place ID: ${place.place_id}` : null,
    address ? `Address: ${address}` : null,
    mapsUrl ? `Maps URL: ${mapsUrl}` : null,
    `Rating: ${ratingText} (${reviewsText} reviews)`,
    details?.business_status || place.business_status
      ? `Business Status: ${details?.business_status || place.business_status}`
      : null,
    Array.isArray(place.types) && place.types.length
      ? `Types: ${place.types.join(', ')}`
      : null,
  ].filter(Boolean)

  const score = typeof rating === 'number'
    ? Math.max(1, Math.min(100, Math.round(rating * 20)))
    : null

  return {
    full_name: (name || '').trim() || 'Unknown Business',
    email: null,
    phone,
    services: searchQuery || 'Google Maps Prospect',
    business_address: address || null,
    website: website || null,
    google_rating: rating,
    google_reviews: reviews,
    map_url: mapsUrl,
    notes: notesLines.join('\n'),
    source: 'Google Maps',
    status: 'New Lead',
    user_ip: userIp,
    tag: null,
    score,
    assigned_to: assignedTo || null,
    created_by: createdBy || null,
  }
}

function extractKnownPlaceIds(existingLeads) {
  const ids = new Set()
  for (const lead of existingLeads || []) {
    const match = lead?.notes?.match(/Place ID:\s*([^\s]+)/i)
    if (match?.[1]) ids.add(match[1].trim())
  }
  return ids
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
      return res.status(401).json({
        success: false,
        error: 'Missing authorization token.',
      })
    }

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session token.',
      })
    }

    const userId = userData.user.id
    const supabaseAdmin = getSupabaseAdmin()

    const { data: roleRow, error: roleErr } = await supabaseAdmin
      .from('crm_users')
      .select('role')
      .eq('id', userId)
      .maybeSingle()

    if (roleErr || roleRow?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin users can run Google Maps imports.',
      })
    }

    const body = req.body || {}
    const query = (body.query || '').trim()
    const location = (body.location || '').trim()
    const region = (body.region || 'nz').trim()
    const assignedTo = body.assigned_to || null
    const maxResultsRaw = Number(body.max_results || 10)
    const maxResults = Number.isFinite(maxResultsRaw)
      ? Math.max(1, Math.min(50, maxResultsRaw))
      : 10

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: query',
      })
    }

    const searchUrl = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
    searchUrl.searchParams.set('query', query)
    searchUrl.searchParams.set('region', region)
    searchUrl.searchParams.set('key', googleMapsApiKey)
    if (location) searchUrl.searchParams.set('location', location)

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

    const places = (mapsData.results || []).slice(0, maxResults)
    if (!places.length) {
      return res.status(200).json({
        success: true,
        message: 'No businesses found for this query.',
        imported_count: 0,
        skipped_count: 0,
      })
    }

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from('leads')
      .select('id, notes')
      .eq('source', 'Google Maps')
      .limit(2000)

    if (existingErr) {
      return res.status(500).json({
        success: false,
        error: 'Could not check existing Google Maps leads.',
      })
    }

    const knownPlaceIds = extractKnownPlaceIds(existing)
    const userIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null

    const toInsert = []
    let skipped = 0
    for (const place of places) {
      if (place.place_id && knownPlaceIds.has(place.place_id)) {
        skipped += 1
        continue
      }
      const details = await fetchPlaceDetails(place.place_id)
      toInsert.push(normalizePlace(place, details, query, assignedTo, userId, userIp))
    }

    if (!toInsert.length) {
      return res.status(200).json({
        success: true,
        message: 'All results were skipped as duplicates.',
        imported_count: 0,
        skipped_count: skipped,
      })
    }

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('leads')
      .insert(toInsert)
      .select('id, full_name, source, created_at')

    if (insertErr) {
      console.error('Google import insert error:', insertErr)
      return res.status(500).json({
        success: false,
        error: 'Failed to save imported businesses to leads table.',
      })
    }

    if (inserted?.length) {
      const activityRows = inserted.map((row) => ({
        lead_id: row.id,
        type: 'created',
        notes: `Lead imported from Google Maps query: ${query}`,
        created_by: userId,
      }))
      await supabaseAdmin.from('activities').insert(activityRows)
    }

    return res.status(201).json({
      success: true,
      message: 'Google Maps businesses imported successfully.',
      imported_count: inserted?.length || 0,
      skipped_count: skipped,
      leads: inserted || [],
    })
  } catch (err) {
    console.error('Google import API error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
    })
  }
}
