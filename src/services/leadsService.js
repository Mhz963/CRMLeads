import { supabase } from './supabaseClient'

// Pipeline stages for NZ Demo CRM
export const PIPELINE_STAGES = ['New Lead', 'Contacted', 'Interested', 'Proposal', 'Closed']

// Lead sources
export const LEAD_SOURCES = ['Manual', 'Web Form', 'CSV Import', 'Website API', 'Google Maps', 'Referral', 'Social Media', 'Cold Call', 'Other']

// Smart tags
export const LEAD_TAGS = ['Hot', 'Needs Follow-up', 'High Value']

function normalizeLeadStatus(status) {
  // Backward compatibility for older rows created before "New Lead" became default.
  if (status === 'New') return 'New Lead'
  return status || 'New Lead'
}

function normalizeLeadRecord(lead) {
  return {
    ...lead,
    status: normalizeLeadStatus(lead?.status),
  }
}

async function currentUserId() {
  const { data } = await supabase.auth.getUser()
  return data?.user?.id ?? null
}

async function fallbackMoveLeadStage(id, newStatus) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Not authenticated')

  const response = await fetch('/api/move-lead-stage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id, newStatus }),
  })

  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    if (response.status === 404 || response.status === 405) {
      throw new Error(
        'Pipeline fallback endpoint is not deployed yet (HTTP 404/405). Run the latest RLS SQL update or deploy latest backend.'
      )
    }
    throw new Error(payload.error || `Failed to move lead stage (HTTP ${response.status})`)
  }

  return normalizeLeadRecord(payload.lead)
}

/* ─────────────────────  CRUD  ───────────────────── */

export async function fetchLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeLeadRecord)
}

export async function fetchLeadById(id) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return normalizeLeadRecord(data)
}

export async function createLead(payload) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('leads')
    .insert({
      full_name: payload.full_name,
      email: payload.email || null,
      phone: payload.phone || null,
      business_address: payload.business_address || null,
      website: payload.website || null,
      map_url: payload.map_url || null,
      google_rating: payload.google_rating ?? null,
      google_reviews: payload.google_reviews ?? null,
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
  return normalizeLeadRecord(data)
}

export async function updateLead(id, updates) {
  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return normalizeLeadRecord(data)
}

export async function deleteLead(id) {
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) throw error
}

export async function moveLeadStage(id, newStatus) {
  try {
    return await updateLead(id, { status: newStatus })
  } catch (err) {
    // RLS can make update return 0 rows (PGRST116). Use secure server fallback.
    if (err?.code === 'PGRST116') {
      return fallbackMoveLeadStage(id, newStatus)
    }
    throw err
  }
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

  const normalizedLeads = (allLeads || []).map((l) => ({
    ...l,
    status: normalizeLeadStatus(l.status),
  }))

  const total = normalizedLeads.length

  const byStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = normalizedLeads.filter(l => l.status === stage).length
    return acc
  }, {})

  const closed = byStage['Closed'] || 0
  const conversionRate = total > 0 ? Math.round((closed / total) * 100) : 0

  const bySource = normalizedLeads.reduce((acc, l) => {
    const src = l.source || 'Unknown'
    acc[src] = (acc[src] || 0) + 1
    return acc
  }, {})

  const byTag = normalizedLeads.reduce((acc, l) => {
    if (l.tag) acc[l.tag] = (acc[l.tag] || 0) + 1
    return acc
  }, {})

  // Leads created this week
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const newThisWeek = normalizedLeads.filter(l => new Date(l.created_at) >= oneWeekAgo).length

  return {
    totalLeads: total,
    byStage,
    conversionRate,
    bySource,
    byTag,
    newThisWeek,
  }
}
