import { useEffect, useState } from 'react'
import { Shield, Users, Trash2, ChevronDown, Loader2, AlertCircle, UserPlus } from 'lucide-react'
import { fetchAllTeamMembers, updateMemberRole, removeMember, adminCreateUser } from '../services/authService'
import { createSubscription, fetchAllSubscriptions } from '../services/subscriptionService'
import { createBusinessDirect, fetchBusinessesForAdmin, updateBusinessDetails } from '../services/businessOnboardingService'
import './AdminPage.css'

const EMPTY_NEW_USER = {
  full_name: '',
  email: '',
  password: '',
  role: 'team_member',
}

const EMPTY_NEW_BUSINESS = {
  business_name: '',
  owner_name: '',
  owner_email: '',
  owner_phone: '',
  desired_plan: 'starter',
}

const AdminPage = ({ currentUser, userProfile }) => {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER)
  const [creatingUser, setCreatingUser] = useState(false)
  const [subscriptionsByUser, setSubscriptionsByUser] = useState({})
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [businesses, setBusinesses] = useState([])
  const [businessLoading, setBusinessLoading] = useState(false)
  const [businessError, setBusinessError] = useState(null)
  const [newBusiness, setNewBusiness] = useState(EMPTY_NEW_BUSINESS)
  const [creatingBusiness, setCreatingBusiness] = useState(false)
  const [editingBusinessId, setEditingBusinessId] = useState(null)
  const [businessDraft, setBusinessDraft] = useState({})
  const [lastBusinessCredentials, setLastBusinessCredentials] = useState(null)

  const role = userProfile?.role
  const isAdmin = role === 'admin' || role === 'super_admin'
  const isSuperAdmin = role === 'super_admin'

  useEffect(() => {
    loadMembers()
  }, [isSuperAdmin])

  useEffect(() => {
    if (isSuperAdmin) loadBusinesses()
  }, [isSuperAdmin])

  const loadMembers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchAllTeamMembers()
      setMembers(data || [])
      if (isSuperAdmin) {
        const subscriptions = await fetchAllSubscriptions()
        const latestByUser = {}
        for (const row of subscriptions || []) {
          if (!latestByUser[row.user_id]) latestByUser[row.user_id] = row
        }
        setSubscriptionsByUser(latestByUser)
      }
    } catch (err) {
      setMembers([])
      setError(null)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadBusinesses = async () => {
    setBusinessLoading(true)
    setBusinessError(null)
    try {
      const data = await fetchBusinessesForAdmin()
      setBusinesses(data || [])
    } catch (err) {
      setBusinesses([])
      setBusinessError(err.message || 'Failed to load businesses.')
    } finally {
      setBusinessLoading(false)
    }
  }

  const setMemberSubscriptionStatus = async (member, status) => {
    setActionLoading(member.id)
    try {
      const updated = await createSubscription({
        user_id: member.id,
        plan_code: subscriptionsByUser[member.id]?.plan_code || 'starter',
        status,
        max_team_members: subscriptionsByUser[member.id]?.max_team_members || null,
        max_leads_per_month: subscriptionsByUser[member.id]?.max_leads_per_month || null,
        notes: `Updated by super admin: ${status}`,
      })
      setSubscriptionsByUser((prev) => ({ ...prev, [member.id]: updated }))
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to update subscription.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRoleChange = async (userId, newRole) => {
    if (userId === currentUser?.id) return
    setActionLoading(userId)
    try {
      const updated = await updateMemberRole(userId, newRole)
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, role: updated.role } : m)))
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

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!newUser.email.trim() || !newUser.password) return
    setCreatingUser(true)
    try {
      const created = await adminCreateUser({
        email: newUser.email.trim(),
        password: newUser.password,
        full_name: newUser.full_name.trim(),
        role: newUser.role,
      })
      setMembers((prev) => [...prev, created])
      setNewUser(EMPTY_NEW_USER)
      setShowCreateModal(false)
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to create user.')
    } finally {
      setCreatingUser(false)
    }
  }

  const handleCreateBusiness = async (e) => {
    e.preventDefault()
    if (!newBusiness.business_name.trim() || !newBusiness.owner_name.trim()) return
    setCreatingBusiness(true)
    setBusinessError(null)
    try {
      const payload = await createBusinessDirect({
        business_name: newBusiness.business_name.trim(),
        owner_name: newBusiness.owner_name.trim(),
        owner_email: newBusiness.owner_email.trim(),
        owner_phone: newBusiness.owner_phone.trim(),
        desired_plan: newBusiness.desired_plan,
      })
      setLastBusinessCredentials(payload.credentials || null)
      setNewBusiness(EMPTY_NEW_BUSINESS)
      await loadBusinesses()
    } catch (err) {
      setBusinessError(err.message || 'Failed to register business.')
    } finally {
      setCreatingBusiness(false)
    }
  }

  const startEditBusiness = (business) => {
    setEditingBusinessId(business.id)
    setBusinessDraft({
      name: business.name || '',
      contact_email: business.contact_email || '',
      contact_phone: business.contact_phone || '',
      status: business.status || 'active',
    })
  }

  const saveBusinessEdit = async (businessId) => {
    try {
      await updateBusinessDetails({
        business_id: businessId,
        ...businessDraft,
      })
      setEditingBusinessId(null)
      setBusinessDraft({})
      await loadBusinesses()
    } catch (err) {
      setBusinessError(err.message || 'Failed to update business.')
    }
  }

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
          <p>Admins manage managers and sales assistants. Super admin controls approvals and subscriptions.</p>
        </div>
        <button type="button" className="btn-primary-action" onClick={() => setShowCreateModal(true)}>
          <UserPlus size={16} />
          Create User
        </button>
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
                <span className="admin-stat-value">{members.filter((m) => m.role === 'admin' || m.role === 'super_admin').length}</span>
                <span className="admin-stat-label">Admins</span>
              </div>
            </div>
            <div className="admin-stat-card">
              <Users size={20} />
              <div>
                <span className="admin-stat-value">{members.filter((m) => m.role === 'team_member').length}</span>
                <span className="admin-stat-label">Sales Assistants</span>
              </div>
            </div>
            <div className="admin-stat-card">
              <Users size={20} />
              <div>
                <span className="admin-stat-value">{members.filter((m) => m.role === 'business_member').length}</span>
                <span className="admin-stat-label">Managers</span>
              </div>
            </div>
            {isSuperAdmin && (
              <div className="admin-stat-card">
                <Shield size={20} />
                <div>
                  <span className="admin-stat-value">{members.filter((m) => m.role === 'super_admin').length}</span>
                  <span className="admin-stat-label">Super Admins</span>
                </div>
              </div>
            )}
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Email</th>
                  <th>Role</th>
                  {isSuperAdmin && <th>Plan</th>}
                  {isSuperAdmin && <th>Subscription</th>}
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => {
                  const isSelf = member.id === currentUser?.id
                  const isSuperAdminMember = member.role === 'super_admin'
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
                            <option value="business_member">Manager</option>
                            <option value="team_member">Sales Assistant</option>
                            {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                          </select>
                          <ChevronDown size={14} className="role-chevron" />
                        </div>
                      </td>
                      {isSuperAdmin && (
                        <td>{isSuperAdminMember ? 'Not Required' : (subscriptionsByUser[member.id]?.plan_code || '—')}</td>
                      )}
                      {isSuperAdmin && (
                        <td>
                          {isSuperAdminMember ? (
                            <span className="no-action">Always Active (Super Admin)</span>
                          ) : (
                            <div className="role-select-wrap">
                              <select
                                value={subscriptionsByUser[member.id]?.status || 'inactive'}
                                onChange={(e) => setMemberSubscriptionStatus(member, e.target.value)}
                                disabled={actionLoading === member.id}
                                className={`role-select role-${subscriptionsByUser[member.id]?.status || 'inactive'}`}
                              >
                                <option value="trialing">Trialing</option>
                                <option value="active">Active</option>
                                <option value="past_due">Past Due</option>
                                <option value="paused">Paused</option>
                                <option value="canceled">Canceled</option>
                              </select>
                              <ChevronDown size={14} className="role-chevron" />
                            </div>
                          )}
                        </td>
                      )}
                      <td className="date-cell">
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : '—'}
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
                    <td colSpan={isSuperAdmin ? 7 : 5} className="empty-row">Team members are not available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content admin-user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><UserPlus size={18} /> Add User</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>x</button>
            </div>
            <form className="admin-create-user-card modal-form-flat" onSubmit={handleCreateUser}>
              <div className="admin-create-user-grid">
                <div className="form-field">
                  <label>Full Name</label>
                  <input
                    value={newUser.full_name}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, full_name: e.target.value }))}
                    placeholder="Ali Khan"
                  />
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input
                    type="email"
                    required
                    value={newUser.email}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="user@example.com"
                  />
                </div>
                <div className="form-field">
                  <label>Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newUser.password}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div className="form-field">
                  <label>Role</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
                  >
                    <option value="business_member">Manager</option>
                    <option value="team_member">Sales Assistant</option>
                    <option value="admin">Admin</option>
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary-action" disabled={creatingUser}>
                  {creatingUser ? <Loader2 size={16} className="spinning" /> : <UserPlus size={16} />}
                  {creatingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isSuperAdmin && (
        <section className="admin-business-section">
          <div className="admin-header">
            <div>
              <h2>Business Management</h2>
              <p>Register businesses instantly and maintain their details from one place.</p>
            </div>
          </div>

          <form className="admin-create-user-card" onSubmit={handleCreateBusiness}>
            <h3>Register Business</h3>
            <div className="admin-create-user-grid">
              <div className="form-field">
                <label>Business Name</label>
                <input
                  required
                  value={newBusiness.business_name}
                  onChange={(e) => setNewBusiness((prev) => ({ ...prev, business_name: e.target.value }))}
                  placeholder="Acme Marketing"
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
                  placeholder="owner@business.com"
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
            <div className="modal-actions">
              <button type="submit" className="btn-primary-action" disabled={creatingBusiness}>
                {creatingBusiness ? <Loader2 size={16} className="spinning" /> : null}
                {creatingBusiness ? 'Registering...' : 'Register Business'}
              </button>
            </div>
            {lastBusinessCredentials && (
              <div className="business-credentials">
                <strong>Generated Login</strong>
                <p>Username: {lastBusinessCredentials.username || '—'}</p>
                <p>Email: {lastBusinessCredentials.login_email || '—'}</p>
                <p>Password: {lastBusinessCredentials.temp_password || '—'}</p>
              </div>
            )}
          </form>

          {businessError && (
            <div className="admin-alert">
              <AlertCircle size={18} />
              <span>{businessError}</span>
            </div>
          )}

          <div className="admin-table-wrap admin-business-table">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Business</th>
                  <th>Contact Email</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {businessLoading ? (
                  <tr><td colSpan={6} className="empty-row">Loading businesses...</td></tr>
                ) : businesses.length === 0 ? (
                  <tr><td colSpan={6} className="empty-row">Businesses are not available yet.</td></tr>
                ) : businesses.map((business) => {
                  const isEditing = editingBusinessId === business.id
                  return (
                    <tr key={business.id}>
                      <td>{isEditing ? <input value={businessDraft.name || ''} onChange={(e) => setBusinessDraft((prev) => ({ ...prev, name: e.target.value }))} /> : business.name}</td>
                      <td>{isEditing ? <input value={businessDraft.contact_email || ''} onChange={(e) => setBusinessDraft((prev) => ({ ...prev, contact_email: e.target.value }))} /> : (business.contact_email || '—')}</td>
                      <td>{isEditing ? <input value={businessDraft.contact_phone || ''} onChange={(e) => setBusinessDraft((prev) => ({ ...prev, contact_phone: e.target.value }))} /> : (business.contact_phone || '—')}</td>
                      <td>
                        {isEditing ? (
                          <select value={businessDraft.status || 'active'} onChange={(e) => setBusinessDraft((prev) => ({ ...prev, status: e.target.value }))}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        ) : (
                          business.status || '—'
                        )}
                      </td>
                      <td>{business.created_at ? new Date(business.created_at).toLocaleDateString() : '—'}</td>
                      <td>
                        {isEditing ? (
                          <button type="button" className="btn-outline" onClick={() => saveBusinessEdit(business.id)}>Save</button>
                        ) : (
                          <button type="button" className="btn-outline" onClick={() => startEditBusiness(business)}>Edit</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export default AdminPage
