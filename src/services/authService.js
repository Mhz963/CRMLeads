import { supabase } from './supabaseClient'

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
  if (!user) return

  // Check if user already exists in crm_users
  const { data: existing } = await supabase
    .from('crm_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) {
    // Already exists — just update email/name if changed
    await supabase.from('crm_users').update({
      email: user.email,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    }).eq('id', user.id)
    return existing
  }

  // First user in system becomes admin, rest are team_member
  const { count } = await supabase
    .from('crm_users')
    .select('id', { count: 'exact', head: true })

  const role = count === 0 ? 'admin' : 'team_member'

  const { data, error } = await supabase.from('crm_users').insert({
    id: user.id,
    email: user.email,
    full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
    role,
  }).select().single()

  if (error) {
    console.error('Failed to sync user profile', error)
    return null
  }

  return data
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

/* ──────────────────  Admin: Team Management  ────────────────── */

export async function fetchAllTeamMembers() {
  const { data, error } = await supabase
    .from('crm_users')
    .select('*')
    .order('created_at', { ascending: true })

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
