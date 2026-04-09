import { useEffect, useState } from 'react'
import { Loader2, User } from 'lucide-react'
import { fetchUserProfile, updateUserProfile } from '../services/authService'
import './ProfilePage.css'

const ProfilePage = ({ currentUser }) => {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ full_name: '' })

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!currentUser?.id) return
      setLoading(true)
      const data = await fetchUserProfile(currentUser.id)
      if (!mounted) return
      setProfile(data)
      setForm({ full_name: data?.full_name || '' })
      setLoading(false)
    }
    load()
    return () => { mounted = false }
  }, [currentUser?.id])

  const onSave = async (e) => {
    e.preventDefault()
    if (!currentUser?.id) return
    setSaving(true)
    setMessage('')
    try {
      const updated = await updateUserProfile(currentUser.id, { full_name: form.full_name.trim() || null })
      setProfile(updated)
      setMessage('Profile updated successfully.')
    } catch (err) {
      setMessage(err.message || 'Failed to update profile.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="dashboard-page animate-fade-in profile-loading">
        <Loader2 size={22} className="spinning" />
        <span>Loading profile...</span>
      </div>
    )
  }

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-page-header">
        <h2><User size={20} /> Profile</h2>
        <p>View and edit your account details.</p>
      </div>
      <div className="chart-card profile-card">
        <form onSubmit={onSave}>
          <div className="profile-grid">
            <div className="form-field">
              <label>Full Name</label>
              <input
                value={form.full_name}
                onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Your full name"
              />
            </div>
            <div className="form-field">
              <label>Email</label>
              <input value={profile?.email || currentUser?.email || ''} disabled />
            </div>
            <div className="form-field">
              <label>Role</label>
              <input value={profile?.role || '—'} disabled />
            </div>
            <div className="form-field">
              <label>Business ID</label>
              <input value={profile?.business_id || 'Not assigned'} disabled />
            </div>
          </div>
          <div className="profile-actions">
            <button type="submit" className="btn-primary-action" disabled={saving}>
              {saving ? <Loader2 size={16} className="spinning" /> : null}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          {message && <p className="profile-message">{message}</p>}
        </form>
      </div>
    </div>
  )
}

export default ProfilePage
