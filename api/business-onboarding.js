import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { canManageSubscriptions, fetchUserRole } from '../lib/access.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function randomPassword() {
  return `Biz@${crypto.randomBytes(4).toString('hex')}A1`
}

function randomApiKey() {
  return `bk_${crypto.randomBytes(18).toString('hex')}`
}

function randomUsername(businessName) {
  const base = String(businessName || 'business')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12) || 'business'
  return `${base}${crypto.randomBytes(2).toString('hex')}`
}

async function createBusinessOwnerBundle({
  supabaseAdmin,
  currentUserId,
  businessName,
  ownerName,
  ownerContactEmail,
  ownerContactPhone,
  desiredPlan,
}) {
  const tempPassword = randomPassword()
  const username = randomUsername(businessName)
  const loginEmail = `${username}@crm-owner.local`
  const apiKey = randomApiKey()

  const { data: createdAuth, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: ownerName, username },
  })
  if (createAuthErr || !createdAuth?.user?.id) {
    throw new Error(createAuthErr?.message || 'Failed to create auth user.')
  }

  const ownerUserId = createdAuth.user.id
  const { data: business, error: bizErr } = await supabaseAdmin
    .from('businesses')
    .insert({
      name: businessName,
      owner_user_id: ownerUserId,
      contact_email: ownerContactEmail || null,
      contact_phone: ownerContactPhone || null,
      status: 'active',
    })
    .select('*')
    .single()
  if (bizErr) throw new Error(bizErr.message || 'Failed to create business.')

  const { error: userErr2 } = await supabaseAdmin
    .from('crm_users')
    .upsert({
      id: ownerUserId,
      email: loginEmail,
      full_name: ownerName,
      role: 'admin',
      business_id: business.id,
    }, { onConflict: 'id' })
  if (userErr2) throw new Error(userErr2.message || 'Failed to create owner profile.')

  await supabaseAdmin.from('crm_user_subscriptions').insert({
    user_id: ownerUserId,
    business_id: business.id,
    plan_code: desiredPlan || 'starter',
    status: 'trialing',
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Created from super admin onboarding',
    created_by: currentUserId,
  })

  await supabaseAdmin.from('business_api_keys').insert({
    business_id: business.id,
    api_key: apiKey,
    is_enabled: true,
    created_by: currentUserId,
  })

  return {
    business,
    ownerUserId,
    username,
    loginEmail,
    tempPassword,
    apiKey,
  }
}

export default async function handler(req, res) {
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ success: false, error: 'Method not allowed.' })
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    // Public submission (no auth)
    if (req.method === 'POST' && !req.headers.authorization) {
      const body = parseMaybeJson(req.body)
      const businessName = String(body.business_name || '').trim()
      const ownerName = String(body.owner_name || '').trim()
      const ownerEmail = String(body.owner_email || '').trim().toLowerCase()
      const ownerPhone = String(body.owner_phone || '').trim()
      const desiredPlan = String(body.desired_plan || 'starter').trim().toLowerCase()
      const notes = String(body.notes || '').trim()

      if (!businessName || !ownerName || !ownerEmail) {
        return res.status(400).json({ success: false, error: 'business_name, owner_name and owner_email are required.' })
      }

      const { data, error } = await supabaseAdmin
        .from('business_requests')
        .insert({
          business_name: businessName,
          owner_name: ownerName,
          owner_email: ownerEmail,
          owner_phone: ownerPhone || null,
          desired_plan: desiredPlan,
          notes: notes || null,
          status: 'pending',
        })
        .select('*')
        .single()

      if (error) return res.status(500).json({ success: false, error: error.message })
      return res.status(200).json({ success: true, request: data })
    }

    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) return res.status(401).json({ success: false, error: 'Missing authorization token.' })

    const supabasePublic = getSupabasePublic()
    const { data: userData, error: userErr } = await supabasePublic.auth.getUser(token)
    const currentUserId = userData?.user?.id
    if (userErr || !currentUserId) return res.status(401).json({ success: false, error: 'Invalid session token.' })

    let { role, error: roleError } = await fetchUserRole(supabaseAdmin, currentUserId)
    if (roleError === 'User profile not found.') {
      const fallbackName = userData?.user?.user_metadata?.full_name || userData?.user?.email || 'User'
      const fallbackEmail = userData?.user?.email || null
      const { error: seedErr } = await supabaseAdmin
        .from('crm_users')
        .upsert({
          id: currentUserId,
          email: fallbackEmail,
          full_name: fallbackName,
          role: 'admin',
        }, { onConflict: 'id' })
      if (!seedErr) {
        const fetched = await fetchUserRole(supabaseAdmin, currentUserId)
        role = fetched.role
        roleError = fetched.error
      }
    }
    if (roleError || !role) {
      return res.status(403).json({ success: false, error: roleError || 'Access denied.' })
    }

    if (req.method === 'GET') {
      const scope = String(req.query.scope || '').trim()
      const canOwnBusiness = role === 'admin' || role === 'super_admin'

      if (scope === 'my-business') {
        if (!canOwnBusiness) {
          return res.status(403).json({ success: false, error: 'Business registration is limited to admin accounts.' })
        }
        const { data: meRow, error: meErr } = await supabaseAdmin
          .from('crm_users')
          .select('business_id')
          .eq('id', currentUserId)
          .maybeSingle()
        if (meErr) return res.status(500).json({ success: false, error: meErr.message })
        if (!meRow?.business_id) return res.status(200).json({ success: true, business: null })
        const { data: business, error: bizErr } = await supabaseAdmin
          .from('businesses')
          .select('*')
          .eq('id', meRow.business_id)
          .single()
        if (bizErr) return res.status(500).json({ success: false, error: bizErr.message })
        return res.status(200).json({ success: true, business })
      }
      if (scope === 'businesses') {
        if (!canManageSubscriptions(role)) {
          return res.status(403).json({ success: false, error: 'Super admin access required.' })
        }
        const { data: businesses, error } = await supabaseAdmin
          .from('businesses')
          .select('id, name, owner_user_id, contact_email, contact_phone, status, created_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) return res.status(500).json({ success: false, error: error.message })
        return res.status(200).json({ success: true, businesses: businesses || [] })
      }
      if (scope === 'requests') {
        if (!canManageSubscriptions(role)) {
          return res.status(403).json({ success: false, error: 'Super admin access required.' })
        }
        const { data: requests, error } = await supabaseAdmin
          .from('business_requests')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) return res.status(500).json({ success: false, error: error.message })
        return res.status(200).json({ success: true, requests: requests || [] })
      }
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid scope. Use scope=my-business, businesses, or requests.',
      })
    }

    const body = parseMaybeJson(req.body)
    const action = String(body.action || '').trim()
    const canOwnBusiness = role === 'admin' || role === 'super_admin'

    if (action === 'upsert_my_business') {
      if (!canOwnBusiness) {
        return res.status(403).json({ success: false, error: 'Business registration is limited to admin accounts.' })
      }
      const businessName = String(body.business_name || '').trim()
      const businessType = String(body.business_type || '').trim()
      const companySize = String(body.company_size || '').trim()
      const contactEmail = String(body.contact_email || '').trim()
      const contactPhone = String(body.contact_phone || '').trim()
      const city = String(body.city || '').trim()
      const country = String(body.country || '').trim()
      const timezone = String(body.timezone || '').trim()
      if (!businessName) {
        return res.status(400).json({ success: false, error: 'business_name is required.' })
      }

      const { data: meRow, error: meErr } = await supabaseAdmin
        .from('crm_users')
        .select('business_id')
        .eq('id', currentUserId)
        .maybeSingle()
      if (meErr) return res.status(500).json({ success: false, error: meErr.message })

      if (meRow?.business_id) {
        const { data: updatedBusiness, error: updErr } = await supabaseAdmin
          .from('businesses')
          .update({
            name: businessName,
            business_type: businessType || null,
            company_size: companySize || null,
            city: city || null,
            country: country || null,
            timezone: timezone || null,
            contact_email: contactEmail || null,
            contact_phone: contactPhone || null,
          })
          .eq('id', meRow.business_id)
          .select('*')
          .single()
        if (updErr) return res.status(500).json({ success: false, error: updErr.message })
        return res.status(200).json({ success: true, business: updatedBusiness })
      }

      const { data: business, error: createErr } = await supabaseAdmin
        .from('businesses')
        .insert({
          name: businessName,
          business_type: businessType || null,
          company_size: companySize || null,
          city: city || null,
          country: country || null,
          timezone: timezone || null,
          owner_user_id: currentUserId,
          contact_email: contactEmail || null,
          contact_phone: contactPhone || null,
          status: 'active',
        })
        .select('*')
        .single()
      if (createErr) return res.status(500).json({ success: false, error: createErr.message })

      const { error: linkErr } = await supabaseAdmin
        .from('crm_users')
        .update({ business_id: business.id })
        .eq('id', currentUserId)
      if (linkErr) return res.status(500).json({ success: false, error: linkErr.message })

      return res.status(200).json({ success: true, business })
    }

    if (action === 'create_direct') {
      if (!canManageSubscriptions(role)) {
        return res.status(403).json({ success: false, error: 'Super admin access required.' })
      }
      const businessName = String(body.business_name || '').trim()
      const ownerName = String(body.owner_name || '').trim()
      const ownerEmail = String(body.owner_email || '').trim().toLowerCase()
      const ownerPhone = String(body.owner_phone || '').trim()
      const desiredPlan = String(body.desired_plan || 'starter').trim().toLowerCase()
      if (!businessName || !ownerName) {
        return res.status(400).json({ success: false, error: 'business_name and owner_name are required.' })
      }
      const created = await createBusinessOwnerBundle({
        supabaseAdmin,
        currentUserId,
        businessName,
        ownerName,
        ownerContactEmail: ownerEmail,
        ownerContactPhone: ownerPhone,
        desiredPlan,
      })
      return res.status(200).json({
        success: true,
        status: 'approved',
        credentials: {
          username: created.username,
          login_email: created.loginEmail,
          temp_password: created.tempPassword,
          business_api_key: created.apiKey,
        },
        business: created.business,
      })
    }

    if (action === 'update_business') {
      if (!canManageSubscriptions(role)) {
        return res.status(403).json({ success: false, error: 'Super admin access required.' })
      }
      const businessId = String(body.business_id || '').trim()
      if (!businessId) return res.status(400).json({ success: false, error: 'business_id is required.' })
      const updatePayload = {
        name: body.name ? String(body.name).trim() : undefined,
        business_type: body.business_type ? String(body.business_type).trim() : undefined,
        company_size: body.company_size ? String(body.company_size).trim() : undefined,
        city: body.city ? String(body.city).trim() : undefined,
        country: body.country ? String(body.country).trim() : undefined,
        timezone: body.timezone ? String(body.timezone).trim() : undefined,
        contact_email: body.contact_email ? String(body.contact_email).trim() : null,
        contact_phone: body.contact_phone ? String(body.contact_phone).trim() : null,
        status: body.status ? String(body.status).trim() : undefined,
      }
      const cleaned = Object.fromEntries(Object.entries(updatePayload).filter(([, v]) => v !== undefined))
      const { data: business, error: updateErr } = await supabaseAdmin
        .from('businesses')
        .update(cleaned)
        .eq('id', businessId)
        .select('*')
        .single()
      if (updateErr) return res.status(500).json({ success: false, error: updateErr.message })
      return res.status(200).json({ success: true, business })
    }

    if (action !== 'review') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid action. Expected one of: upsert_my_business, create_direct, update_business, review.',
      })
    }

    const requestId = String(body.request_id || '').trim()
    if (!canManageSubscriptions(role)) {
      return res.status(403).json({ success: false, error: 'Super admin access required.' })
    }
    if (!requestId) {
      return res.status(400).json({ success: false, error: 'request_id is required for action=review.' })
    }
    const decision = String(body.decision || '').trim().toLowerCase()
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, error: 'decision must be approved or rejected.' })
    }

    const { data: requestRow, error: requestErr } = await supabaseAdmin
      .from('business_requests')
      .select('*')
      .eq('id', requestId)
      .single()
    if (requestErr || !requestRow) return res.status(404).json({ success: false, error: 'Business request not found.' })
    if (requestRow.status !== 'pending') return res.status(400).json({ success: false, error: 'Request already reviewed.' })

    if (decision === 'rejected') {
      const { error: rejErr } = await supabaseAdmin
        .from('business_requests')
        .update({
          status: 'rejected',
          review_notes: body.review_notes ? String(body.review_notes).trim() : null,
          reviewed_by: currentUserId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
      if (rejErr) return res.status(500).json({ success: false, error: rejErr.message })
      return res.status(200).json({ success: true, status: 'rejected' })
    }

    const created = await createBusinessOwnerBundle({
      supabaseAdmin,
      currentUserId,
      businessName: requestRow.business_name,
      ownerName: requestRow.owner_name,
      ownerContactEmail: requestRow.owner_email,
      ownerContactPhone: requestRow.owner_phone,
      desiredPlan: requestRow.desired_plan || 'starter',
    })

    const { error: apprErr } = await supabaseAdmin
      .from('business_requests')
      .update({
        status: 'approved',
        approved_business_id: created.business.id,
        approved_user_id: created.ownerUserId,
        generated_temp_password: created.tempPassword,
        generated_api_key: created.apiKey,
        review_notes: `Generated username: ${created.username}`,
        reviewed_by: currentUserId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (apprErr) return res.status(500).json({ success: false, error: apprErr.message })

    return res.status(200).json({
      success: true,
      status: 'approved',
      credentials: {
        username: created.username,
        login_email: created.loginEmail,
        temp_password: created.tempPassword,
        business_api_key: created.apiKey,
      },
    })
  } catch (err) {
    console.error('business-onboarding error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error.' })
  }
}
