import { createClient } from '@supabase/supabase-js'
import { canManageSubscriptions, fetchLatestSubscription, fetchUserRole } from '../lib/access.js'
import {
  handleStripeWebhook,
  createStripeCheckoutSession,
  createStripePortalSession,
  checkoutPricesConfigured,
  finalizeStripeCheckoutSession,
} from '../lib/stripeBilling.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, stripe-signature',
  'Access-Control-Max-Age': '86400',
}

function getSupabasePublic() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function getSupabaseAdmin() {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function parseMaybeJson(input) {
  if (!input) return {}
  if (typeof input === 'string') {
    try { return JSON.parse(input) } catch { return {} }
  }
  return input
}

async function sendEmailViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL || 'CRM Leads <no-reply@crmleads.app>'
  if (!apiKey || !to) return { sent: false, reason: 'email_not_configured' }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  })

  if (!response.ok) {
    const raw = await response.text()
    throw new Error(`Email send failed: ${raw || response.status}`)
  }
  return { sent: true }
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()

  /* Stripe webhooks: same path, no Bearer auth (verified by signature) */
  if (req.method === 'POST' && req.headers['stripe-signature']) {
    try {
      const supabaseAdmin = getSupabaseAdmin()
      return await handleStripeWebhook(req, res, supabaseAdmin)
    } catch (err) {
      console.error('Stripe webhook outer error:', err)
      return res.status(500).send('Webhook error.')
    }
  }

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed.' })
  }

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) return res.status(401).json({ success: false, error: 'Missing authorization token.' })

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    const userId = userData?.user?.id
    if (userErr || !userId) return res.status(401).json({ success: false, error: 'Invalid session token.' })

    const supabaseAdmin = getSupabaseAdmin()
    const { role, error: roleError } = await fetchUserRole(supabaseAdmin, userId)
    if (roleError) return res.status(403).json({ success: false, error: roleError })

    if (req.method === 'GET') {
      if (String(req.query.scope || '') === 'invoices') {
        let query = supabaseAdmin
          .from('crm_invoices')
          .select('id, business_id, user_id, plan_code, amount_cents, currency, status, due_at, paid_at, email_sent_at, reminder_sent_at, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (!canManageSubscriptions(role)) {
          query = query.eq('user_id', userId)
        }
        const { data, error } = await query
        if (error) return res.status(500).json({ success: false, error: error.message })
        return res.status(200).json({ success: true, invoices: data || [] })
      }
      if (String(req.query.scope || '') === 'history') {
        const { data, error } = await supabaseAdmin
          .from('crm_user_subscriptions')
          .select('id, user_id, plan_code, status, starts_at, ends_at, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(200)
        if (error) return res.status(500).json({ success: false, error: error.message })
        return res.status(200).json({ success: true, history: data || [] })
      }
      if (canManageSubscriptions(role) && String(req.query.scope || '') === 'all') {
        const { data, error } = await supabaseAdmin
          .from('crm_user_subscriptions')
          .select('id, user_id, plan_code, status, starts_at, ends_at, max_team_members, max_leads_per_month, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) return res.status(500).json({ success: false, error: error.message })
        return res.status(200).json({ success: true, subscriptions: data || [] })
      }

      const { subscription, error } = await fetchLatestSubscription(supabaseAdmin, userId)
      if (error) return res.status(500).json({ success: false, error })

      const { data: cu } = await supabaseAdmin
        .from('crm_users')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle()

      return res.status(200).json({
        success: true,
        subscription,
        stripe_customer_id: cu?.stripe_customer_id || null,
        stripe_checkout_ready: checkoutPricesConfigured(),
      })
    }

    const body = parseMaybeJson(req.body)
    const action = String(body.action || '').trim()

    if (action === 'create_invoice') {
      if (!canManageSubscriptions(role)) {
        return res.status(403).json({ success: false, error: 'Super admin access required.' })
      }
      const businessId = String(body.business_id || '').trim()
      const planCode = String(body.plan_code || 'starter').trim().toLowerCase()
      const amountCents = Number(body.amount_cents)
      const dueAt = body.due_at ? new Date(body.due_at).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      if (!businessId || !Number.isFinite(amountCents) || amountCents <= 0) {
        return res.status(400).json({ success: false, error: 'business_id and valid amount_cents are required.' })
      }

      const { data: biz, error: bizErr } = await supabaseAdmin
        .from('businesses')
        .select('id, name, owner_user_id, contact_email')
        .eq('id', businessId)
        .single()
      if (bizErr || !biz) return res.status(404).json({ success: false, error: 'Business not found.' })

      const { data: owner } = await supabaseAdmin
        .from('crm_users')
        .select('id, full_name, email')
        .eq('id', biz.owner_user_id)
        .maybeSingle()

      const invoicePayload = {
        business_id: biz.id,
        user_id: biz.owner_user_id,
        plan_code: planCode,
        amount_cents: Math.round(amountCents),
        currency: String(body.currency || 'usd').toLowerCase(),
        status: 'pending',
        due_at: dueAt,
        notes: body.notes ? String(body.notes).trim() : null,
        created_by: userId,
      }

      const { data: invoice, error: invErr } = await supabaseAdmin
        .from('crm_invoices')
        .insert(invoicePayload)
        .select('*')
        .single()
      if (invErr) return res.status(500).json({ success: false, error: invErr.message })

      try {
        const recipient = biz.contact_email || owner?.email || null
        if (recipient) {
          await sendEmailViaResend({
            to: recipient,
            subject: `New Invoice - ${biz.name}`,
            html: `<h2>New Invoice</h2><p>Business: <strong>${biz.name}</strong></p><p>Plan: <strong>${planCode}</strong></p><p>Amount: <strong>${invoice.currency.toUpperCase()} ${(invoice.amount_cents / 100).toFixed(2)}</strong></p><p>Due: <strong>${new Date(invoice.due_at).toLocaleDateString()}</strong></p>`,
          })
          await supabaseAdmin.from('crm_invoices').update({ email_sent_at: new Date().toISOString() }).eq('id', invoice.id)
        }
      } catch (mailErr) {
        console.error('invoice email error:', mailErr)
      }

      return res.status(200).json({ success: true, invoice })
    }

    if (action === 'mark_invoice_paid') {
      if (!canManageSubscriptions(role)) {
        return res.status(403).json({ success: false, error: 'Super admin access required.' })
      }
      const invoiceId = String(body.invoice_id || '').trim()
      if (!invoiceId) return res.status(400).json({ success: false, error: 'invoice_id is required.' })

      const { data: invoice, error: invoiceErr } = await supabaseAdmin
        .from('crm_invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()
      if (invoiceErr || !invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' })
      if (String(invoice.status) === 'paid') return res.status(200).json({ success: true, invoice })

      const paidAt = new Date().toISOString()
      const { data: updatedInvoice, error: updErr } = await supabaseAdmin
        .from('crm_invoices')
        .update({ status: 'paid', paid_at: paidAt, updated_at: paidAt })
        .eq('id', invoiceId)
        .select('*')
        .single()
      if (updErr) return res.status(500).json({ success: false, error: updErr.message })

      const endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await supabaseAdmin.from('crm_user_subscriptions').insert({
        user_id: invoice.user_id,
        business_id: invoice.business_id,
        plan_code: invoice.plan_code || 'starter',
        status: 'active',
        starts_at: paidAt,
        ends_at: endsAt,
        notes: `Activated from invoice ${invoice.id}`,
        created_by: userId,
      })

      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name, contact_email')
        .eq('id', invoice.business_id)
        .maybeSingle()
      const { data: owner } = await supabaseAdmin
        .from('crm_users')
        .select('email')
        .eq('id', invoice.user_id)
        .maybeSingle()

      try {
        const recipient = biz?.contact_email || owner?.email || null
        if (recipient) {
          await sendEmailViaResend({
            to: recipient,
            subject: `Payment Received - ${biz?.name || 'Your Business'}`,
            html: `<h2>Payment Received</h2><p>Your invoice has been marked as paid.</p><p>Plan <strong>${invoice.plan_code}</strong> is now active.</p>`,
          })
        }
      } catch (mailErr) {
        console.error('paid email error:', mailErr)
      }

      return res.status(200).json({ success: true, invoice: updatedInvoice })
    }

    if (action === 'send_expiry_alerts') {
      const cronSecretHeader = String(req.headers['x-cron-secret'] || '')
      const cronAuthorized = process.env.CRON_SECRET && cronSecretHeader === process.env.CRON_SECRET
      if (!canManageSubscriptions(role) && !cronAuthorized) {
        return res.status(403).json({ success: false, error: 'Super admin access required.' })
      }
      const days = Number(body.days_before ?? 3)
      const now = Date.now()
      const maxTs = new Date(now + days * 24 * 60 * 60 * 1000).toISOString()
      const { data: subs, error: subsErr } = await supabaseAdmin
        .from('crm_user_subscriptions')
        .select('id, user_id, business_id, plan_code, status, ends_at')
        .in('status', ['active', 'trialing'])
        .lte('ends_at', maxTs)
        .gte('ends_at', new Date(now).toISOString())
      if (subsErr) return res.status(500).json({ success: false, error: subsErr.message })

      let sent = 0
      for (const sub of subs || []) {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('name, contact_email')
          .eq('id', sub.business_id)
          .maybeSingle()
        const { data: owner } = await supabaseAdmin
          .from('crm_users')
          .select('email')
          .eq('id', sub.user_id)
          .maybeSingle()
        const recipient = biz?.contact_email || owner?.email || null
        if (!recipient) continue
        try {
          await sendEmailViaResend({
            to: recipient,
            subject: `Subscription Expiry Reminder - ${biz?.name || 'CRM Leads'}`,
            html: `<h2>Subscription Expiry Reminder</h2><p>Your <strong>${sub.plan_code}</strong> subscription is ending on <strong>${new Date(sub.ends_at).toLocaleDateString()}</strong>.</p><p>Please renew to avoid interruption.</p>`,
          })
          sent += 1
        } catch (mailErr) {
          console.error('expiry reminder error:', mailErr)
        }
      }
      return res.status(200).json({ success: true, sent, checked: (subs || []).length })
    }

    if (action === 'create_stripe_checkout') {
      const selfServeRoles = new Set(['admin', 'business_member', 'team_member', 'super_admin'])
      if (!selfServeRoles.has(role)) {
        return res.status(403).json({ success: false, error: 'Checkout is not available for your role.' })
      }
      if (role === 'super_admin') {
        return res.status(400).json({ success: false, error: 'Super admin checkout is not required.' })
      }
      const planCode = String(body.plan_code || '').trim().toLowerCase()
      if (!['starter', 'growth', 'pro'].includes(planCode)) {
        return res.status(400).json({ success: false, error: 'Invalid plan for Stripe checkout.' })
      }
      try {
        const { url } = await createStripeCheckoutSession({
          req,
          userId,
          userEmail: userData?.user?.email,
          planCode,
        })
        return res.status(200).json({ success: true, url })
      } catch (e) {
        if (e.code === 'STRIPE_DISABLED') {
          return res.status(503).json({
            success: false,
            code: 'STRIPE_DISABLED',
            error: e.message || 'Stripe billing is not configured.',
          })
        }
        console.error('create_stripe_checkout:', e)
        return res.status(500).json({ success: false, error: e.message || 'Checkout failed.' })
      }
    }

    if (action === 'create_stripe_portal') {
      const selfServeRoles = new Set(['admin', 'business_member', 'team_member'])
      if (!selfServeRoles.has(role)) {
        return res.status(403).json({ success: false, error: 'Portal is not available for your role.' })
      }
      const { data: cu } = await supabaseAdmin
        .from('crm_users')
        .select('stripe_customer_id')
        .eq('id', userId)
        .maybeSingle()
      const customerId = cu?.stripe_customer_id
      if (!customerId) {
        return res.status(400).json({ success: false, error: 'No Stripe customer on file yet. Complete checkout first.' })
      }
      try {
        const { url } = await createStripePortalSession({ req, customerId })
        return res.status(200).json({ success: true, url })
      } catch (e) {
        console.error('create_stripe_portal:', e)
        return res.status(500).json({ success: false, error: e.message || 'Portal failed.' })
      }
    }

    if (action === 'finalize_stripe_checkout') {
      const selfServeRoles = new Set(['admin', 'business_member', 'team_member', 'super_admin'])
      if (!selfServeRoles.has(role)) {
        return res.status(403).json({ success: false, error: 'Checkout finalize is not available for your role.' })
      }
      const sessionId = String(body.session_id || '').trim()
      if (!sessionId) {
        return res.status(400).json({ success: false, error: 'Missing session_id.' })
      }
      try {
        const result = await finalizeStripeCheckoutSession({
          supabaseAdmin,
          sessionId,
          expectedUserId: userId,
        })
        return res.status(200).json({ success: true, result })
      } catch (e) {
        console.error('finalize_stripe_checkout:', e)
        return res.status(500).json({ success: false, error: e.message || 'Failed to finalize checkout.' })
      }
    }

    const isSuper = canManageSubscriptions(role)
    const selfServeRoles = new Set(['admin', 'business_member', 'team_member', 'super_admin'])

    let targetUserId = String(body.user_id || '').trim()
    if (!isSuper) {
      if (!selfServeRoles.has(role)) {
        return res.status(403).json({ success: false, error: 'Subscription checkout is not available for your role.' })
      }
      const requested = String(body.user_id || '').trim()
      if (requested && requested !== userId) {
        return res.status(403).json({ success: false, error: 'You can only manage your own subscription.' })
      }
      targetUserId = userId
    } else {
      if (!targetUserId) {
        return res.status(400).json({ success: false, error: 'Missing user_id.' })
      }
    }

    const status = String(body.status || 'active').trim().toLowerCase()
    const planCode = String(body.plan_code || 'starter').trim().toLowerCase()
    const allowedStatuses = new Set(['trialing', 'active', 'past_due', 'canceled', 'paused'])
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ success: false, error: 'Invalid subscription status.' })
    }

    const startsAt = body.starts_at ? new Date(body.starts_at).toISOString() : new Date().toISOString()
    const endsAt = body.ends_at ? new Date(body.ends_at).toISOString() : null

    const { data: profileRow } = await supabaseAdmin
      .from('crm_users')
      .select('business_id')
      .eq('id', targetUserId)
      .maybeSingle()
    const businessId = profileRow?.business_id || null

    const { data, error } = await supabaseAdmin
      .from('crm_user_subscriptions')
      .insert({
        user_id: targetUserId,
        business_id: businessId,
        plan_code: planCode,
        status,
        starts_at: startsAt,
        ends_at: endsAt,
        max_team_members: Number.isFinite(Number(body.max_team_members)) ? Number(body.max_team_members) : null,
        max_leads_per_month: Number.isFinite(Number(body.max_leads_per_month)) ? Number(body.max_leads_per_month) : null,
        notes: body.notes ? String(body.notes).trim() : null,
        created_by: userId,
      })
      .select('*')
      .single()

    if (error) return res.status(500).json({ success: false, error: error.message })
    return res.status(200).json({ success: true, subscription: data })
  } catch (err) {
    console.error('subscriptions API error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
