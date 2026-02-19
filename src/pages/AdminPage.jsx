import { useState, useEffect } from 'react'
import {
  Shield, Users, Trash2, ChevronDown, Loader2, AlertCircle,
  Plug, Copy, CheckCircle, ExternalLink, Code2,
} from 'lucide-react'
import { fetchAllTeamMembers, updateMemberRole, removeMember } from '../services/authService'
import './AdminPage.css'

const AdminPage = ({ currentUser, userProfile }) => {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null) // userId being acted on
  const [copiedField, setCopiedField] = useState(null)

  // API integration info
  const apiEndpoint = `${window.location.origin}/api/leads`

  const isAdmin = userProfile?.role === 'admin'

  useEffect(() => {
    loadMembers()
  }, [])

  const loadMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllTeamMembers()
      setMembers(data || [])
    } catch (err) {
      setError('Failed to load team members.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    if (userId === currentUser?.id) return // Can't change own role
    setActionLoading(userId)
    try {
      const updated = await updateMemberRole(userId, newRole)
      setMembers((prev) =>
        prev.map((m) => (m.id === userId ? { ...m, role: updated.role } : m))
      )
    } catch (err) {
      console.error(err)
      alert('Failed to update role.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRemove = async (userId) => {
    if (userId === currentUser?.id) return
    if (!window.confirm('Are you sure you want to remove this team member?')) return

    setActionLoading(userId)
    try {
      await removeMember(userId)
      setMembers((prev) => prev.filter((m) => m.id !== userId))
    } catch (err) {
      console.error(err)
      alert('Failed to remove member.')
    } finally {
      setActionLoading(null)
    }
  }

  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const curlExample = `curl -X POST ${apiEndpoint} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+64 21 123 4567",
    "services": "Web Design",
    "notes": "Interested in a new website",
    "source_detail": "example.com"
  }'`

  const jsSnippet = `fetch('${apiEndpoint}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY',
  },
  body: JSON.stringify({
    name: formData.name,
    email: formData.email,
    phone: formData.phone,
    services: formData.services,
    notes: formData.message,
    source_detail: window.location.hostname,
  }),
})`

  if (!isAdmin) {
    return (
      <div className="admin-page animate-fade-in">
        <div className="admin-no-access">
          <Shield size={48} />
          <h2>Admin Access Required</h2>
          <p>You need admin privileges to access this page.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page animate-fade-in">
      <div className="admin-header">
        <div>
          <h2>
            <Shield size={24} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
            Team Management
          </h2>
          <p>Manage your team members, assign roles, and control access.</p>
        </div>
      </div>

      {error && (
        <div className="admin-alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">
          <Loader2 size={24} className="spinning" />
          <span>Loading team...</span>
        </div>
      ) : (
        <>
          <div className="admin-stats-row">
            <div className="admin-stat-card">
              <Users size={20} />
              <div>
                <span className="admin-stat-value">{members.length}</span>
                <span className="admin-stat-label">Total Members</span>
              </div>
            </div>
            <div className="admin-stat-card">
              <Shield size={20} />
              <div>
                <span className="admin-stat-value">
                  {members.filter((m) => m.role === 'admin').length}
                </span>
                <span className="admin-stat-label">Admins</span>
              </div>
            </div>
            <div className="admin-stat-card">
              <Users size={20} />
              <div>
                <span className="admin-stat-value">
                  {members.filter((m) => m.role === 'team_member').length}
                </span>
                <span className="admin-stat-label">Team Members</span>
              </div>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.id === currentUser?.id
                  return (
                    <tr key={member.id} className={isSelf ? 'self-row' : ''}>
                      <td className="member-name">
                        <div className="member-avatar">
                          {(member.full_name || member.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <span>{member.full_name || '—'}</span>
                        {isSelf && <span className="you-badge">You</span>}
                      </td>
                      <td>{member.email}</td>
                      <td>
                        <div className="role-select-wrap">
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value)}
                            disabled={isSelf || actionLoading === member.id}
                            className={`role-select role-${member.role}`}
                          >
                            <option value="admin">Admin</option>
                            <option value="team_member">Team Member</option>
                          </select>
                          <ChevronDown size={14} className="role-chevron" />
                        </div>
                      </td>
                      <td className="date-cell">
                        {member.created_at
                          ? new Date(member.created_at).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>
                        {isSelf ? (
                          <span className="no-action">—</span>
                        ) : (
                          <button
                            className="remove-btn"
                            onClick={() => handleRemove(member.id)}
                            disabled={actionLoading === member.id}
                            title="Remove member"
                          >
                            {actionLoading === member.id ? (
                              <Loader2 size={16} className="spinning" />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan="5" className="empty-row">
                      No team members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════  API INTEGRATION SECTION  ═══════════════ */}
      <div className="api-section">
        <div className="api-section-header">
          <h2>
            <Plug size={24} style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} />
            Website API Integration
          </h2>
          <p>Connect external websites to automatically capture leads into your CRM.</p>
        </div>

        {/* Endpoint & Key */}
        <div className="api-cards-row">
          <div className="api-card">
            <h4>API Endpoint</h4>
            <p className="api-card-desc">POST requests to this URL will create new leads.</p>
            <div className="api-copy-row">
              <code className="api-code-value">{apiEndpoint}</code>
              <button
                className="copy-btn"
                onClick={() => copyToClipboard(apiEndpoint, 'endpoint')}
                title="Copy endpoint"
              >
                {copiedField === 'endpoint' ? <CheckCircle size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>

          <div className="api-card">
            <h4>Authentication</h4>
            <p className="api-card-desc">Include your API key in the <code>x-api-key</code> header.</p>
            <div className="api-copy-row">
              <code className="api-code-value api-key-blur">Set CRM_API_KEY in Vercel env vars</code>
            </div>
            <p className="api-card-hint">
              Go to Vercel → Project Settings → Environment Variables → add <code>CRM_API_KEY</code> with any secure string.
            </p>
          </div>
        </div>

        {/* Required Fields */}
        <div className="api-card full-width">
          <h4>Request Format</h4>
          <p className="api-card-desc">
            Send a <code>POST</code> request with <code>Content-Type: application/json</code>
          </p>
          <div className="api-fields-table">
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>name</code></td><td>string</td><td>✅ Yes</td><td>Full name of the lead</td></tr>
                <tr><td><code>email</code></td><td>string</td><td>⚡ Either</td><td>Email address (required if no phone)</td></tr>
                <tr><td><code>phone</code></td><td>string</td><td>⚡ Either</td><td>Phone number (required if no email)</td></tr>
                <tr><td><code>services</code></td><td>string</td><td>No</td><td>Services the lead is interested in</td></tr>
                <tr><td><code>notes</code></td><td>string</td><td>No</td><td>Additional notes or message</td></tr>
                <tr><td><code>source_detail</code></td><td>string</td><td>No</td><td>Which website sent the lead (e.g. "example.com")</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Code Examples */}
        <div className="api-card full-width">
          <h4><Code2 size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} /> Code Examples</h4>

          <div className="code-example">
            <div className="code-example-header">
              <span>cURL</span>
              <button
                className="copy-btn small"
                onClick={() => copyToClipboard(curlExample, 'curl')}
              >
                {copiedField === 'curl' ? <CheckCircle size={13} /> : <Copy size={13} />}
                {copiedField === 'curl' ? ' Copied' : ' Copy'}
              </button>
            </div>
            <pre className="code-block">{curlExample}</pre>
          </div>

          <div className="code-example">
            <div className="code-example-header">
              <span>JavaScript (fetch)</span>
              <button
                className="copy-btn small"
                onClick={() => copyToClipboard(jsSnippet, 'js')}
              >
                {copiedField === 'js' ? <CheckCircle size={13} /> : <Copy size={13} />}
                {copiedField === 'js' ? ' Copied' : ' Copy'}
              </button>
            </div>
            <pre className="code-block">{jsSnippet}</pre>
          </div>
        </div>

        {/* Embed Form */}
        <div className="api-card full-width">
          <h4>
            <ExternalLink size={18} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
            Embeddable Contact Form
          </h4>
          <p className="api-card-desc">
            A ready-to-use HTML contact form that you can embed on any website. It posts leads directly to your CRM.
          </p>
          <a
            href="/embed-example.html"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline api-embed-link"
          >
            <ExternalLink size={15} />
            View Embed Example
          </a>
          <p className="api-card-hint" style={{ marginTop: '0.75rem' }}>
            Open the example page, inspect the source, and copy the form HTML + script into any website.
            Replace <code>CRM_API_URL</code> and <code>CRM_API_KEY</code> with your actual values.
          </p>
        </div>

        {/* Setup checklist */}
        <div className="api-card full-width api-checklist">
          <h4>Setup Checklist</h4>
          <ul>
            <li>
              <span className="check-icon">1</span>
              <div>
                <strong>Add Supabase Service Role Key</strong>
                <p>In Vercel → Settings → Environment Variables, add <code>SUPABASE_SERVICE_ROLE_KEY</code> (find it in Supabase → Settings → API → service_role key)</p>
              </div>
            </li>
            <li>
              <span className="check-icon">2</span>
              <div>
                <strong>Set your CRM API Key</strong>
                <p>In Vercel → add <code>CRM_API_KEY</code> with any strong secret string (e.g. a UUID or random password)</p>
              </div>
            </li>
            <li>
              <span className="check-icon">3</span>
              <div>
                <strong>Deploy</strong>
                <p>Push your code to deploy the <code>/api/leads</code> endpoint on Vercel</p>
              </div>
            </li>
            <li>
              <span className="check-icon">4</span>
              <div>
                <strong>Share with website developers</strong>
                <p>Give them the API endpoint URL, API key, and the embed example</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default AdminPage
