import { supabase } from './supabaseClient'

async function ensureDefaultTrialSubscription(userId, businessId = null) {
  const { data: existing, error: existingErr } = await supabase
    .from('crm_user_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingErr || existing?.id) return

  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  await supabase.from('crm_user_subscriptions').insert({
    user_id: userId,
    business_id: businessId,
    plan_code: 'starter',
    status: 'trialing',
    starts_at: new Date().toISOString(),
    ends_at: trialEnd,
    max_team_members: 5,
    max_leads_per_month: 1000,
    notes: 'Auto-created trial subscription on first registration',
    created_by: userId,
  })
}

/* ──────────────────────────  Email / Password  ────────────────────────── */

export async function signUp({ email, password, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  })
  if (error) throw error
  return data
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user
}

/* ──────────────────  Profile sync → crm_users table  ────────────────── */

export async function syncUserProfile(user) {
  if (!user) return null

  const fullName =
    user.user_metadata?.full_name || user.user_metadata?.name || null

  try {
    // 1. Check if user already exists in crm_users
    const { data: existing } = await supabase
      .from('crm_users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (existing) {
      // Already exists — update email/name and normalize role for business owners.
      // Some projects auto-create crm_users rows with default role=team_member.
      // In this app flow, non-super-admin signups should be admin by default.
      const normalizedRole =
        existing.role === 'super_admin'
          ? 'super_admin'
          : (existing.role === 'team_member' ? 'admin' : existing.role)
      const { data: updated } = await supabase
        .from('crm_users')
        .update({ email: user.email, full_name: fullName, role: normalizedRole })
        .eq('id', user.id)
        .select()
        .single()
      if (normalizedRole !== 'super_admin') {
        await ensureDefaultTrialSubscription(user.id, updated?.business_id || existing?.business_id || null)
      }
      return updated ?? existing
    }

    // 2. First user in system becomes super_admin, rest are admin (business owner)
    const { count } = await supabase
      .from('crm_users')
      .select('id', { count: 'exact', head: true })

    const role = count === 0 || count === null ? 'super_admin' : 'admin'

    // 3. Try upsert (insert or update on conflict)
    const { data, error } = await supabase
      .from('crm_users')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: fullName,
          role,
        },
        { onConflict: 'id' }
      )
      .select()
      .single()

    if (error) {
      console.error('syncUserProfile – upsert failed:', error)
      // Last resort: try plain read
      const { data: fallback } = await supabase
        .from('crm_users')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()
      return fallback
    }

    if (role !== 'super_admin') {
      await ensureDefaultTrialSubscription(user.id, data?.business_id || null)
    }

    return data
  } catch (err) {
    console.error('syncUserProfile – unexpected error:', err)
    return null
  }
}

/* ──────────────────  Fetch current user profile  ────────────────── */

export async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('crm_users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) return null
  return data
}

export async function updateUserProfile(userId, updates) {
  const { data, error } = await supabase
    .from('crm_users')
    .update(updates)
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw error
  return data
}

/* ──────────────────  Admin: Team Management  ────────────────── */

export async function fetchAllTeamMembers() {
  const me = await getCurrentUser()
  const profile = me?.id ? await fetchUserProfile(me.id) : null
  if (profile?.role !== 'super_admin' && !profile?.business_id) {
    return []
  }
  let query = supabase
    .from('crm_users')
    .select('*')
    .order('created_at', { ascending: true })
  if (profile?.role !== 'super_admin') {
    query = query.eq('business_id', profile?.business_id || null)
  }
  const { data, error } = await query

  if (error) throw error
  return data
}

export async function updateMemberRole(userId, newRole) {
  const { data, error } = await supabase
    .from('crm_users')
    .update({ role: newRole })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function removeMember(userId) {
  const { error } = await supabase
    .from('crm_users')
    .delete()
    .eq('id', userId)

  if (error) throw error
}

export async function adminCreateUser({ email, password, full_name, role }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Please sign in again.')

  const response = await fetch('/api/admin-create-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, password, full_name, role }),
  })

  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'Failed to create user.')
  }

  return payload.user
}
