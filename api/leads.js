// ═══════════════════════════════════════════════════════════════════════════
// Vercel Serverless Function — Public Lead Capture API
// POST /api/leads — External websites call this to submit leads into the CRM
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

// These come from Vercel Environment Variables (set in dashboard or .env)
const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY  // ⚠️ Server-only, bypasses RLS
const apiKey = process.env.CRM_API_KEY                        // Shared secret for API callers
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN
const telegramChatId = process.env.TELEGRAM_CHAT_ID

// Create a Supabase admin client (bypasses RLS)
function getSupabaseAdmin() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase config on server')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// CORS headers — allow any website to call this endpoint
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, Authorization',
  'Access-Control-Max-Age': '86400',
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
  if (!notes) {
    return { address: '', website: '', rating: null, reviews: null }
  }
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

function toSnakeCase(input) {
  return String(input || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function cleanCustomObject(obj) {
  const out = {}
  for (const [key, value] of Object.entries(obj || {})) {
    const safeKey = toSnakeCase(key)
    if (!safeKey) continue
    if (value === undefined || value === null) continue
    if (typeof value === 'string' && value.trim() === '') continue
    out[safeKey] = typeof value === 'string' ? value.trim() : value
  }
  return out
}

function buildCustomFields(body, req) {
  const reservedKeys = new Set([
    'name', 'full_name', 'email', 'phone', 'business_address', 'address', 'business_addr',
    'website', 'web', 'site', 'map_url', 'google_maps_url', 'maps_url',
    'google_rating', 'rating', 'stars', 'google_reviews', 'reviews', 'review_count',
    'services', 'notes', 'source_detail', 'custom_fields',
  ])

  const explicitCustom = cleanCustomObject(
    body?.custom_fields && typeof body.custom_fields === 'object' && !Array.isArray(body.custom_fields)
      ? body.custom_fields
      : {}
  )

  // Demo mapping for the sample contact form fields.
  const mappedCustom = cleanCustomObject({
    service: valueFromAliases(body, ['service', 'service_type', 'service_requested']) || (body?.services || ''),
    number_of_rooms: parseNumberMaybe(body?.number_of_rooms ?? body?.rooms ?? body?.room_count),
    property_type: valueFromAliases(body, ['property_type', 'propertyType']),
    postcode: valueFromAliases(body, ['postcode', 'zip', 'zip_code', 'postal_code']),
    preferred_date: valueFromAliases(body, ['preferred_date', 'date', 'service_date']),
    preferred_time: valueFromAliases(body, ['preferred_time', 'time', 'time_slot']),
    additional_message: valueFromAliases(body, ['additional_message', 'message', 'additionalMessage']),
    source_page: valueFromAliases(body, ['source_page', 'page_url']) || req.headers.referer || null,
  })

  const dynamicCustom = {}
  for (const [rawKey, rawValue] of Object.entries(body || {})) {
    const safeKey = toSnakeCase(rawKey)
    if (!safeKey || reservedKeys.has(safeKey)) continue
    if (rawValue === undefined || rawValue === null) continue
    if (typeof rawValue === 'string' && rawValue.trim() === '') continue
    dynamicCustom[safeKey] = typeof rawValue === 'string' ? rawValue.trim() : rawValue
  }

  return {
    ...mappedCustom,
    ...dynamicCustom,
    ...explicitCustom,
  }
}

function formatTelegramLeadMessage({
  leadName,
  leadPhone,
  leadEmail,
  service,
  notes,
  customFields,
}) {
  const lines = [
    'New Lead Received',
    `Name: ${leadName || '—'}`,
    `Phone: ${leadPhone || '—'}`,
    `Email: ${leadEmail || '—'}`,
    `Service: ${service || '—'}`,
  ]

  const rooms = customFields?.number_of_rooms
  const propertyType = customFields?.property_type
  const postcode = customFields?.postcode
  const preferredDate = customFields?.preferred_date
  const preferredTime = customFields?.preferred_time
  const additionalMessage = customFields?.additional_message

  if (rooms !== null && rooms !== undefined && String(rooms).trim() !== '') lines.push(`Rooms: ${rooms}`)
  if (propertyType) lines.push(`Property: ${propertyType}`)
  if (postcode) lines.push(`Postcode: ${postcode}`)
  if (preferredDate) lines.push(`Preferred Date: ${preferredDate}`)
  if (preferredTime) lines.push(`Preferred Time: ${preferredTime}`)
  if (additionalMessage) lines.push(`Message: ${additionalMessage}`)
  else if (notes) lines.push(`Message: ${notes}`)

  return lines.join('\n')
}

async function sendTelegramLeadNotification(payload) {
  console.log('[Telegram] lead notification requested')
  if (!telegramBotToken || !telegramChatId) {
    console.warn('[Telegram] missing env vars', {
      hasBotToken: Boolean(telegramBotToken),
      hasChatId: Boolean(telegramChatId),
    })
    return {
      enabled: false,
      sent: false,
      error: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing',
    }
  }
  const text = formatTelegramLeadMessage(payload)

  try {
    console.log('[Telegram] sending message', {
      chatId: telegramChatId,
      hasToken: Boolean(telegramBotToken),
    })
    const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text,
        disable_web_page_preview: true,
      }),
    })
    const raw = await response.text()
    let tgPayload = {}
    try {
      tgPayload = raw ? JSON.parse(raw) : {}
    } catch {
      tgPayload = {}
    }

    if (!response.ok) {
      console.error('Telegram sendMessage failed:', raw)
      return {
        enabled: true,
        sent: false,
        error: tgPayload?.description || `HTTP ${response.status}`,
      }
    }
    if (tgPayload?.ok === false) {
      console.error('[Telegram] Telegram API returned ok=false', tgPayload)
      return {
        enabled: true,
        sent: false,
        error: tgPayload?.description || 'Telegram API returned ok=false',
      }
    }
    console.log('[Telegram] message sent successfully')
    return { enabled: true, sent: true, error: null }
  } catch (err) {
    console.error('Telegram notification error:', err)
    return {
      enabled: true,
      sent: false,
      error: err?.message || 'Unknown Telegram request error',
    }
  }
}

async function sendTelegramLeadNotificationForUsers(supabaseAdmin, payload) {
  try {
    const { data: rows, error } = await supabaseAdmin
      .from('user_telegram_integrations')
      .select('user_id, telegram_bot_token, telegram_chat_id, is_enabled')
      .eq('is_enabled', true)
    if (error) {
      console.error('[Telegram] user integrations fetch error:', error)
      return { enabled: false, sent: false, mode: 'per-user', recipients: 0, successes: 0, failures: 0, error: error.message }
    }

    const targets = (rows || []).filter((r) => r.telegram_bot_token && r.telegram_chat_id)
    if (!targets.length) {
      return { enabled: false, sent: false, mode: 'per-user', recipients: 0, successes: 0, failures: 0, error: 'No enabled user telegram integrations.' }
    }

    const text = formatTelegramLeadMessage(payload)
    let successes = 0
    const failures = []

    for (const target of targets) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${target.telegram_bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: target.telegram_chat_id,
            text,
            disable_web_page_preview: true,
          }),
        })
        const raw = await response.text()
        let tgPayload = {}
        try { tgPayload = raw ? JSON.parse(raw) : {} } catch { tgPayload = {} }
        if (!response.ok || tgPayload?.ok === false) {
          failures.push({
            user_id: target.user_id,
            error: tgPayload?.description || `HTTP ${response.status}`,
          })
        } else {
          successes += 1
        }
      } catch (err) {
        failures.push({ user_id: target.user_id, error: err?.message || 'Unknown Telegram request error' })
      }
    }

    return {
      enabled: true,
      sent: successes > 0,
      mode: 'per-user',
      recipients: targets.length,
      successes,
      failures: failures.length,
      errors: failures,
      error: failures.length ? 'Some recipients failed.' : null,
    }
  } catch (err) {
    console.error('[Telegram] per-user notification error:', err)
    return { enabled: false, sent: false, mode: 'per-user', recipients: 0, successes: 0, failures: 0, error: err?.message || 'Failed to send per-user notifications.' }
  }
}

export default async function handler(req, res) {
  // Set CORS headers on EVERY response (including OPTIONS)
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value)
  })

  // ── Handle CORS preflight ──
  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  // ── Only allow POST ──
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.',
    })
  }

  // ── Validate API key ──
  const providedKey = req.headers['x-api-key']
  if (!apiKey) {
    // If CRM_API_KEY is not set on server, reject all requests (safe default)
    return res.status(500).json({
      success: false,
      error: 'API is not configured. Set CRM_API_KEY in environment variables.',
    })
  }
  if (providedKey !== apiKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or missing API key. Include x-api-key header.',
    })
  }

  // ── Parse & validate body ──
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
    source_detail,  // optional: e.g. "Contact form on example.com"
  } = body

  const leadName = (name || full_name || '').trim()
  const leadEmail = (email || '').trim()
  const leadPhone = (phone || '').trim()
  const notesExtracted = extractBusinessFieldsFromNotes(notes)
  const leadAddress =
    valueFromAliases(body, ['business_address', 'address', 'business_addr']) ||
    notesExtracted.address
  const leadWebsiteRaw =
    valueFromAliases(body, ['website', 'web', 'site']) || notesExtracted.website
  const leadWebsite = normalizeWebsite(leadWebsiteRaw)
  const leadMapUrl = valueFromAliases(body, ['map_url', 'google_maps_url', 'maps_url'])
  const leadRating =
    parseNumberMaybe(
      google_rating ??
      body.rating ??
      body.stars ??
      notesExtracted.rating
    )
  const leadReviews =
    parseNumberMaybe(
      google_reviews ??
      body.reviews ??
      body.review_count ??
      notesExtracted.reviews
    )
  const customFields = buildCustomFields(body, req)

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

  // Basic email format check
  if (leadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format.',
    })
  }

  if (
    leadRating !== null &&
    (!Number.isFinite(leadRating) || leadRating < 0 || leadRating > 5)
  ) {
    return res.status(400).json({
      success: false,
      error: 'google_rating must be a number between 0 and 5.',
    })
  }

  if (
    leadReviews !== null &&
    (!Number.isFinite(leadReviews) || leadReviews < 0)
  ) {
    return res.status(400).json({
      success: false,
      error: 'google_reviews must be a non-negative number.',
    })
  }

  // ── Insert into Supabase ──
  try {
    const supabase = getSupabaseAdmin()

    // Capture the caller's IP for analytics
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
        created_by: null,        // No authenticated user — came from external API
        custom_fields: Object.keys(customFields).length ? customFields : null,
      })
      .select('id, full_name, email, status, source, created_at')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      const errMsg = String(error?.message || '')
      if (errMsg.toLowerCase().includes('custom_fields')) {
        return res.status(500).json({
          success: false,
          error: 'Missing `custom_fields` column in `leads` table. Add JSONB column first.',
        })
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to create lead. Please try again.',
      })
    }

    // Optionally log an activity for the new lead
    await supabase.from('activities').insert({
      lead_id: data.id,
      type: 'created',
      notes: source_detail
        ? `Lead submitted via Website API (${source_detail})`
        : 'Lead submitted via Website API',
      created_by: null,
    })

    // Send notification, but never fail lead creation if Telegram is down.
    const telegramPayload = {
      leadName,
      leadPhone,
      leadEmail,
      service: (services || '').trim() || customFields?.service || null,
      notes: (notes || '').trim() || null,
      customFields,
    }
    let telegram = await sendTelegramLeadNotificationForUsers(supabase, telegramPayload)
    if (!telegram?.sent && telegram?.recipients === 0) {
      telegram = await sendTelegramLeadNotification(telegramPayload)
    }
    console.log('[Telegram] lead notification result', telegram)

    return res.status(201).json({
      success: true,
      api_version: 'leads-telegram-v2',
      message: 'Lead created successfully.',
      lead: {
        id: data.id,
        name: data.full_name,
        email: data.email,
        status: data.status,
        business_address: leadAddress || null,
        website: leadWebsite || null,
        google_rating: leadRating,
        google_reviews: leadReviews !== null ? Math.round(leadReviews) : null,
        custom_fields: Object.keys(customFields).length ? customFields : null,
        created_at: data.created_at,
      },
      telegram,
    })
  } catch (err) {
    console.error('API error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
    })
  }
}
