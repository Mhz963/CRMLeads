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
  return data
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
