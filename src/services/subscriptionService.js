import { supabase } from './supabaseClient'

async function authHeaders() {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Please sign in again.')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

async function parseApiResponse(response) {
  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || 'Subscription request failed.')
  }
  return payload
}

export async function fetchMySubscription() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', { method: 'GET', headers })
  const payload = await parseApiResponse(response)
  return payload.subscription || null
}

export async function fetchAllSubscriptions() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions?scope=all', { method: 'GET', headers })
  const payload = await parseApiResponse(response)
  return payload.subscriptions || []
}

export async function createSubscription(input) {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
  const payload = await parseApiResponse(response)
  return payload.subscription
}

export function isSubscriptionActive(subscription) {
  if (!subscription) return false
  const status = String(subscription.status || '').toLowerCase()
  if (status !== 'active' && status !== 'trialing') return false
  if (!subscription.ends_at) return true
  return new Date(subscription.ends_at).getTime() > Date.now()
}
