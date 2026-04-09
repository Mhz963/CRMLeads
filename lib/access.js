export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['trialing', 'active'])

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase()
}

export function isPrivilegedRole(role) {
  const normalized = normalizeRole(role)
  return normalized === 'admin' || normalized === 'super_admin'
}

export function canManageSubscriptions(role) {
  return normalizeRole(role) === 'super_admin'
}

export function shouldBypassSubscription(role) {
  return normalizeRole(role) === 'super_admin'
}

export async function fetchUserRole(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from('crm_users')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return { role: null, error: error.message || 'Failed to read user profile.' }
  }
  if (!data) {
    return { role: null, error: 'User profile not found.' }
  }
  return { role: normalizeRole(data.role), error: null }
}

export async function fetchLatestSubscription(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from('crm_user_subscriptions')
    .select('id, plan_code, status, starts_at, ends_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return { subscription: null, error: error.message || 'Failed to read subscription.' }
  }
  return { subscription: data || null, error: null }
}

export function hasActiveSubscription(subscription) {
  if (!subscription) return false
  const status = String(subscription.status || '').trim().toLowerCase()
  if (!ACTIVE_SUBSCRIPTION_STATUSES.has(status)) return false

  if (!subscription.ends_at) return true
  return new Date(subscription.ends_at).getTime() > Date.now()
}
