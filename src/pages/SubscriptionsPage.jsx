import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Loader2, CreditCard } from 'lucide-react'
import { jsPDF } from 'jspdf'
import {
  fetchInvoices,
  fetchMySubscription,
  startStripeBillingPortal,
} from '../services/subscriptionService'
import './SubscriptionsPage.css'

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Essentials',
    gradient: 'sub-grad-1',
    popular: false,
    maxTeam: 3,
    maxLeads: 500,
    rows: [
      { label: 'Monthly price', value: '$19' },
      { label: 'Support', value: 'Standard' },
      { label: 'Reporting', value: 'Core dashboards' },
      { label: 'Team seats', value: '1' },
      { label: 'Lead capture', value: 'Web + manual' },
      { label: 'Pipelines', value: '1' },
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'Most teams',
    gradient: 'sub-grad-2',
    popular: true,
    maxTeam: 10,
    maxLeads: 5000,
    rows: [
      { label: 'Monthly price', value: '$49' },
      { label: 'Support', value: 'Priority email' },
      { label: 'Reporting', value: 'Advanced analytics' },
      { label: 'Team seats', value: '5' },
      { label: 'Lead capture', value: 'API + forms + CSV' },
      { label: 'Pipelines', value: '3' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Scale',
    gradient: 'sub-grad-3',
    popular: false,
    maxTeam: 25,
    maxLeads: 25000,
    rows: [
      { label: 'Monthly price', value: '$99' },
      { label: 'Support', value: 'Priority + SLA' },
      { label: 'Reporting', value: 'Custom views + export' },
      { label: 'Team seats', value: '15' },
      { label: 'Lead capture', value: 'Full integrations' },
      { label: 'Pipelines', value: 'Unlimited' },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Organization',
    gradient: 'sub-grad-4',
    popular: false,
    maxTeam: null,
    maxLeads: null,
    rows: [
      { label: 'Monthly price', value: 'Custom' },
      { label: 'Support', value: 'Dedicated' },
      { label: 'Reporting', value: 'BI + API' },
      { label: 'Team seats', value: 'Unlimited' },
      { label: 'Lead capture', value: 'White‑label + SSO' },
      { label: 'Pipelines', value: 'Unlimited' },
    ],
  },
]

const SubscriptionsPage = ({ currentUser, userProfile }) => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState('growth')
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)
  const [stripeCheckoutReady, setStripeCheckoutReady] = useState(false)
  const [latestInvoice, setLatestInvoice] = useState(null)

  const role = userProfile?.role
  const isSuperAdmin = role === 'super_admin'

  useEffect(() => {
    const checkout = searchParams.get('checkout')
    if (!checkout) return
    if (checkout === 'success') setError(null)
    if (checkout === 'cancel') {
      setError('Checkout was canceled. You can choose a plan again anytime.')
    }
    const next = new URLSearchParams(searchParams)
    next.delete('checkout')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { subscription, stripe_customer_id: custId, stripe_checkout_ready: ready } = await fetchMySubscription()
        const invoiceRows = await fetchInvoices()
        if (cancelled) return
        if (subscription?.plan_code) {
          const code = String(subscription.plan_code).toLowerCase()
          if (PLANS.some((p) => p.id === code)) setSelectedId(code)
        }
        setStripeCustomerId(custId || null)
        setStripeCheckoutReady(Boolean(ready))
        setLatestInvoice((invoiceRows && invoiceRows.length > 0) ? invoiceRows[0] : null)
      } catch {
        /* ignore */
      }
    })()
    return () => { cancelled = true }
  }, [])

  const selectedPlan = useMemo(() => PLANS.find((p) => p.id === selectedId) || PLANS[1], [selectedId])

  const handleNext = () => {
    setError(null)
    if (isSuperAdmin) {
      navigate('/platform')
      return
    }
    if (selectedPlan.id === 'enterprise') {
      setError('Enterprise is billed custom—contact sales to finalize your workspace.')
      return
    }
    if (!currentUser?.id) {
      setError('You must be signed in to continue.')
      return
    }
    navigate(`/checkout?plan=${encodeURIComponent(selectedPlan.id)}`)
  }

  const handleManageBilling = async () => {
    setError(null)
    setPortalLoading(true)
    try {
      const url = await startStripeBillingPortal()
      window.location.assign(url)
    } catch (err) {
      setError(err.message || 'Could not open billing portal.')
    } finally {
      setPortalLoading(false)
    }
  }

  const handleDownloadLatestInvoice = () => {
    if (!latestInvoice) {
      setError('No invoice available to download yet.')
      return
    }
    const row = latestInvoice
    const ref = `INV-${String(row.id || '').replace(/-/g, '').slice(0, 10).toUpperCase() || 'N/A'}`
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text('Invoice Receipt', 14, 20)
    doc.setFontSize(11)
    doc.text(`Invoice Ref: ${ref}`, 14, 34)
    doc.text(`Plan: ${String(row.plan_code || 'starter')}`, 14, 42)
    doc.text(`Status: ${String(row.status || 'pending')}`, 14, 50)
    doc.text(`Amount: ${(row.currency || 'usd').toUpperCase()} ${((row.amount_cents || 0) / 100).toFixed(2)}`, 14, 58)
    doc.text(`Created: ${row.created_at ? new Date(row.created_at).toLocaleString() : '—'}`, 14, 66)
    doc.text(`Due/Paid: ${(row.paid_at || row.due_at) ? new Date(row.paid_at || row.due_at).toLocaleString() : '—'}`, 14, 74)
    doc.save(`${ref}.pdf`)
  }

  return (
    <div className="subscription-page animate-fade-in">
      <div className="subscription-shell">
        <div className="subscription-panel">
          <p className="subscription-step">STEP 1 OF 4</p>
          <h1 className="subscription-title">Choose the plan that&apos;s right for you</h1>

          {isSuperAdmin && (
            <div className="subscription-banner">
              Super admin accounts are not billed. You can still preview plans; Next sends you to the platform.
            </div>
          )}

          {stripeCheckoutReady && !isSuperAdmin && (
            <div className="subscription-stripe-hint">
              Secure checkout powered by Stripe. After payment, your plan syncs automatically.
            </div>
          )}

          {error && <div className="subscription-error">{error}</div>}

          <div className="subscription-cards">
            {PLANS.map((plan) => {
              const isSelected = plan.id === selectedId
              return (
                <button
                  key={plan.id}
                  type="button"
                  className={`subscription-card ${isSelected ? 'is-selected' : ''} ${plan.popular ? 'is-popular' : ''}`}
                  onClick={() => setSelectedId(plan.id)}
                >
                  {plan.popular && <span className="subscription-popular-badge">Most Popular</span>}
                  <div className={`subscription-card-head ${plan.gradient}`}>
                    {isSelected && (
                      <span className="subscription-card-check" aria-hidden>
                        <Check size={18} strokeWidth={3} />
                      </span>
                    )}
                    <div className="subscription-card-name">{plan.name}</div>
                    <div className="subscription-card-tagline">{plan.tagline}</div>
                  </div>
                  <div className="subscription-card-body">
                    {plan.rows.map((row) => (
                      <div key={row.label} className="subscription-row">
                        <span className="subscription-row-label">{row.label}</span>
                        <span className="subscription-row-value">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>

          <p className="subscription-legal">
            Prices shown are for illustration unless Stripe checkout is enabled with live prices. Feature availability may vary by plan.
            Your workspace limits follow the plan recorded after successful payment.
          </p>

          <div className="subscription-actions-row">
            {stripeCustomerId && !isSuperAdmin && (
              <button
                type="button"
                className="subscription-portal"
                onClick={handleManageBilling}
                disabled={portalLoading}
              >
                {portalLoading ? <Loader2 size={18} className="subscription-next-spinner" /> : <CreditCard size={18} />}
                Manage billing
              </button>
            )}
            <button
              type="button"
              className="subscription-next"
              onClick={handleNext}
            >
              Next
            </button>
            <button
              type="button"
              className="subscription-portal"
              onClick={handleDownloadLatestInvoice}
            >
              Download invoice
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionsPage
