import { createClient } from '@supabase/supabase-js'
import { canManageSubscriptions, fetchLatestSubscription, fetchUserRole } from './_lib/access.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function getSupabasePublic() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getSupabaseAdmin() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseMaybeJson(input) {
  if (!input) return {}
  if (typeof input === 'string') {
    try { return JSON.parse(input) } catch { return {} }
  }
  return input
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed.' })
  }

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) return res.status(401).json({ success: false, error: 'Missing authorization token.' })

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    const userId = userData?.user?.id
    if (userErr || !userId) return res.status(401).json({ success: false, error: 'Invalid session token.' })

    const supabaseAdmin = getSupabaseAdmin()
    const { role, error: roleError } = await fetchUserRole(supabaseAdmin, userId)
    if (roleError) return res.status(403).json({ success: false, error: roleError })

    if (req.method === 'GET') {
      if (canManageSubscriptions(role) && String(req.query.scope || '') === 'all') {
        const { data, error } = await supabaseAdmin
          .from('crm_user_subscriptions')
          .select('id, user_id, plan_code, status, starts_at, ends_at, max_team_members, max_leads_per_month, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) return res.status(500).json({ success: false, error: error.message })
        return res.status(200).json({ success: true, subscriptions: data || [] })
      }

      const { subscription, error } = await fetchLatestSubscription(supabaseAdmin, userId)
      if (error) return res.status(500).json({ success: false, error })
      return res.status(200).json({ success: true, subscription })
    }

    if (!canManageSubscriptions(role)) {
      return res.status(403).json({ success: false, error: 'Super admin access required.' })
    }

    const body = parseMaybeJson(req.body)
    const targetUserId = String(body.user_id || '').trim()
    if (!targetUserId) {
      return res.status(400).json({ success: false, error: 'Missing user_id.' })
    }

    const status = String(body.status || 'active').trim().toLowerCase()
    const planCode = String(body.plan_code || 'starter').trim().toLowerCase()
    const allowedStatuses = new Set(['trialing', 'active', 'past_due', 'canceled', 'paused'])
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid subscription status.' })
    }

    const startsAt = body.starts_at ? new Date(body.starts_at).toISOString() : new Date().toISOString()
    const endsAt = body.ends_at ? new Date(body.ends_at).toISOString() : null

    const { data, error } = await supabaseAdmin
      .from('crm_user_subscriptions')
      .insert({
        user_id: targetUserId,
        plan_code: planCode,
        status,
        starts_at: startsAt,
        ends_at: endsAt,
        max_team_members: Number.isFinite(Number(body.max_team_members)) ? Number(body.max_team_members) : null,
        max_leads_per_month: Number.isFinite(Number(body.max_leads_per_month)) ? Number(body.max_leads_per_month) : null,
        notes: body.notes ? String(body.notes).trim() : null,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error) return res.status(500).json({ success: false, error: error.message })
    return res.status(200).json({ success: true, subscription: data })
  } catch (err) {
    console.error('subscriptions API error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
