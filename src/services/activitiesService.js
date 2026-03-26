import { supabase } from './supabaseClient'

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export const ACTIVITY_TYPES = ['note', 'status_change', 'call', 'email', 'meeting', 'reminder', 'created']

export async function fetchActivitiesByLead(leadId) {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  if (error) throw error

  const creatorIds = [...new Set((data || []).map((a) => a.created_by).filter(Boolean))]
  let nameById = {}
  if (creatorIds.length) {
    const { data: users } = await supabase
      .from('crm_users')
      .select('id, full_name, email')
      .in('id', creatorIds)
    nameById = Object.fromEntries((users || []).map((u) => [u.id, u.full_name || u.email || 'Unknown']))
  }

  return (data || []).map((a) => ({
    ...a,
    created_by_name: a.created_by ? (nameById[a.created_by] || 'Unknown') : 'System',
  }))
}

export async function createActivity(payload) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('activities')
    .insert({
      lead_id: payload.lead_id,
      type: payload.type || 'note',
      notes: payload.notes || null,
      created_by: userId,
    })
    .select()
    .single()
  if (!error) return data

  // Fallback for RLS-protected inserts.
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw error

  const response = await fetch('/api/create-activity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lead_id: payload.lead_id,
      type: payload.type || 'note',
      notes: payload.notes || null,
    }),
  })

  const raw = await response.text()
  let fallbackPayload = {}
  try {
    fallbackPayload = raw ? JSON.parse(raw) : {}
  } catch {
    fallbackPayload = {}
  }

  if (!response.ok || !fallbackPayload.success) {
    if (response.status === 404 || response.status === 405) {
      throw new Error(
        'Activity fallback endpoint is not deployed yet (HTTP 404/405). Deploy latest backend or add RLS policy for activities.'
      )
    }
    throw new Error(fallbackPayload.error || error.message || 'Failed to create activity')
  }

  return fallbackPayload.activity
}

export async function updateActivity(activityId, updates) {
  const { data, error } = await supabase
    .from('activities')
    .update({ ...updates })
    .eq('id', activityId)
    .select()
    .single()
  if (!error) return data

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw error

  const response = await fetch('/api/update-activity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ activity_id: activityId, updates }),
  })

  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || error.message || 'Failed to update activity')
  }
  return payload.activity
}

export async function deleteActivity(activityId) {
  const { error } = await supabase.from('activities').delete().eq('id', activityId)
  if (!error) return

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw error

  const response = await fetch('/api/delete-activity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ activity_id: activityId }),
  })

  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || error.message || 'Failed to delete activity')
  }
}

export async function fetchRecentActivities(limit = 10) {
  const { data, error } = await supabase
    .from('activities')
    .select(`
      *,
      leads (
        id,
        full_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}
