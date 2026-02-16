import { NavLink, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  LayoutDashboard,
  Zap,
  ClipboardList,
  BarChart3,
  Shield,
  LogOut,
  User,
} from 'lucide-react'
import { signOut } from '../services/authService'
import './Header.css'

const Header = ({ user, userProfile }) => {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (e) {
      console.error('Sign-out failed', e)
    }
  }

  const role = userProfile?.role
  const displayName = userProfile?.full_name || user?.email || ''
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <Sparkles className="logo-icon" />
          <h1>AI CRM Leads</h1>
        </div>

        <nav className="nav-tabs">
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard className="nav-icon" />
            Dashboard
          </NavLink>
          <NavLink
            to="/leads"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <Zap className="nav-icon" />
            Leads
          </NavLink>
          <NavLink
            to="/pipeline"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            Pipeline
          </NavLink>
          <NavLink
            to="/tasks"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <ClipboardList className="nav-icon" />
            Tasks
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <BarChart3 className="nav-icon" />
            Reports
          </NavLink>
          {role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              <Shield className="nav-icon" />
              Admin
            </NavLink>
          )}
        </nav>

        <div className="auth-controls">
          <div className="user-info">
            <div className="user-avatar">{initial}</div>
            <div className="user-meta">
              <span className="user-name">{displayName}</span>
              <span className={`role-badge role-badge-${role}`}>
                {role === 'admin' ? 'Admin' : 'Team Member'}
              </span>
            </div>
          </div>
          <button className="signout-btn" type="button" onClick={handleSignOut} title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header
