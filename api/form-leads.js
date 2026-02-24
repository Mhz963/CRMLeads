import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

function valueFromAliases(body, aliases) {
  for (const key of aliases) {
    const val = body?.[key]
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim()
    }
  }
  return ''
}

function parseNumberMaybe(input) {
  if (input === '' || input === undefined || input === null) return null
  const n = Number(input)
  return Number.isFinite(n) ? n : null
}

function normalizeWebsite(url) {
  const clean = (url || '').trim()
  if (!clean) return ''
  if (/^https?:\/\//i.test(clean)) return clean
  return `https://${clean}`
}

function extractBusinessFieldsFromNotes(rawNotes) {
  const notes = (rawNotes || '').trim()
  if (!notes) return { address: '', website: '', rating: null, reviews: null }
  const addressMatch = notes.match(/(?:^|\n)\s*Address:\s*(.+)/i)
  const websiteMatch = notes.match(/(?:^|\n)\s*Website:\s*(.+)/i)
  const ratingMatch = notes.match(/(?:^|\n)\s*Rating:\s*([0-9]+(?:\.[0-9]+)?)/i)
  const reviewsMatch = notes.match(/(?:^|\n)\s*Reviews:\s*([0-9]+)/i)

  return {
    address: addressMatch?.[1]?.trim() || '',
    website: websiteMatch?.[1]?.trim() || '',
    rating: ratingMatch?.[1] ? Number(ratingMatch[1]) : null,
    reviews: reviewsMatch?.[1] ? Number(reviewsMatch[1]) : null,
  }
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' })
  }

  try {
    const body = parseMaybeJson(req.body)
    const {
      name,
      full_name,
      email,
      phone,
      business_address,
      website,
      map_url,
      google_rating,
      google_reviews,
      services,
      notes,
      source_detail,
    } = body

    const leadName = (name || full_name || '').trim()
    const leadEmail = (email || '').trim()
    const leadPhone = (phone || '').trim()
    const notesExtracted = extractBusinessFieldsFromNotes(notes)
    const leadAddress =
      valueFromAliases(body, ['business_address', 'address', 'business_addr']) ||
      notesExtracted.address
    const leadWebsite =
      normalizeWebsite(valueFromAliases(body, ['website', 'web', 'site']) || notesExtracted.website)
    const leadMapUrl = valueFromAliases(body, ['map_url', 'google_maps_url', 'maps_url'])
    const leadRating = parseNumberMaybe(google_rating ?? body.rating ?? notesExtracted.rating)
    const leadReviews = parseNumberMaybe(google_reviews ?? body.reviews ?? notesExtracted.reviews)

    if (!leadName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: "name" (or "full_name").',
      })
    }

    if (!leadEmail && !leadPhone) {
      return res.status(400).json({
        success: false,
        error: 'At least one of "email" or "phone" is required.',
      })
    }

    if (leadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
      return res.status(400).json({ success: false, error: 'Invalid email format.' })
    }

    if (leadRating !== null && (leadRating < 0 || leadRating > 5)) {
      return res.status(400).json({ success: false, error: 'Rating must be between 0 and 5.' })
    }

    if (leadReviews !== null && leadReviews < 0) {
      return res.status(400).json({ success: false, error: 'Reviews must be non-negative.' })
    }

    const supabase = getSupabaseAdmin()
    const userIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null

    const { data, error } = await supabase
      .from('leads')
      .insert({
        full_name: leadName,
        email: leadEmail || null,
        phone: leadPhone || null,
        business_address: leadAddress || null,
        website: leadWebsite || null,
        map_url: leadMapUrl || null,
        google_rating: leadRating,
        google_reviews: leadReviews !== null ? Math.round(leadReviews) : null,
        services: (services || '').trim() || null,
        notes: (notes || '').trim() || null,
        source: 'Website API',
        status: 'New Lead',
        user_ip: userIp,
        tag: null,
        score: null,
        assigned_to: null,
        created_by: null,
      })
      .select('id, full_name, email, status, source, created_at')
      .single()

    if (error) {
      console.error('form-leads insert error:', error)
      return res.status(500).json({
        success: false,
        error: 'Failed to create lead. Please try again.',
      })
    }

    await supabase.from('activities').insert({
      lead_id: data.id,
      type: 'created',
      notes: source_detail
        ? `Lead submitted via Website Form (${source_detail})`
        : 'Lead submitted via Website Form',
      created_by: null,
    })

    return res.status(201).json({
      success: true,
      message: 'Lead created successfully.',
      lead: {
        id: data.id,
        name: data.full_name,
        email: data.email,
        status: data.status,
        created_at: data.created_at,
      },
    })
  } catch (err) {
    console.error('form-leads API error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
