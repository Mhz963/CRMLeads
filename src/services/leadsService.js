import { supabase } from './supabaseClient'

// Lead statuses and pipeline stages
export const LEAD_STATUSES = ['New', 'Contacted', 'Interested', 'Proposal Sent', 'Won', 'Lost']

export const PIPELINE_STAGES = ['New', 'Contacted', 'Proposal', 'Negotiation', 'Closed']

const SUPABASE_ENABLED = !!supabase

// When Supabase is disabled, these functions fall back to in-memory/mock behavior

export async function fetchLeads() {
  if (!SUPABASE_ENABLED) {
    // No backend yet – return empty list so UI still renders
    return []
  }

  const { data, error } = await supabase
    .from('leads')
    .select(
      `
      id,
      full_name,
      email,
      phone,
      source,
      status,
      score,
      assigned_to,
      created_at,
      updated_at,
      companies (
        id,
        name
      )
    `
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createLead(payload) {
  if (!SUPABASE_ENABLED) {
    // Return a mock lead object so the caller can still show success
    return {
      id: `local_${Date.now()}`,
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      source: payload.source,
      status: payload.status || 'New',
      score: payload.score ?? null,
      assigned_to: payload.assigned_to ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({
      full_name: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      source: payload.source,
      status: payload.status || 'New',
      score: payload.score ?? null,
      assigned_to: payload.assigned_to ?? null,
      created_by: payload.created_by ?? (await supabase.auth.getUser())?.data.user?.id,
      company_id: payload.company_id ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLead(id, updates) {
  if (!SUPABASE_ENABLED) {
    // No-op in local mode
    return { id, ...updates }
  }

  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteLead(id) {
  if (!SUPABASE_ENABLED) {
    // No-op in local mode
    return
  }

  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export async function moveLeadStage(id, newStatus) {
  return updateLead(id, { status: newStatus })
}

export async function fetchDashboardStats() {
  if (!SUPABASE_ENABLED) {
    // Local default stats
    return {
      totalLeads: 0,
      byStatus: LEAD_STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {}),
      avgScore: 0,
      bySource: {},
    }
  }

  // Simple example: count leads by status and total
  const { data: allLeads, error } = await supabase.from('leads').select('status, score, created_at, source')
  if (error) throw error

  const total = allLeads.length
  const byStatus = LEAD_STATUSES.reduce((acc, status) => {
    acc[status] = allLeads.filter((l) => l.status === status).length
    return acc
  }, {})

  const avgScore =
    total > 0 ? Math.round(allLeads.reduce((sum, l) => sum + (l.score || 0), 0) / total) : 0

  const bySource = allLeads.reduce((acc, l) => {
    const src = l.source || 'Unknown'
    acc[src] = (acc[src] || 0) + 1
    return acc
  }, {})

  return {
    totalLeads: total,
    byStatus,
    avgScore,
    bySource,
  }
}
