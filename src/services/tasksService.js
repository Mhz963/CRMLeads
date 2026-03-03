import { supabase } from './supabaseClient'

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

export async function fetchTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      leads (
        id,
        full_name
      )
    `)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchTasksByLead(leadId) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('lead_id', leadId)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}

export async function createTask(payload) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title: payload.title,
      lead_id: payload.lead_id || null,
      assigned_to: userId,
      due_date: payload.due_date || null,
      status: payload.status || 'pending',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function completeTask(id) {
  return updateTask(id, { status: 'completed' })
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function fetchDueTasks() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      leads (
        id,
        full_name
      )
    `)
    .eq('status', 'pending')
    .lte('due_date', today)
    .order('due_date', { ascending: true })
  if (error) throw error
  return data
}
