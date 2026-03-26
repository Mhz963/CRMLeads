import { createClient } from '@supabase/supabase-js'

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
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed.' })

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) return res.status(401).json({ success: false, error: 'Missing authorization token.' })

    const supabasePublic = getSupabasePublic()
    const { data: userData } = await supabasePublic.auth.getUser(token)
    const userId = userData?.user?.id
    if (!userId) return res.status(401).json({ success: false, error: 'Invalid session token.' })

    const body = parseMaybeJson(req.body)
    const activityId = String(body.activity_id || '').trim()
    if (!activityId) return res.status(400).json({ success: false, error: 'Missing activity_id.' })

    const supabaseAdmin = getSupabaseAdmin()
    const { data: me } = await supabaseAdmin.from('crm_users').select('role').eq('id', userId).maybeSingle()
    const isAdmin = me?.role === 'admin'

    let query = supabaseAdmin.from('activities').delete().eq('id', activityId)
    if (!isAdmin) query = query.eq('created_by', userId)
    const { error } = await query
    if (error) return res.status(403).json({ success: false, error: error.message || 'Failed to delete activity.' })

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('delete-activity error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
