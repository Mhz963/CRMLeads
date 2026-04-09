import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Sparkles, Loader2 } from 'lucide-react'
import { finalizeStripeCheckout } from '../services/subscriptionService'
import './PaymentSuccessPage.css'

const REDIRECT_SECONDS = 4

const PaymentSuccessPage = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS)
  const [syncing, setSyncing] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let timer
    let mounted = true

    const run = async () => {
      const sessionId = String(searchParams.get('session_id') || '').trim()
      if (sessionId) {
        try {
          await finalizeStripeCheckout(sessionId)
        } catch (err) {
          if (!mounted) return
          setError(err.message || 'Payment is done but subscription sync failed. Please contact support.')
        }
      }
      if (!mounted) return
      setSyncing(false)
      timer = setInterval(() => {
        setSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            navigate('/dashboard', { replace: true })
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    run()
    return () => {
      mounted = false
      if (timer) clearInterval(timer)
    }
  }, [navigate, searchParams])

  return (
    <div className="payment-success-page animate-fade-in">
      <div className="payment-success-overlay" />
      <div className="payment-success-modal">
        <div className="payment-success-kicker">
          <Sparkles size={14} />
          <span>Payment Complete</span>
        </div>
        <CheckCircle2 size={58} className="payment-success-icon" />
        <h2>Payment Successful!</h2>
        <p>
          Your subscription is now active. We are syncing your billing details and preparing your workspace.
        </p>
        {syncing && (
          <div className="payment-success-sync">
            <Loader2 size={16} className="payment-success-spinning" />
            Syncing payment with your account...
          </div>
        )}
        {error && <div className="payment-success-error">{error}</div>}
        <div className="payment-success-redirect">
          {syncing ? 'Please wait...' : <>Redirecting to dashboard in <strong>{seconds}s</strong>...</>}
        </div>
        <button
          type="button"
          className="btn-primary-action"
          onClick={() => navigate('/dashboard', { replace: true })}
        >
          Go to Dashboard Now
        </button>
      </div>
    </div>
  )
}

export default PaymentSuccessPage
