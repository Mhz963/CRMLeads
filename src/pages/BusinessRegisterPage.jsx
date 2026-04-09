import { useState } from 'react'
import { submitBusinessRegistration } from '../services/businessOnboardingService'
import './AuthPage.css'

const EMPTY = {
  business_name: '',
  owner_name: '',
  owner_email: '',
  owner_phone: '',
  desired_plan: 'starter',
  notes: '',
}

const BusinessRegisterPage = () => {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErr('')
    setMsg('')
    try {
      await submitBusinessRegistration(form)
      setMsg('Request submitted successfully. Super admin will review and send credentials after approval.')
      setForm(EMPTY)
    } catch (error) {
      setErr(error.message || 'Failed to submit request.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container" style={{ maxWidth: '720px' }}>
        <div className="auth-card">
          <div className="auth-header">
            <h1>Business Registration</h1>
            <p>Apply for your CRM workspace. Super admin will approve or reject your request.</p>
          </div>
          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-field">
              <label>Business Name</label>
              <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} required />
            </div>
            <div className="auth-field">
              <label>Owner Name</label>
              <input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} required />
            </div>
            <div className="auth-field">
              <label>Owner Email</label>
              <input type="email" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} required />
            </div>
            <div className="auth-field">
              <label>Owner Phone</label>
              <input value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
            </div>
            <div className="auth-field">
              <label>Desired Plan</label>
              <select value={form.desired_plan} onChange={(e) => setForm({ ...form, desired_plan: e.target.value })}>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="auth-field">
              <label>Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {err && <div className="auth-alert auth-alert-error"><span>{err}</span></div>}
            {msg && <div className="auth-alert auth-alert-success"><span>{msg}</span></div>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit Registration'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default BusinessRegisterPage
