import Stripe from 'stripe'

const PLAN_LIMITS = {
  starter: { max_team_members: 3, max_leads_per_month: 500 },
  growth: { max_team_members: 10, max_leads_per_month: 5000 },
  pro: { max_team_members: 25, max_leads_per_month: 25000 },
  enterprise: { max_team_members: null, max_leads_per_month: null },
}

/** Default monthly amounts (cents) when no STRIPE_AMOUNT_*_CENTS env vars are set. */
const DEFAULT_PLAN_AMOUNTS_CENTS = {
  starter: 1900,
  growth: 4900,
  pro: 9900,
}

const PLAN_PRODUCT_LABEL = {
  starter: 'CRM Leads — Starter',
  growth: 'CRM Leads — Growth',
  pro: 'CRM Leads — Pro',
}

function getStripeCurrency() {
  return String(process.env.STRIPE_CURRENCY || 'usd').trim().toLowerCase() || 'usd'
}

export function centsForPlan(planCode) {
  const key = String(planCode || '').toLowerCase()
  const envKeys = {
    starter: process.env.STRIPE_AMOUNT_STARTER_CENTS,
    growth: process.env.STRIPE_AMOUNT_GROWTH_CENTS,
    pro: process.env.STRIPE_AMOUNT_PRO_CENTS,
  }
  const raw = envKeys[key]
  if (raw != null && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10)
    if (Number.isFinite(n) && n >= 50) return n
  }
  return DEFAULT_PLAN_AMOUNTS_CENTS[key] ?? DEFAULT_PLAN_AMOUNTS_CENTS.starter
}

function planCodeFromUnitAmount(unitAmount) {
  if (!Number.isFinite(unitAmount)) return null
  for (const code of ['starter', 'growth', 'pro']) {
    if (centsForPlan(code) === unitAmount) return code
  }
  return null
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return new Stripe(key)
}

export function stripeIsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
}

/** Checkout works with inline `price_data` — only the secret key is required (no Dashboard price IDs). */
export function checkoutPricesConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

function buildPriceIdToPlanMap() {
  const m = {}
  const optional = [
    [process.env.STRIPE_PRICE_STARTER, 'starter'],
    [process.env.STRIPE_PRICE_GROWTH, 'growth'],
    [process.env.STRIPE_PRICE_PRO, 'pro'],
  ]
  for (const [priceId, code] of optional) {
    if (priceId) m[priceId] = code
  }
  return m
}

function mapStripeStatusToCrm(stripeStatus) {
  const s = String(stripeStatus || '').toLowerCase()
  if (s === 'active') return 'active'
  if (s === 'trialing') return 'trialing'
  if (s === 'past_due' || s === 'unpaid') return 'past_due'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  if (s === 'paused') return 'paused'
  if (s === 'incomplete') return 'paused'
  if (s === 'incomplete_expired') return 'canceled'
  return 'paused'
}

export function publicAppOrigin(req) {
  const fromEnv = process.env.APP_PUBLIC_URL || process.env.VITE_APP_URL
  if (fromEnv) return String(fromEnv).replace(/\/$/, '')
  const origin = req.headers.origin || req.headers.referer
  if (origin) {
    try {
      return new URL(origin).origin
    } catch {
      /* ignore */
    }
  }
  return 'http://localhost:3000'
}

export async function readStripeRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8')
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    return null
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export async function createStripeCheckoutSession({ req, userId, userEmail, planCode }) {
  const stripe = getStripe()
  if (!stripe) {
    const err = new Error('Stripe checkout is not configured.')
    err.code = 'STRIPE_DISABLED'
    throw err
  }
  const code = String(planCode || '').toLowerCase()
  if (!['starter', 'growth', 'pro'].includes(code)) {
    const err = new Error('Invalid plan for checkout.')
    err.code = 'STRIPE_DISABLED'
    throw err
  }

  const unitAmount = centsForPlan(code)
  const currency = getStripeCurrency()
  const productName = PLAN_PRODUCT_LABEL[code] || `CRM Leads — ${code}`

  const origin = publicAppOrigin(req)
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: userEmail || undefined,
    client_reference_id: userId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: unitAmount,
          recurring: { interval: 'month' },
          product_data: {
            name: productName,
            metadata: {
              plan_code: code,
            },
          },
        },
      },
    ],
    success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/subscriptions?checkout=cancel`,
    subscription_data: {
      metadata: {
        supabase_user_id: userId,
        plan_code: code,
      },
    },
    metadata: {
      supabase_user_id: userId,
      plan_code: code,
    },
  })
  return { url: session.url }
}

export async function createStripePortalSession({ req, customerId }) {
  const stripe = getStripe()
  if (!stripe || !customerId) {
    const err = new Error('Billing portal is not available.')
    err.code = 'STRIPE_PORTAL_DISABLED'
    throw err
  }
  const origin = publicAppOrigin(req)
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/subscriptions`,
  })
  return { url: session.url }
}

async function upsertSubscriptionRow(supabaseAdmin, {
  userId,
  businessId,
  planCode,
  status,
  endsAtIso,
  stripeSubscriptionId,
  stripeCustomerId,
}) {
  const limits = PLAN_LIMITS[String(planCode || '').toLowerCase()] || PLAN_LIMITS.starter
  const basePayload = {
    user_id: userId,
    business_id: businessId,
    plan_code: String(planCode || 'starter').toLowerCase(),
    status,
    starts_at: new Date().toISOString(),
    ends_at: endsAtIso,
    max_team_members: limits.max_team_members,
    max_leads_per_month: limits.max_leads_per_month,
    notes: 'Synced from Stripe',
    created_by: userId,
  }

  const withStripePayload = {
    ...basePayload,
    stripe_subscription_id: stripeSubscriptionId || null,
    stripe_customer_id: stripeCustomerId || null,
  }

  let { error } = await supabaseAdmin
    .from('crm_user_subscriptions')
    .insert(withStripePayload)

  // Backward compatibility for DBs where Stripe columns were not added yet.
  if (error && /stripe_subscription_id|stripe_customer_id|column .* does not exist/i.test(String(error.message || ''))) {
    const retry = await supabaseAdmin
      .from('crm_user_subscriptions')
      .insert(basePayload)
    error = retry.error
  }

  if (error) {
    console.error('stripe sync insert error:', error.message)
  }
}

export async function finalizeStripeCheckoutSession({
  supabaseAdmin,
  sessionId,
  expectedUserId,
}) {
  const stripe = getStripe()
  if (!stripe) {
    const err = new Error('Stripe checkout is not configured.')
    err.code = 'STRIPE_DISABLED'
    throw err
  }
  if (!sessionId) {
    const err = new Error('Missing Stripe session_id.')
    err.code = 'MISSING_SESSION'
    throw err
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'subscription.items.data.price'],
  })

  const userId = session.client_reference_id || session.metadata?.supabase_user_id || null
  if (!userId || (expectedUserId && userId !== expectedUserId)) {
    const err = new Error('Checkout session does not belong to the current user.')
    err.code = 'SESSION_USER_MISMATCH'
    throw err
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || null
  let sub = session.subscription || null
  if (typeof sub === 'string') {
    sub = await stripe.subscriptions.retrieve(sub, { expand: ['items.data.price'] })
  }
  if (!sub || typeof sub === 'string') {
    const err = new Error('Stripe subscription not found for this checkout session.')
    err.code = 'SUB_NOT_FOUND'
    throw err
  }

  const item = sub.items?.data?.[0]
  const priceIdToPlan = buildPriceIdToPlanMap()
  const priceId = item?.price?.id
  const unitAmount = item?.price?.unit_amount
  const metaPlan = (sub.metadata?.plan_code || session.metadata?.plan_code || '').toLowerCase()
  const planCode =
    (metaPlan && ['starter', 'growth', 'pro'].includes(metaPlan) && metaPlan) ||
    (priceId && priceIdToPlan[priceId]) ||
    planCodeFromUnitAmount(unitAmount) ||
    'starter'

  const status = mapStripeStatusToCrm(sub.status)
  const endsAt = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null

  await supabaseAdmin
    .from('crm_users')
    .update({ stripe_customer_id: customerId || null })
    .eq('id', userId)

  const { data: prof } = await supabaseAdmin
    .from('crm_users')
    .select('business_id')
    .eq('id', userId)
    .maybeSingle()

  await upsertSubscriptionRow(supabaseAdmin, {
    userId,
    businessId: prof?.business_id || null,
    planCode,
    status,
    endsAtIso: endsAt,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
  })

  return {
    userId,
    planCode,
    status,
    endsAt,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customerId,
  }
}

export async function handleStripeWebhook(req, res, supabaseAdmin) {
  const stripe = getStripe()
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || !whSecret) {
    return res.status(503).send('Stripe webhook not configured.')
  }

  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).send('Missing stripe-signature')

  let raw
  try {
    raw = await readStripeRawBody(req)
  } catch (e) {
    return res.status(400).send(`Body read error: ${e.message}`)
  }
  if (!raw || raw.length === 0) {
    return res.status(400).send('Empty webhook body (raw payload required for signature verification).')
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret)
  } catch (e) {
    console.error('Stripe webhook signature error:', e.message)
    return res.status(400).send(`Webhook signature verification failed: ${e.message}`)
  }

  const priceIdToPlan = buildPriceIdToPlanMap()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.client_reference_id || session.metadata?.supabase_user_id
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
        if (!userId || !customerId || !subId) break

        await supabaseAdmin.from('crm_users').update({ stripe_customer_id: customerId }).eq('id', userId)

        const sub = await stripe.subscriptions.retrieve(subId, { expand: ['items.data.price'] })
        const item = sub.items?.data?.[0]
        const priceId = item?.price?.id
        const unitAmount = item?.price?.unit_amount
        const planFromMeta = sub.metadata?.plan_code || session.metadata?.plan_code
        const fromMeta = planFromMeta && String(planFromMeta).toLowerCase()
        const planCode =
          (fromMeta && ['starter', 'growth', 'pro'].includes(fromMeta) && fromMeta) ||
          (priceId && priceIdToPlan[priceId]) ||
          planCodeFromUnitAmount(unitAmount) ||
          'starter'
        const status = mapStripeStatusToCrm(sub.status)
        const endsAt = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null

        const { data: prof } = await supabaseAdmin.from('crm_users').select('business_id').eq('id', userId).maybeSingle()

        await upsertSubscriptionRow(supabaseAdmin, {
          userId,
          businessId: prof?.business_id || null,
          planCode,
          status,
          endsAtIso: endsAt,
          stripeSubscriptionId: subId,
          stripeCustomerId: customerId,
        })
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        const userId = sub.metadata?.supabase_user_id
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
        if (!userId) break

        const item = sub.items?.data?.[0]
        const priceId = item?.price?.id
        const unitAmount = item?.price?.unit_amount
        const fromMeta = sub.metadata?.plan_code && String(sub.metadata.plan_code).toLowerCase()
        const planCode =
          (fromMeta && ['starter', 'growth', 'pro'].includes(fromMeta) && fromMeta) ||
          (priceId && priceIdToPlan[priceId]) ||
          planCodeFromUnitAmount(unitAmount) ||
          'starter'
        const status = mapStripeStatusToCrm(sub.status)
        const endsAt = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null

        const { data: prof } = await supabaseAdmin.from('crm_users').select('business_id').eq('id', userId).maybeSingle()

        await upsertSubscriptionRow(supabaseAdmin, {
          userId,
          businessId: prof?.business_id || null,
          planCode,
          status,
          endsAtIso: endsAt,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: customerId,
        })
        break
      }
      default:
        break
    }
  } catch (e) {
    console.error('Stripe webhook handler error:', e)
    return res.status(500).json({ error: 'Webhook handler failed.' })
  }

  return res.status(200).json({ received: true })
}
