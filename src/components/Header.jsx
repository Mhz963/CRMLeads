import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  LayoutDashboard,
  Users,
  KanbanSquare,
  MapPinned,
  ChevronDown,
  ClipboardList,
  Shield,
  LogOut,
} from 'lucide-react'
import { signOut } from '../services/authService'
import NotificationBell from './NotificationBell'
import './Header.css'

const Header = ({ user, userProfile }) => {
  const navigate = useNavigate()
  const location = useLocation()

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
  const isGbmRoute = location.pathname === '/gbm'
  const gbmViewParam = new URLSearchParams(location.search).get('view')
  const gbmView = gbmViewParam === 'new' ? 'new' : 'list'

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <Sparkles className="logo-icon" />
          <h1>CRM Leads</h1>
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
            <Users className="nav-icon" />
            Leads
          </NavLink>
          <NavLink
            to="/pipeline"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <KanbanSquare className="nav-icon" />
            Pipeline
          </NavLink>
          <div className={`nav-dropdown ${isGbmRoute ? 'active' : ''}`}>
            <NavLink
              to={`/gbm?view=${gbmView}`}
              className={`nav-tab dropdown-trigger ${isGbmRoute ? 'active' : ''}`}
            >
              <MapPinned className="nav-icon" />
              GBM
              <ChevronDown className="dropdown-icon" />
            </NavLink>
            <div className="dropdown-menu">
              <Link
                to="/gbm?view=new"
                className={`dropdown-item ${isGbmRoute && gbmView === 'new' ? 'active' : ''}`}
              >
                New
              </Link>
              <Link
                to="/gbm?view=list"
                className={`dropdown-item ${isGbmRoute && gbmView === 'list' ? 'active' : ''}`}
              >
                List
              </Link>
            </div>
          </div>
          <NavLink
            to="/tasks"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            <ClipboardList className="nav-icon" />
            Tasks
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
          <NotificationBell />
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
