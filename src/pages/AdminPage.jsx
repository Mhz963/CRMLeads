import { useEffect, useState } from 'react'
import { Shield, Users, Trash2, ChevronDown, Loader2, AlertCircle, UserPlus } from 'lucide-react'
import { fetchAllTeamMembers, updateMemberRole, removeMember, adminCreateUser } from '../services/authService'
import './AdminPage.css'

const EMPTY_NEW_USER = {
  full_name: '',
  email: '',
  password: '',
  role: 'team_member',
}

const AdminPage = ({ currentUser, userProfile }) => {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [newUser, setNewUser] = useState(EMPTY_NEW_USER)
  const [creatingUser, setCreatingUser] = useState(false)

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
    } catch (err) {
      console.error(err)
      alert(err.message || 'Failed to create user.')
    } finally {
      setCreatingUser(false)
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
          <p>Only admins can create users and assign roles.</p>
        </div>
      </div>

      <form className="admin-create-user-card" onSubmit={handleCreateUser}>
        <h3><UserPlus size={18} /> Add User</h3>
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
              <option value="team_member">Team Member</option>
              <option value="business_member">Business Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn-primary-action" disabled={creatingUser}>
          {creatingUser ? <Loader2 size={16} className="spinning" /> : <UserPlus size={16} />}
          {creatingUser ? 'Creating...' : 'Create User'}
        </button>
      </form>

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
                <span className="admin-stat-value">{members.filter((m) => m.role === 'admin').length}</span>
                <span className="admin-stat-label">Admins</span>
              </div>
            </div>
            <div className="admin-stat-card">
              <Users size={20} />
              <div>
                <span className="admin-stat-value">{members.filter((m) => m.role === 'team_member').length}</span>
                <span className="admin-stat-label">Team Members</span>
              </div>
            </div>
            <div className="admin-stat-card">
              <Users size={20} />
              <div>
                <span className="admin-stat-value">{members.filter((m) => m.role === 'business_member').length}</span>
                <span className="admin-stat-label">Business Members</span>
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
                            <option value="business_member">Business Member</option>
                          </select>
                          <ChevronDown size={14} className="role-chevron" />
                        </div>
                      </td>
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
                    <td colSpan="5" className="empty-row">No team members found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export default AdminPage
