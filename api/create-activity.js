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

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    if (userErr || !userData?.user?.id) {
      return res.status(401).json({ success: false, error: 'Invalid session token.' })
    }
    const userId = userData.user.id

    const body = parseMaybeJson(req.body)
    const leadId = String(body.lead_id || '').trim()
    const type = String(body.type || 'note').trim() || 'note'
    const notesRaw = body.notes
    const notes =
      notesRaw === null || notesRaw === undefined
        ? null
        : String(notesRaw).trim() || null

    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Missing lead_id.' })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { role, error: roleError } = await fetchUserRole(supabaseAdmin, userId)
    if (roleError) return res.status(403).json({ success: false, error: roleError })

    if (!shouldBypassSubscription(role)) {
      const { subscription, error: subscriptionError } = await fetchLatestSubscription(supabaseAdmin, userId)
      if (subscriptionError) return res.status(500).json({ success: false, error: subscriptionError })
      if (!hasActiveSubscription(subscription)) {
        return res.status(402).json({ success: false, error: 'Your subscription is inactive. Please renew to continue.' })
      }
    }

    let canCreate = isPrivilegedRole(role)

    if (!canCreate) {
      const { data: ownedLead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('id', leadId)
        .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
        .maybeSingle()

      if (leadErr) {
        return res.status(500).json({ success: false, error: 'Failed to verify lead access.' })
      }
      canCreate = Boolean(ownedLead?.id)
    }

    if (!canCreate) {
      return res.status(403).json({ success: false, error: 'You do not have permission for this lead.' })
    }

    const { data: activity, error: insertErr } = await supabaseAdmin
      .from('activities')
      .insert({
        lead_id: leadId,
        type,
        notes,
        created_by: userId,
      })
      .select()
      .single()

    if (insertErr) {
      return res.status(500).json({ success: false, error: insertErr.message || 'Failed to create activity.' })
    }

    return res.status(200).json({ success: true, activity })
  } catch (err) {
    console.error('create-activity error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
