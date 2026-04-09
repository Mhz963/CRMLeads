import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, CreditCard, LifeBuoy, LayoutDashboard, Users, AlertTriangle } from 'lucide-react'
import { fetchPlatformOverview } from '../services/platformService'
import { createBusinessDirect, fetchBusinessRequests, reviewBusinessRequest, updateBusinessDetails } from '../services/businessOnboardingService'
import { updateSupportTicket } from '../services/supportService'
import './PlatformPage.css'

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'businesses', label: 'Businesses', icon: Building2 },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'onboarding', label: 'Onboarding', icon: Building2 },
  { id: 'data', label: 'Data Access', icon: Users },
  { id: 'billing', label: 'Billing Settings', icon: CreditCard },
  { id: 'support', label: 'Support', icon: LifeBuoy },
]

const PlatformPage = () => {
  const location = useLocation()
  const [activeTab, setActiveTab] = useState('overview')
  const [approvalModal, setApprovalModal] = useState(null)
  const [businessProfileModal, setBusinessProfileModal] = useState(null)
  const [showCreateBusinessModal, setShowCreateBusinessModal] = useState(false)
  const [creatingBusiness, setCreatingBusiness] = useState(false)
  const [createBusinessError, setCreateBusinessError] = useState('')
  const [newBusiness, setNewBusiness] = useState({
    business_name: '',
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    desired_plan: 'starter',
  })
  const [copiedField, setCopiedField] = useState('')
  const [ticketDrafts, setTicketDrafts] = useState({})
  const [ticketSaving, setTicketSaving] = useState({})
  const [businessEditForm, setBusinessEditForm] = useState(null)
  const [businessSaving, setBusinessSaving] = useState(false)
  const [businessSaveError, setBusinessSaveError] = useState('')
  const { data, isLoading, error, refetch: refetchOverview } = useQuery({
    queryKey: ['platform-overview'],
    queryFn: fetchPlatformOverview,
  })
  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['business-requests'],
    queryFn: fetchBusinessRequests,
  })

  const stats = data?.stats || {
    totalBusinesses: 0,
    activeSubscriptions: 0,
    pastDueSubscriptions: 0,
    totalManagers: 0,
    totalAgents: 0,
    totalLeads: 0,
    totalActivities: 0,
    totalTasks: 0,
  }

  const businesses = data?.businesses || []
  const subscriptions = data?.subscriptions || []
  const supportQueue = data?.supportQueue || []
  const billingSettings = data?.billingSettings || {}
  const leads = data?.leads || []
  const activities = data?.activities || []
  const tasks = data?.tasks || []

  const recentSubscriptions = useMemo(() => subscriptions.slice(0, 8), [subscriptions])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const tab = String(params.get('tab') || '').trim()
    const businessId = String(params.get('businessId') || '').trim()
    if (tab && TABS.some((t) => t.id === tab)) {
      setActiveTab(tab)
    }
    if (businessId && businesses.length > 0) {
      const selectedBusiness = businesses.find((b) => b.id === businessId)
      if (selectedBusiness) {
        setActiveTab('businesses')
        setBusinessProfileModal(selectedBusiness)
      }
    }
  }, [location.search, businesses])

  const onReview = async (requestId, decision) => {
    const response = await reviewBusinessRequest({ request_id: requestId, decision })
    if (decision === 'approved' && response?.credentials) {
      const rawEmail = response.credentials.login_email || response.credentials.email || ''
      const username = response.credentials.username || (rawEmail ? String(rawEmail).split('@')[0] : 'generated-user')
      const loginEmail = rawEmail || `${username}@crm-owner.local`
      setApprovalModal({
        username,
        loginEmail,
        password: response.credentials.temp_password || '',
        apiKey: response.credentials.business_api_key || '',
      })
    }
    refetchRequests()
  }

  const copyValue = async (label, value) => {
    try {
      await navigator.clipboard.writeText(String(value || ''))
      setCopiedField(label)
      setTimeout(() => setCopiedField(''), 1200)
    } catch {
      // Ignore copy failures silently.
    }
  }

  const onCreateBusinessDirect = async (e) => {
    e.preventDefault()
    setCreateBusinessError('')
    setCreatingBusiness(true)
    try {
      const response = await createBusinessDirect({
        business_name: newBusiness.business_name.trim(),
        owner_name: newBusiness.owner_name.trim(),
        owner_email: newBusiness.owner_email.trim(),
        owner_phone: newBusiness.owner_phone.trim(),
        desired_plan: newBusiness.desired_plan,
      })
      const rawEmail = response?.credentials?.login_email || ''
      const username = response?.credentials?.username || (rawEmail ? String(rawEmail).split('@')[0] : 'generated-user')
      const loginEmail = rawEmail || `${username}@crm-owner.local`
      setApprovalModal({
        username,
        loginEmail,
        password: response?.credentials?.temp_password || '',
        apiKey: response?.credentials?.business_api_key || '',
      })
      setShowCreateBusinessModal(false)
      setNewBusiness({
        business_name: '',
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        desired_plan: 'starter',
      })
      await refetchOverview()
    } catch (err) {
      setCreateBusinessError(err.message || 'Failed to create business owner.')
    } finally {
      setCreatingBusiness(false)
    }
  }

  const onSaveTicketResponse = async (ticket) => {
    const draft = ticketDrafts[ticket.id] || {}
    setTicketSaving((prev) => ({ ...prev, [ticket.id]: true }))
    try {
      await updateSupportTicket(ticket.id, {
        status: draft.status || ticket.status,
        response_message: draft.response_message !== undefined ? draft.response_message : ticket.response_message,
      })
      await refetchOverview()
    } finally {
      setTicketSaving((prev) => ({ ...prev, [ticket.id]: false }))
    }
  }

  const openBusinessEditor = (business) => {
    setBusinessProfileModal(business)
    setBusinessSaveError('')
    setBusinessEditForm({
      id: business.id,
      name: business.name || '',
      status: business.status || 'active',
      business_type: business.business_type === '—' ? '' : (business.business_type || ''),
      company_size: business.company_size === '—' ? '' : (business.company_size || ''),
      city: business.city === '—' ? '' : (business.city || ''),
      country: business.country === '—' ? '' : (business.country || ''),
      timezone: business.timezone === '—' ? '' : (business.timezone || ''),
      contact_email: business.contact_email === '—' ? '' : (business.contact_email || ''),
      contact_phone: business.contact_phone === '—' ? '' : (business.contact_phone || ''),
    })
  }

  const onSaveBusinessDetails = async () => {
    if (!businessEditForm?.id) return
    setBusinessSaving(true)
    setBusinessSaveError('')
    try {
      const response = await updateBusinessDetails({
        business_id: businessEditForm.id,
        name: businessEditForm.name,
        status: businessEditForm.status,
        business_type: businessEditForm.business_type,
        company_size: businessEditForm.company_size,
        city: businessEditForm.city,
        country: businessEditForm.country,
        timezone: businessEditForm.timezone,
        contact_email: businessEditForm.contact_email,
        contact_phone: businessEditForm.contact_phone,
      })
      const updatedBusiness = response?.business ? { ...businessProfileModal, ...response.business } : businessProfileModal
      setBusinessProfileModal(updatedBusiness)
      await refetchOverview()
    } catch (err) {
      setBusinessSaveError(err.message || 'Failed to update business details.')
    } finally {
      setBusinessSaving(false)
    }
  }

  return (
    <div className="platform-page animate-fade-in">
      <div className="platform-header">
        <h2>Super Admin Portal</h2>
        <p>Manage businesses, subscriptions, billing, and support from one place.</p>
      </div>

      <div className="platform-tabs">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              className={`platform-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {isLoading && <div className="platform-card">Loading super admin data...</div>}
      {error && <div className="platform-card platform-error">Failed to load platform data.</div>}

      {!isLoading && !error && activeTab === 'overview' && (
        <>
          <div className="platform-metrics">
            <div className="platform-metric-card">
              <Building2 size={20} />
              <div>
                <span className="platform-metric-value">{stats.totalBusinesses}</span>
                <span className="platform-metric-label">Businesses</span>
              </div>
            </div>
            <div className="platform-metric-card">
              <CreditCard size={20} />
              <div>
                <span className="platform-metric-value">{stats.activeSubscriptions}</span>
                <span className="platform-metric-label">Active Subscriptions</span>
              </div>
            </div>
            <div className="platform-metric-card">
              <AlertTriangle size={20} />
              <div>
                <span className="platform-metric-value">{stats.pastDueSubscriptions}</span>
                <span className="platform-metric-label">Past Due</span>
              </div>
            </div>
            <div className="platform-metric-card">
              <Users size={20} />
              <div>
                <span className="platform-metric-value">{stats.totalManagers + stats.totalAgents}</span>
                <span className="platform-metric-label">Managers + Agents</span>
              </div>
            </div>
            <div className="platform-metric-card">
              <Users size={20} />
              <div>
                <span className="platform-metric-value">{stats.totalLeads}</span>
                <span className="platform-metric-label">All Leads</span>
              </div>
            </div>
          </div>

          <div className="platform-card">
            <h3>Latest Subscriptions</h3>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Start</th>
                </tr>
              </thead>
              <tbody>
                {recentSubscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td>{sub.user_id}</td>
                    <td>{sub.plan_code}</td>
                    <td><span className={`status-badge status-${sub.status}`}>{sub.status}</span></td>
                    <td>{sub.starts_at ? new Date(sub.starts_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {recentSubscriptions.length === 0 && (
                  <tr><td colSpan="4" className="empty-cell">No subscriptions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && !error && activeTab === 'businesses' && (
        <div className="platform-card">
          <div className="platform-card-head">
            <h3>Business Owners (Admins)</h3>
            <button
              type="button"
              className="btn-primary-action"
              onClick={() => setShowCreateBusinessModal(true)}
            >
              Add New Business
            </button>
          </div>
          <table className="platform-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner</th>
                <th>Email</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id}>
                  <td>{b.name || '—'}</td>
                  <td>{b.owner_name}</td>
                  <td>{b.owner_email}</td>
                  <td>{b.plan_code}</td>
                  <td><span className={`status-badge status-${b.subscription_status}`}>{b.subscription_status}</span></td>
                  <td>
                    <button
                      type="button"
                      className="platform-action-btn edit"
                      onClick={() => openBusinessEditor(b)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {businesses.length === 0 && (
                <tr><td colSpan="6" className="empty-cell">No business owners found yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && activeTab === 'subscriptions' && (
        <div className="platform-card">
          <h3>All Subscription Records</h3>
          <p className="platform-muted">Use Admin → Team Management to update statuses for each business owner.</p>
          <table className="platform-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => (
                <tr key={sub.id}>
                  <td>{sub.user_id}</td>
                  <td>{sub.plan_code}</td>
                  <td><span className={`status-badge status-${sub.status}`}>{sub.status}</span></td>
                  <td>{sub.starts_at ? new Date(sub.starts_at).toLocaleDateString() : '—'}</td>
                  <td>{sub.ends_at ? new Date(sub.ends_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr><td colSpan="5" className="empty-cell">No subscription records found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && activeTab === 'onboarding' && (
        <div className="platform-card">
          <h3>Business Registration Requests</h3>
          <p className="platform-muted">Approve to auto-create business owner admin credentials and business API key.</p>
          <table className="platform-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{r.business_name}</td>
                  <td>{r.owner_name} ({r.owner_email})</td>
                  <td>{r.desired_plan || 'starter'}</td>
                  <td><span className={`status-badge status-${r.status}`}>{r.status}</span></td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td>
                    {r.status === 'pending' ? (
                      <>
                        <button className="platform-action-btn ok" onClick={() => onReview(r.id, 'approved')}>Approve</button>
                        <button className="platform-action-btn no" onClick={() => onReview(r.id, 'rejected')}>Reject</button>
                      </>
                    ) : '—'}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr><td colSpan="6" className="empty-cell">No onboarding requests found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && activeTab === 'data' && (
        <>
          <div className="platform-metrics">
            <div className="platform-metric-card">
              <Users size={20} />
              <div>
                <span className="platform-metric-value">{stats.totalLeads}</span>
                <span className="platform-metric-label">Total Leads</span>
              </div>
            </div>
            <div className="platform-metric-card">
              <Users size={20} />
              <div>
                <span className="platform-metric-value">{stats.totalActivities}</span>
                <span className="platform-metric-label">Activities</span>
              </div>
            </div>
            <div className="platform-metric-card">
              <Users size={20} />
              <div>
                <span className="platform-metric-value">{stats.totalTasks}</span>
                <span className="platform-metric-label">Tasks</span>
              </div>
            </div>
          </div>

          <div className="platform-card">
            <h3>All Leads (Recent)</h3>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.slice(0, 50).map((lead) => (
                  <tr key={lead.id}>
                    <td>{lead.full_name || '—'}</td>
                    <td>{lead.email || '—'}</td>
                    <td>{lead.phone || '—'}</td>
                    <td>{lead.source || '—'}</td>
                    <td>{lead.status || '—'}</td>
                    <td>{lead.created_at ? new Date(lead.created_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan="6" className="empty-cell">No leads available.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="platform-card">
            <h3>Recent Activities</h3>
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Notes</th>
                  <th>Lead ID</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {activities.slice(0, 30).map((a) => (
                  <tr key={a.id}>
                    <td>{a.type || '—'}</td>
                    <td>{a.notes || '—'}</td>
                    <td>{a.lead_id || '—'}</td>
                    <td>{a.created_at ? new Date(a.created_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
                {activities.length === 0 && (
                  <tr><td colSpan="4" className="empty-cell">No activities yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!isLoading && !error && activeTab === 'billing' && (
        <div className="platform-card">
          <h3>Billing Settings</h3>
          <div className="platform-kv-grid">
            <div><strong>Provider:</strong> {billingSettings.provider || '—'}</div>
            <div><strong>Currency:</strong> {billingSettings.currency || '—'}</div>
            <div><strong>Cycle:</strong> {billingSettings.billingCycle || '—'}</div>
            <div><strong>Tax:</strong> {billingSettings.taxMode || '—'}</div>
          </div>
          <p className="platform-muted">Next step: connect Stripe webhooks and map invoice events to `crm_user_subscriptions`.</p>
        </div>
      )}

      {!isLoading && !error && activeTab === 'support' && (
        <div className="platform-card">
          <h3>Support Queue</h3>
          <table className="platform-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Business</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Response</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {supportQueue.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.id} - {ticket.subject}</td>
                  <td>{ticket.businesses?.name || '—'}</td>
                  <td>{ticket.priority}</td>
                  <td>
                    <select
                      className="platform-inline-select"
                      value={ticketDrafts[ticket.id]?.status ?? ticket.status}
                      onChange={(e) => setTicketDrafts((prev) => ({
                        ...prev,
                        [ticket.id]: { ...(prev[ticket.id] || {}), status: e.target.value },
                      }))}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                  <td>
                    <textarea
                      className="platform-inline-textarea"
                      rows={2}
                      value={ticketDrafts[ticket.id]?.response_message ?? ticket.response_message ?? ''}
                      onChange={(e) => setTicketDrafts((prev) => ({
                        ...prev,
                        [ticket.id]: { ...(prev[ticket.id] || {}), response_message: e.target.value },
                      }))}
                      placeholder="Write response / feedback"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="platform-action-btn edit"
                      onClick={() => onSaveTicketResponse(ticket)}
                      disabled={Boolean(ticketSaving[ticket.id])}
                    >
                      {ticketSaving[ticket.id] ? 'Saving...' : 'Save'}
                    </button>
                  </td>
                </tr>
              ))}
              {supportQueue.length === 0 && (
                <tr><td colSpan="6" className="empty-cell">No support tickets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {approvalModal && (
        <div className="modal-overlay" onClick={() => setApprovalModal(null)}>
          <div className="modal-content platform-approval-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Business Approved</h3>
              <button className="modal-close" onClick={() => setApprovalModal(null)}>x</button>
            </div>
            <div className="platform-approval-body">
              <p>Share these credentials manually with the business owner:</p>
              <div className="platform-approval-grid">
                <div className="credential-row">
                  <div><strong>Username:</strong> {approvalModal.username}</div>
                  <button type="button" className="copy-credential-btn" onClick={() => copyValue('username', approvalModal.username)}>
                    {copiedField === 'username' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="credential-row">
                  <div><strong>Login Email:</strong> {approvalModal.loginEmail}</div>
                  <button type="button" className="copy-credential-btn" onClick={() => copyValue('email', approvalModal.loginEmail)}>
                    {copiedField === 'email' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="credential-row">
                  <div><strong>Temporary Password:</strong> {approvalModal.password}</div>
                  <button type="button" className="copy-credential-btn" onClick={() => copyValue('password', approvalModal.password)}>
                    {copiedField === 'password' ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="credential-row">
                  <div><strong>Business API Key:</strong> <code>{approvalModal.apiKey}</code></div>
                  <button type="button" className="copy-credential-btn" onClick={() => copyValue('apikey', approvalModal.apiKey)}>
                    {copiedField === 'apikey' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary-action" onClick={() => setApprovalModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {businessProfileModal && (
        <div className="modal-overlay" onClick={() => setBusinessProfileModal(null)}>
          <div className="modal-content platform-business-profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Business Owner Profile</h3>
              <button className="modal-close" onClick={() => setBusinessProfileModal(null)}>x</button>
            </div>
            <div className="platform-business-profile-body">
              <div className="platform-business-section">
                <h4>Business Details</h4>
                <div className="platform-business-edit-grid">
                  <div className="form-field">
                    <label>Business Name</label>
                    <input value={businessEditForm?.name || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select value={businessEditForm?.status || 'active'} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, status: e.target.value }))}>
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Type</label>
                    <input value={businessEditForm?.business_type || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, business_type: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Company Size</label>
                    <input value={businessEditForm?.company_size || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, company_size: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>City</label>
                    <input value={businessEditForm?.city || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, city: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Country</label>
                    <input value={businessEditForm?.country || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, country: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Timezone</label>
                    <input value={businessEditForm?.timezone || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, timezone: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Contact Email</label>
                    <input value={businessEditForm?.contact_email || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, contact_email: e.target.value }))} />
                  </div>
                  <div className="form-field">
                    <label>Contact Phone</label>
                    <input value={businessEditForm?.contact_phone || ''} onChange={(e) => setBusinessEditForm((prev) => ({ ...prev, contact_phone: e.target.value }))} />
                  </div>
                  <div><strong>Created:</strong> {businessProfileModal.created_at ? new Date(businessProfileModal.created_at).toLocaleString() : '—'}</div>
                </div>
                {businessSaveError && <div className="platform-create-error">{businessSaveError}</div>}
                <div className="modal-actions">
                  <button type="button" className="btn-primary-action" onClick={onSaveBusinessDetails} disabled={businessSaving}>
                    {businessSaving ? 'Saving...' : 'Save business details'}
                  </button>
                </div>
              </div>

              <div className="platform-business-section">
                <h4>Owner Profile</h4>
                <div className="platform-business-grid">
                  <div><strong>Owner ID:</strong> {businessProfileModal.owner_id || '—'}</div>
                  <div><strong>Name:</strong> {businessProfileModal.owner_name || '—'}</div>
                  <div><strong>Email:</strong> {businessProfileModal.owner_email || '—'}</div>
                  <div><strong>Role:</strong> {businessProfileModal.owner_role || '—'}</div>
                  <div><strong>Joined:</strong> {businessProfileModal.owner_created_at ? new Date(businessProfileModal.owner_created_at).toLocaleString() : '—'}</div>
                </div>
              </div>

              <div className="platform-business-section">
                <h4>Subscription Snapshot</h4>
                <div className="platform-business-grid">
                  <div><strong>Current Plan:</strong> {businessProfileModal.plan_code || '—'}</div>
                  <div><strong>Status:</strong> {businessProfileModal.subscription_status || '—'}</div>
                  <div><strong>Started At:</strong> {businessProfileModal.started_at ? new Date(businessProfileModal.started_at).toLocaleString() : '—'}</div>
                  <div><strong>Ends At:</strong> {businessProfileModal.subscription_ends_at ? new Date(businessProfileModal.subscription_ends_at).toLocaleString() : '—'}</div>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-primary-action" onClick={() => setBusinessProfileModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showCreateBusinessModal && (
        <div className="modal-overlay" onClick={() => setShowCreateBusinessModal(false)}>
          <div className="modal-content platform-create-business-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Business Owner</h3>
              <button className="modal-close" onClick={() => setShowCreateBusinessModal(false)}>x</button>
            </div>
            <form className="platform-create-business-form" onSubmit={onCreateBusinessDirect}>
              <div className="platform-create-grid">
                <div className="form-field">
                  <label>Business Name</label>
                  <input
                    required
                    value={newBusiness.business_name}
                    onChange={(e) => setNewBusiness((prev) => ({ ...prev, business_name: e.target.value }))}
                    placeholder="Acme Solutions"
                  />
                </div>
                <div className="form-field">
                  <label>Owner Name</label>
                  <input
                    required
                    value={newBusiness.owner_name}
                    onChange={(e) => setNewBusiness((prev) => ({ ...prev, owner_name: e.target.value }))}
                    placeholder="Owner full name"
                  />
                </div>
                <div className="form-field">
                  <label>Owner Email</label>
                  <input
                    type="email"
                    value={newBusiness.owner_email}
                    onChange={(e) => setNewBusiness((prev) => ({ ...prev, owner_email: e.target.value }))}
                    placeholder="owner@company.com"
                  />
                </div>
                <div className="form-field">
                  <label>Owner Phone</label>
                  <input
                    value={newBusiness.owner_phone}
                    onChange={(e) => setNewBusiness((prev) => ({ ...prev, owner_phone: e.target.value }))}
                    placeholder="+92..."
                  />
                </div>
                <div className="form-field">
                  <label>Plan</label>
                  <select
                    value={newBusiness.desired_plan}
                    onChange={(e) => setNewBusiness((prev) => ({ ...prev, desired_plan: e.target.value }))}
                  >
                    <option value="starter">Starter</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
              </div>
              {createBusinessError && <div className="platform-create-error">{createBusinessError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowCreateBusinessModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary-action" disabled={creatingBusiness}>
                  {creatingBusiness ? 'Creating...' : 'Create Business'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PlatformPage
