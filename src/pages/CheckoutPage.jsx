import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, ShieldCheck, Sparkles, BadgeCheck } from 'lucide-react'
import { startStripeCheckout } from '../services/subscriptionService'
import './CheckoutPage.css'

const PLAN_MAP = {
  starter: { name: 'Starter', amountText: '$19', amountCents: 1900, seats: 'Up to 3', leads: '500/mo' },
  growth: { name: 'Growth', amountText: '$49', amountCents: 4900, seats: 'Up to 10', leads: '5000/mo' },
  pro: { name: 'Pro', amountText: '$99', amountCents: 9900, seats: 'Up to 25', leads: '25000/mo' },
}

const CheckoutPage = ({ currentUser, userProfile }) => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [linkLoading, setLinkLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkoutUrl, setCheckoutUrl] = useState('')

  const role = String(userProfile?.role || '').toLowerCase()
  const planCode = String(searchParams.get('plan') || 'growth').toLowerCase()
  const plan = PLAN_MAP[planCode] || PLAN_MAP.growth

  const generateStripeLink = async () => {
    setError('')
    setCheckoutUrl('')
    if (role === 'super_admin') {
      setError('Super admin checkout is disabled.')
      return
    }
    setLinkLoading(true)
    try {
      const url = await startStripeCheckout(planCode)
      setCheckoutUrl(url)
    } catch (err) {
      setError(err.message || 'Could not generate Stripe payment link.')
    } finally {
      setLinkLoading(false)
    }
  }

  return (
    <div className="checkout-page animate-fade-in">
      <div className="checkout-card">
        <div className="checkout-top-glow" />
        <div className="checkout-header">
          <div className="checkout-kicker">
            <Sparkles size={14} />
            <span>Secure Billing</span>
          </div>
          <h2>Complete Your Subscription</h2>
          <p>Activate your plan instantly with Stripe's encrypted checkout.</p>
        </div>

        <div className="checkout-plan">
          <div className="checkout-plan-main">
            <span className="checkout-plan-label">Selected Plan</span>
            <strong>{plan.name}</strong>
            <span>{plan.amountText} / month</span>
          </div>
          <div className="checkout-plan-meta">
            <span>{plan.seats} seats</span>
            <span>{plan.leads} leads</span>
          </div>
        </div>

        <div className="checkout-benefits">
          <div className="checkout-benefit">
            <ShieldCheck size={16} />
            <span>256-bit secure Stripe payment</span>
          </div>
          <div className="checkout-benefit">
            <BadgeCheck size={16} />
            <span>Plan activates right after successful checkout</span>
          </div>
        </div>

        {error ? <div className="checkout-error">{error}</div> : null}

        <div className="checkout-link-section">
          <button
            type="button"
            className="btn-outline"
            onClick={generateStripeLink}
            disabled={linkLoading}
          >
            {linkLoading ? <Loader2 size={16} className="spinning" /> : null}
            {linkLoading ? 'Generating link...' : 'Generate Stripe Payment Link'}
          </button>
          {checkoutUrl ? (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noreferrer"
              className="checkout-stripe-link"
              title="Open Stripe checkout in new tab"
            >
              {checkoutUrl}
            </a>
          ) : (
            <p className="checkout-link-hint">Generate link first, then click it to open Stripe checkout.</p>
          )}
        </div>

        <div className="checkout-actions">
          <button type="button" className="btn-outline" onClick={() => navigate('/subscriptions')}>
            Back
          </button>
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage
