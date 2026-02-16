import { useState, useEffect } from 'react'
import { Shield, Users, Trash2, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import { fetchAllTeamMembers, updateMemberRole, removeMember } from '../services/authService'
import './AdminPage.css'

const AdminPage = ({ currentUser, userProfile }) => {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null) // userId being acted on

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
    </div>
  )
}

export default AdminPage
