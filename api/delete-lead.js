import { createClient } from '@supabase/supabase-js'
import { fetchLatestSubscription, fetchUserRole, hasActiveSubscription, isPrivilegedRole, shouldBypassSubscription } from '../lib/access.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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

    const body = parseMaybeJson(req.body)
    const leadId = String(body.id || '').trim()
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing lead id.' })
    }

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ success: false, error: 'Invalid session token.' })
    }
    const currentUserId = userData.user.id

    const supabaseAdmin = getSupabaseAdmin()
    const { role, error: roleError } = await fetchUserRole(supabaseAdmin, currentUserId)
    if (roleError) return res.status(403).json({ success: false, error: roleError })
    if (!shouldBypassSubscription(role)) {
      const { subscription, error: subscriptionError } = await fetchLatestSubscription(supabaseAdmin, currentUserId)
      if (subscriptionError) return res.status(500).json({ success: false, error: subscriptionError })
      if (!hasActiveSubscription(subscription)) {
        return res.status(402).json({ success: false, error: 'Your subscription is inactive. Please renew to continue.' })
      }
    }

    let canDelete = isPrivilegedRole(role)
    if (!canDelete) {
      const { data: ownLead, error: ownErr } = await supabaseAdmin
        .from('leads')
        .select('id, created_by')
        .eq('id', leadId)
        .eq('created_by', currentUserId)
        .maybeSingle()
      if (ownErr) {
        return res.status(500).json({ success: false, error: 'Failed to verify lead ownership.' })
      }
      canDelete = Boolean(ownLead?.id)
    }

    if (!canDelete) {
      return res.status(403).json({ success: false, error: 'You do not have permission to delete this lead.' })
    }

    // Clean dependent rows first to avoid FK constraint issues.
    await supabaseAdmin.from('activities').delete().eq('lead_id', leadId)
    await supabaseAdmin.from('tasks').delete().eq('lead_id', leadId)

    const { error: delErr } = await supabaseAdmin.from('leads').delete().eq('id', leadId)
    if (delErr) {
      return res.status(500).json({ success: false, error: delErr.message || 'Failed to delete lead.' })
    }

    return res.status(200).json({ success: true, id: leadId })
  } catch (err) {
    console.error('delete-lead error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
