import { supabase } from './supabaseClient'

/** Stripe publishable key (`pk_...`) for client-side Stripe.js when needed. Checkout redirect works without it. */
export function getStripePublishableKey() {
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || ''
}

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
    const err = new Error(payload.error || 'Subscription request failed.')
    if (payload.code) err.code = payload.code
    throw err
  }
  return payload
}

/** @returns {{ subscription: object|null, stripe_customer_id: string|null, stripe_checkout_ready: boolean }} */
export async function fetchMySubscription() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', { method: 'GET', headers })
  const payload = await parseApiResponse(response)
  return {
    subscription: payload.subscription || null,
    stripe_customer_id: payload.stripe_customer_id ?? null,
    stripe_checkout_ready: Boolean(payload.stripe_checkout_ready),
  }
}

export async function fetchAllSubscriptions() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions?scope=all', { method: 'GET', headers })
  const payload = await parseApiResponse(response)
  return payload.subscriptions || []
}

export async function fetchSubscriptionHistory() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions?scope=history', { method: 'GET', headers })
  const payload = await parseApiResponse(response)
  return payload.history || []
}

export async function fetchInvoices() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions?scope=invoices', { method: 'GET', headers })
  const payload = await parseApiResponse(response)
  return payload.invoices || []
}

export async function createInvoice(input) {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create_invoice', ...input }),
  })
  const payload = await parseApiResponse(response)
  return payload.invoice || null
}

export async function markInvoicePaid(invoiceId) {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'mark_invoice_paid', invoice_id: invoiceId }),
  })
  const payload = await parseApiResponse(response)
  return payload.invoice || null
}

export async function sendExpiryAlerts(daysBefore = 3) {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'send_expiry_alerts', days_before: daysBefore }),
  })
  const payload = await parseApiResponse(response)
  return payload
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

export async function startStripeCheckout(planCode) {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create_stripe_checkout', plan_code: planCode }),
  })
  const payload = await parseApiResponse(response)
  return payload.url
}

export async function startStripeBillingPortal() {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'create_stripe_portal' }),
  })
  const payload = await parseApiResponse(response)
  return payload.url
}

export async function finalizeStripeCheckout(sessionId) {
  const headers = await authHeaders()
  const response = await fetch('/api/subscriptions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'finalize_stripe_checkout', session_id: sessionId }),
  })
  const payload = await parseApiResponse(response)
  return payload.result || null
}

export function isSubscriptionActive(subscription) {
  if (!subscription) return false
  const status = String(subscription.status || '').toLowerCase()
  if (status !== 'active' && status !== 'trialing') return false
  if (!subscription.ends_at) return true
  return new Date(subscription.ends_at).getTime() > Date.now()
}
