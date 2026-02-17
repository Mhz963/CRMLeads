import { supabase } from './supabaseClient'

// Pipeline stages for NZ Demo CRM
export const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal', 'Closed']

// Lead sources
export const LEAD_SOURCES = ['Manual', 'Web Form', 'CSV Import', 'Referral', 'Social Media', 'Cold Call', 'Other']

// Smart tags
export const LEAD_TAGS = ['Hot', 'Needs Follow-up', 'High Value']

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

/* ─────────────────────  CRUD  ───────────────────── */

export async function fetchLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchLeadById(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createLead(payload) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('leads')
    .insert({
      full_name: payload.full_name,
      email: payload.email || null,
      phone: payload.phone || null,
      source: payload.source || 'Manual',
      status: payload.status || 'New Lead',
      services: payload.services || null,
      user_ip: payload.user_ip || null,
      notes: payload.notes || null,
      tag: payload.tag || null,
      score: payload.score ?? null,
      assigned_to: payload.assigned_to ?? null,
      created_by: userId,
      company_id: payload.company_id ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateLead(id, updates) {
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLead(id) {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export async function moveLeadStage(id, newStatus) {
  return updateLead(id, { status: newStatus })
}

/* ─────────────────────  CSV IMPORT  ───────────────────── */

export async function importLeadsFromCSV(csvText) {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const results = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length !== headers.length) {
      errors.push(`Row ${i + 1}: column count mismatch`)
      continue
    }
    const row = {}
    headers.forEach((h, idx) => { row[h] = values[idx]?.trim() || '' })

    try {
      const lead = await createLead({
        full_name: row.name || row.full_name || row['contact name'] || row.fullname || '',
        phone: row.phone || row.telephone || row.mobile || '',
        email: row.email || '',
        services: row.services || row.service || '',
        source: 'CSV Import',
        notes: row.notes || row.note || '',
        status: 'New Lead',
      })
      results.push(lead)
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err.message}`)
    }
  }

  return { results, errors }
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

/* ─────────────────────  DASHBOARD STATS  ───────────────────── */

export async function fetchDashboardStats() {
  const { data: allLeads, error } = await supabase
    .from('leads')
    .select('status, score, created_at, source, tag')
  if (error) throw error

  const total = allLeads.length

  const byStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = allLeads.filter(l => l.status === stage).length
    return acc
  }, {})

  const closed = byStage['Closed'] || 0
  const conversionRate = total > 0 ? Math.round((closed / total) * 100) : 0

  const bySource = allLeads.reduce((acc, l) => {
    const src = l.source || 'Unknown'
    acc[src] = (acc[src] || 0) + 1
    return acc
  }, {})

  const byTag = allLeads.reduce((acc, l) => {
    if (l.tag) acc[l.tag] = (acc[l.tag] || 0) + 1
    return acc
  }, {})

  // Leads created this week
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const newThisWeek = allLeads.filter(l => new Date(l.created_at) >= oneWeekAgo).length

  return {
    totalLeads: total,
    byStage,
    conversionRate,
    bySource,
    byTag,
    newThisWeek,
  }
}
