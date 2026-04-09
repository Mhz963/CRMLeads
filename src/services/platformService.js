import { supabase } from './supabaseClient'

export async function fetchPlatformOverview() {
  const businessesSelectExtended = 'id, name, owner_user_id, contact_email, contact_phone, business_type, company_size, city, country, timezone, status, created_at'
  const businessesSelectBasic = 'id, name, owner_user_id, contact_email, status, created_at'

  // Backward-compatible businesses fetch:
  // some DBs may not have the newer business profile columns yet.
  const fetchBusinesses = async () => {
    const extended = await supabase
      .from('businesses')
      .select(businessesSelectExtended)
      .order('created_at', { ascending: false })

    if (!extended.error) return extended

    const fallback = await supabase
      .from('businesses')
      .select(businessesSelectBasic)
      .order('created_at', { ascending: false })

    return fallback
  }

  const businessesPromise = fetchBusinesses()
  const supportPromise = supabase
    .from('crm_support_tickets')
    .select('id, subject, description, priority, status, response_message, created_at, businesses(name)')
    .order('created_at', { ascending: false })

  const [
    { data: users, error: usersError },
    { data: subscriptions, error: subsError },
    { data: businessRows, error: businessError },
    { data: leads, error: leadsError },
    { data: activities, error: activitiesError },
    { data: tasks, error: tasksError },
    { data: supportRows, error: supportError },
  ] = await Promise.all([
    supabase
      .from('crm_users')
      .select('id, email, full_name, role, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('crm_user_subscriptions')
      .select('id, user_id, plan_code, status, starts_at, ends_at, created_at')
      .order('created_at', { ascending: false }),
    businessesPromise,
    supabase
      .from('leads')
      .select('id, full_name, email, phone, source, status, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('activities')
      .select('id, lead_id, type, notes, created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('tasks')
      .select('id, title, status, due_date, created_at')
      .order('created_at', { ascending: false }),
    supportPromise,
  ])

  if (usersError) throw usersError
  if (subsError) throw subsError
  if (businessError) throw businessError
  if (leadsError) throw leadsError
  if (activitiesError) throw activitiesError
  if (tasksError) throw tasksError
  // Keep platform resilient for older DBs that don't have support table yet.
  const supportList = supportError ? [] : (supportRows || [])

  const userRows = users || []
  const subRows = subscriptions || []

  const latestSubByUser = new Map()
  for (const row of subRows) {
    if (!latestSubByUser.has(row.user_id)) latestSubByUser.set(row.user_id, row)
  }

  const businessOwners = userRows.filter((u) => u.role === 'admin')
  const managers = userRows.filter((u) => u.role === 'business_member')
  const agents = userRows.filter((u) => u.role === 'team_member')

  const businessList = (businessRows || []).map((biz) => {
    const owner = businessOwners.find((u) => u.id === biz.owner_user_id)
    return {
      id: biz.id,
      name: biz.name,
      status: biz.status || 'inactive',
      contact_email: biz.contact_email || '—',
      contact_phone: biz.contact_phone || '—',
      business_type: biz.business_type || '—',
      company_size: biz.company_size || '—',
      city: biz.city || '—',
      country: biz.country || '—',
      timezone: biz.timezone || '—',
      created_at: biz.created_at || null,
      owner_id: owner?.id || biz.owner_user_id || null,
      owner_name: owner?.full_name || 'Unknown Owner',
      owner_email: owner?.email || biz.contact_email || '—',
      owner_role: owner?.role || 'admin',
      owner_created_at: owner?.created_at || null,
      plan_code: latestSubByUser.get(biz.owner_user_id)?.plan_code || 'starter',
      subscription_status: latestSubByUser.get(biz.owner_user_id)?.status || 'inactive',
      started_at: latestSubByUser.get(biz.owner_user_id)?.starts_at || null,
      subscription_ends_at: latestSubByUser.get(biz.owner_user_id)?.ends_at || null,
    }
  })

  const leadRows = leads || []
  const activityRows = activities || []
  const taskRows = tasks || []

  return {
    stats: {
      totalBusinesses: businessList.length,
      activeSubscriptions: businessList.filter((b) => ['active', 'trialing'].includes(String(b.subscription_status))).length,
      pastDueSubscriptions: businessList.filter((b) => String(b.subscription_status) === 'past_due').length,
      totalManagers: managers.length,
      totalAgents: agents.length,
      totalLeads: leadRows.length,
      totalActivities: activityRows.length,
      totalTasks: taskRows.length,
    },
    businesses: businessList,
    subscriptions: subRows,
    leads: leadRows,
    activities: activityRows,
    tasks: taskRows,
    billingSettings: {
      provider: 'Stripe (recommended)',
      currency: 'USD',
      billingCycle: 'Monthly',
      taxMode: 'Exclusive',
    },
    supportQueue: supportList,
  }
}
