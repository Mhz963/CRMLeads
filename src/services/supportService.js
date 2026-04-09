import { supabase } from './supabaseClient'
import { fetchUserProfile } from './authService'

async function currentAccessContext() {
  const { data } = await supabase.auth.getUser()
  const userId = data?.user?.id ?? null
  if (!userId) return { userId: null, role: null, businessId: null }
  const profile = await fetchUserProfile(userId)
  return {
    userId,
    role: profile?.role || null,
    businessId: profile?.business_id || null,
  }
}

export async function fetchMySupportTickets() {
  const access = await currentAccessContext()
  if (!access.userId) return []

  let query = supabase
    .from('crm_support_tickets')
    .select('id, business_id, subject, description, priority, status, response_message, responded_by, responded_at, created_by, created_at, updated_at, businesses(name)')
    .order('created_at', { ascending: false })

  if (access.role !== 'super_admin') {
    if (!access.businessId) return []
    query = query.eq('business_id', access.businessId)
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createSupportTicket(payload) {
  const access = await currentAccessContext()
  if (!access.userId) throw new Error('Please sign in again.')
  if (access.role !== 'super_admin' && !access.businessId) {
    throw new Error('Please register your business first from Business Info.')
  }

  const { data, error } = await supabase
    .from('crm_support_tickets')
    .insert({
      business_id: access.role === 'super_admin' ? (payload.business_id || null) : access.businessId,
      subject: String(payload.subject || '').trim(),
      description: String(payload.description || '').trim(),
      priority: String(payload.priority || 'medium').toLowerCase(),
      status: 'open',
      created_by: access.userId,
    })
    .select('id, business_id, subject, description, priority, status, response_message, responded_by, responded_at, created_by, created_at, updated_at, businesses(name)')
    .single()

  if (error) throw error
  return data
}

export async function updateSupportTicket(ticketId, updates) {
  const access = await currentAccessContext()
  if (access.role !== 'super_admin') throw new Error('Super admin access required.')

  const payload = {
    updated_at: new Date().toISOString(),
  }
  if (updates.status) payload.status = String(updates.status).toLowerCase()
  if (updates.response_message !== undefined) payload.response_message = String(updates.response_message || '').trim() || null
  if (payload.response_message) {
    payload.responded_by = access.userId
    payload.responded_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('crm_support_tickets')
    .update(payload)
    .eq('id', ticketId)
    .select('id, business_id, subject, description, priority, status, response_message, responded_by, responded_at, created_by, created_at, updated_at, businesses(name)')
    .single()

  if (error) throw error
  return data
}
