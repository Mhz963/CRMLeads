import { createClient } from '@supabase/supabase-js'
import { fetchLatestSubscription, hasActiveSubscription } from './_lib/access.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ALLOWED_STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal', 'Closed']

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

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' })
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
    const id = String(body.id || '').trim()
    const newStatus = String(body.newStatus || '').trim()
    if (!id || !newStatus) {
      return res.status(400).json({ success: false, error: 'Missing id or newStatus.' })
    }
    if (!ALLOWED_STAGES.includes(newStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid stage.' })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const userId = userData.user.id
    const { subscription, error: subscriptionError } = await fetchLatestSubscription(supabaseAdmin, userId)
    if (subscriptionError) {
      return res.status(500).json({ success: false, error: subscriptionError })
    }
    if (!hasActiveSubscription(subscription)) {
      return res.status(402).json({ success: false, error: 'Your subscription is inactive. Please renew to continue.' })
    }

    // Update with service role to avoid client RLS failures for stage movement.
    const { data: lead, error: updateErr } = await supabaseAdmin
      .from('leads')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (updateErr) {
      return res.status(500).json({
        success: false,
        error: updateErr.message || 'Failed to update lead stage.',
      })
    }

    await supabaseAdmin.from('activities').insert({
      lead_id: id,
      type: 'status_change',
      notes: `Lead moved to "${newStatus}" via Pipeline`,
      created_by: userId,
    })

    return res.status(200).json({
      success: true,
      lead,
    })
  } catch (err) {
    console.error('move-lead-stage API error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
