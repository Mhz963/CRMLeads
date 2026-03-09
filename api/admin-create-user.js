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

    const supabaseAdmin = getSupabaseAdmin()
    const { data: me, error: meErr } = await supabaseAdmin
      .from('crm_users')
      .select('id, role')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (meErr || !me || me.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin access required.' })
    }

    const body = parseMaybeJson(req.body)
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const fullName = String(body.full_name || '').trim()
    const role = body.role === 'admin' ? 'admin' : 'team_member'

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' })
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' })
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName || null },
    })

    if (createErr || !created?.user?.id) {
      return res.status(400).json({
        success: false,
        error: createErr?.message || 'Failed to create auth user.',
      })
    }

    const { error: upsertErr } = await supabaseAdmin
      .from('crm_users')
      .upsert(
        {
          id: created.user.id,
          email,
          full_name: fullName || null,
          role,
        },
        { onConflict: 'id' }
      )

    if (upsertErr) {
      return res.status(500).json({
        success: false,
        error: upsertErr.message || 'Failed to create CRM user profile.',
      })
    }

    return res.status(200).json({
      success: true,
      user: {
        id: created.user.id,
        email,
        full_name: fullName || null,
        role,
      },
    })
  } catch (err) {
    console.error('admin-create-user error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
