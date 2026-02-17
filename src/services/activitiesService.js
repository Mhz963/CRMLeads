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
  if (error) throw error
  return data
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
