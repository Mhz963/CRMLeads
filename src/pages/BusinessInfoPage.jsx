import { useEffect, useState } from 'react'
import { Building2, Loader2, CheckCircle2 } from 'lucide-react'
import { fetchMyBusinessInfo, upsertMyBusinessInfo } from '../services/businessOnboardingService'
import { createSupportTicket, fetchMySupportTickets } from '../services/supportService'
import './BusinessInfoPage.css'

const EMPTY_FORM = {
  business_name: '',
  business_type: '',
  company_size: '',
  city: '',
  country: '',
  timezone: '',
  contact_email: '',
  contact_phone: '',
}

const BusinessInfoPage = ({ userProfile }) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [supportTickets, setSupportTickets] = useState([])
  const [ticketForm, setTicketForm] = useState({ subject: '', description: '', priority: 'medium' })
  const [ticketMessage, setTicketMessage] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)

  const role = userProfile?.role
  const canManageBusiness = role === 'admin' || role === 'super_admin'

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!canManageBusiness) {
        setLoading(false)
        return
      }
      setLoading(true)
      setMessage('')
      try {
        const business = await fetchMyBusinessInfo()
        const tickets = await fetchMySupportTickets()
        if (!mounted) return
        setSupportTickets(tickets || [])
        if (business) {
          setForm({
            business_name: business.name || '',
            business_type: business.business_type || '',
            company_size: business.company_size || '',
            city: business.city || '',
            country: business.country || '',
            timezone: business.timezone || '',
            contact_email: business.contact_email || '',
            contact_phone: business.contact_phone || '',
          })
        }
      } catch (err) {
        if (!mounted) return
        setMessage(err.message || 'Failed to load business details.')
        setIsSuccess(false)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [canManageBusiness])

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!canManageBusiness) return
    setSaving(true)
    setMessage('')
    setIsSuccess(false)
    try {
      await upsertMyBusinessInfo({
        business_name: form.business_name.trim(),
        business_type: form.business_type.trim(),
        company_size: form.company_size.trim(),
        city: form.city.trim() || null,
        country: form.country.trim() || null,
        timezone: form.timezone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
      })
      setMessage('Your business was saved. You can update these details anytime.')
      setIsSuccess(true)
    } catch (err) {
      setMessage(err.message || 'Failed to save business details.')
      setIsSuccess(false)
    } finally {
      setSaving(false)
    }
  }

  const onCreateTicket = async (e) => {
    e.preventDefault()
    setTicketSaving(true)
    setTicketMessage('')
    try {
      await createSupportTicket({
        subject: ticketForm.subject.trim(),
        description: ticketForm.description.trim(),
        priority: ticketForm.priority,
      })
      const tickets = await fetchMySupportTickets()
      setSupportTickets(tickets || [])
      setTicketForm({ subject: '', description: '', priority: 'medium' })
      setTicketMessage('Your support ticket has been created.')
    } catch (err) {
      setTicketMessage(err.message || 'Failed to create support ticket.')
    } finally {
      setTicketSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page animate-fade-in business-info-loading">
        <Loader2 size={22} className="spinning" />
        <span>Loading business details…</span>
      </div>
    )
  }

  if (!canManageBusiness) {
    return (
      <div className="dashboard-page animate-fade-in">
        <div className="dashboard-page-header">
          <h2><Building2 size={22} className="business-info-title-icon" /> Business info</h2>
          <p>Your account is not ready for business registration yet.</p>
        </div>
        <div className="business-info-note card-like">
          Sign out and sign in again to refresh your profile, then retry this page.
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-page animate-fade-in business-info-page">
      <div className="dashboard-page-header">
        <h2><Building2 size={22} className="business-info-title-icon" /> Business registration</h2>
        <p>
          Set up your company profile in one step. This creates your business record and links it to your account—no super admin approval required.
        </p>
      </div>

      <div className="business-info-layout">
        <form className="business-info-form card-like" onSubmit={onSubmit}>
          <div className="business-info-form-header">
            <h3>Company details</h3>
            <span className="business-info-badge">Direct registration</span>
          </div>

          <div className="business-info-fields">
            <div className="business-info-subsection-title">Business basics</div>

            <div className="business-info-grid">
              <div className="form-field business-info-span-2">
                <label htmlFor="biz-name">* Company Name</label>
                <input
                  id="biz-name"
                  required
                  autoComplete="organization"
                  value={form.business_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
                  placeholder="e.g. Northwind Sales Ltd."
                />
              </div>

              <div className="form-field">
                <label htmlFor="biz-type">* Business Type</label>
                <select
                  id="biz-type"
                  required
                  value={form.business_type}
                  onChange={(e) => setForm((prev) => ({ ...prev, business_type: e.target.value }))}
                >
                  <option value="" disabled>Select a type</option>
                  <option value="Real Estate">Real Estate</option>
                  <option value="Solar">Solar</option>
                  <option value="Agency">Agency</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="biz-size">* Company Size</label>
                <select
                  id="biz-size"
                  required
                  value={form.company_size}
                  onChange={(e) => setForm((prev) => ({ ...prev, company_size: e.target.value }))}
                >
                  <option value="" disabled>Select size</option>
                  <option value="1-5">1–5</option>
                  <option value="5-20">5–20</option>
                  <option value="20+">20+</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="biz-city">City</label>
                <input
                  id="biz-city"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="e.g. Karachi"
                />
              </div>

              <div className="form-field">
                <label htmlFor="biz-country">Country</label>
                <input
                  id="biz-country"
                  value={form.country}
                  onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                  placeholder="e.g. Pakistan"
                />
              </div>

              <div className="form-field business-info-span-2">
                <label htmlFor="biz-tz">Timezone</label>
                <input
                  id="biz-tz"
                  value={form.timezone}
                  onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
                  placeholder="e.g. Asia/Karachi"
                />
                <span className="field-hint">Use IANA format like `Asia/Karachi`.</span>
              </div>
            </div>

            <div className="business-info-subsection-title business-info-subsection-title-mt">Contact (optional)</div>

            <div className="business-info-grid">
              <div className="form-field">
                <label htmlFor="biz-email">Contact Email</label>
                <input
                  id="biz-email"
                  type="email"
                  autoComplete="email"
                  value={form.contact_email}
                  onChange={(e) => setForm((prev) => ({ ...prev, contact_email: e.target.value }))}
                  placeholder="accounts@yourcompany.com"
                />
              </div>

              <div className="form-field">
                <label htmlFor="biz-phone">Contact Phone</label>
                <input
                  id="biz-phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.contact_phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, contact_phone: e.target.value }))}
                  placeholder="+1 …"
                />
              </div>
            </div>
          </div>

          <div className="business-info-actions">
            <button type="submit" className="btn-primary-action" disabled={saving}>
              {saving ? <Loader2 size={16} className="spinning" /> : <CheckCircle2 size={18} />}
              {saving ? 'Saving…' : 'Save business'}
            </button>
          </div>

          {message && (
            <div className={`business-info-feedback ${isSuccess ? 'is-success' : 'is-error'}`} role="status">
              {message}
            </div>
          )}
        </form>

        <div className="business-support-card card-like">
          <div className="business-info-form-header">
            <h3>Support tickets</h3>
            <span className="business-info-badge">Business support</span>
          </div>

          <form className="business-support-form" onSubmit={onCreateTicket}>
            <div className="business-info-grid">
              <div className="form-field business-info-span-2">
                <label>Subject</label>
                <input
                  required
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm((prev) => ({ ...prev, subject: e.target.value }))}
                  placeholder="Briefly describe your issue"
                />
              </div>
              <div className="form-field">
                <label>Priority</label>
                <select
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="form-field business-info-span-2">
                <label>Description</label>
                <textarea
                  required
                  rows={4}
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Share complete details so support can assist faster"
                />
              </div>
            </div>
            <div className="business-info-actions">
              <button type="submit" className="btn-primary-action" disabled={ticketSaving}>
                {ticketSaving ? <Loader2 size={16} className="spinning" /> : <CheckCircle2 size={18} />}
                {ticketSaving ? 'Submitting…' : 'Create ticket'}
              </button>
            </div>
            {ticketMessage && (
              <div className={`business-info-feedback ${ticketMessage.includes('Failed') ? 'is-error' : 'is-success'}`}>
                {ticketMessage}
              </div>
            )}
          </form>

          <div className="business-support-table-wrap">
            <table className="business-support-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Response</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {supportTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.subject}</td>
                    <td>{ticket.priority}</td>
                    <td>{ticket.status}</td>
                    <td>{ticket.response_message || '—'}</td>
                    <td>{ticket.created_at ? new Date(ticket.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {supportTickets.length === 0 && (
                  <tr><td colSpan="5" className="empty-cell">No support tickets created yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessInfoPage
