import { supabase } from './supabaseClient'

async function authedRequest(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Not authenticated')
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const raw = await response.text()
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
  if (!response.ok || payload.success === false) throw new Error(payload.error || 'Request failed.')
  return payload
}

export async function submitBusinessRegistration(input) {
  const response = await fetch('/api/business-onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const raw = await response.text()
  let payload = {}
  try { payload = raw ? JSON.parse(raw) : {} } catch { payload = {} }
  if (!response.ok || payload.success === false) throw new Error(payload.error || 'Failed to submit request.')
  return payload.request
}

export async function fetchBusinessRequests() {
  const payload = await authedRequest('/api/business-onboarding?scope=requests', { method: 'GET' })
  return payload.requests || []
}

export async function fetchBusinessesForAdmin() {
  const payload = await authedRequest('/api/business-onboarding?scope=businesses', { method: 'GET' })
  return payload.businesses || []
}

export async function createBusinessDirect(input) {
  return authedRequest('/api/business-onboarding', {
    method: 'POST',
    body: JSON.stringify({ action: 'create_direct', ...input }),
  })
}

export async function updateBusinessDetails(input) {
  return authedRequest('/api/business-onboarding', {
    method: 'POST',
    body: JSON.stringify({ action: 'update_business', ...input }),
  })
}

export async function fetchMyBusinessInfo() {
  const payload = await authedRequest('/api/business-onboarding?scope=my-business', { method: 'GET' })
  return payload.business || null
}

export async function upsertMyBusinessInfo(input) {
  const payload = await authedRequest('/api/business-onboarding', {
    method: 'POST',
    body: JSON.stringify({ action: 'upsert_my_business', ...input }),
  })
  return payload.business || null
}

export async function reviewBusinessRequest({ request_id, decision, review_notes }) {
  const payload = await authedRequest('/api/business-onboarding', {
    method: 'POST',
    body: JSON.stringify({ action: 'review', request_id, decision, review_notes }),
  })
  return payload
}
