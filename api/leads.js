// ═══════════════════════════════════════════════════════════════════════════
// Vercel Serverless Function — Public Lead Capture API
// POST /api/leads — External websites call this to submit leads into the CRM
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'

// These come from Vercel Environment Variables (set in dashboard or .env)
const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY  // ⚠️ Server-only, bypasses RLS
const apiKey = process.env.CRM_API_KEY                        // Shared secret for API callers

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
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
  'Access-Control-Max-Age': '86400',
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
  const body = req.body || {}
  const {
    name,
    full_name,
    email,
    phone,
    services,
    notes,
    source_detail,  // optional: e.g. "Contact form on example.com"
  } = body

  const leadName = (name || full_name || '').trim()
  const leadEmail = (email || '').trim()
  const leadPhone = (phone || '').trim()

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
        services: (services || '').trim() || null,
        notes: (notes || '').trim() || null,
        source: 'Website API',
        status: 'New Lead',
        user_ip: userIp,
        tag: null,
        score: null,
        assigned_to: null,
        created_by: null,        // No authenticated user — came from external API
      })
      .select('id, full_name, email, status, source, created_at')
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
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
    console.error('API error:', err)
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
    })
  }
}
