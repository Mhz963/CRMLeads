import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  Sparkles,
  LayoutDashboard,
  Users,
  KanbanSquare,
  Shield,
  Building2,
  User,
  Plug,
  CreditCard,
  Receipt,
  ChevronDown,
  LogOut,
} from 'lucide-react'
import { signOut } from '../services/authService'
import NotificationBell from './NotificationBell'
import './Header.css'

const Header = ({ user, userProfile, subscription }) => {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (e) {
      console.error('Sign-out failed', e)
    }
  }

  const role = userProfile?.role
  const dashboardPath = role === 'super_admin' ? '/platform' : '/dashboard'
  const displayName = userProfile?.full_name || user?.email || ''
  const initial = displayName.charAt(0).toUpperCase()
  const subscriptionStatus = String(subscription?.status || '').toLowerCase()

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <Sparkles className="logo-icon" />
          <h1>CRM Leads</h1>
        </div>

        <nav className="nav-tabs">
          <NavLink
            to={dashboardPath}
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
          {(role === 'admin' || role === 'super_admin') && (
            <NavLink
              to="/admin"
              className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
            >
              <Shield className="nav-icon" />
              User
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
                {role === 'super_admin'
                  ? 'Super Admin'
                  : role === 'admin'
                  ? 'Admin'
                  : role === 'business_member'
                    ? 'Manager'
                    : 'Sales Assistant'}
              </span>
              {subscription?.status && (
                <span
                  className={`role-badge subscription-badge subscription-badge-${subscriptionStatus}`}
                  title="Current subscription status"
                >
                  {String(subscription.status).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="profile-menu-wrap" ref={menuRef}>
            <button
              className="signout-btn"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title="Open profile menu"
            >
              <ChevronDown size={18} />
            </button>
            {menuOpen && (
              <div className="profile-menu">
                <button type="button" onClick={() => { navigate('/profile'); setMenuOpen(false) }}>
                  <User size={15} /> Profile
                </button>
                <button type="button" onClick={() => { navigate('/business-info'); setMenuOpen(false) }}>
                  <Building2 size={15} /> Business Info
                </button>
                <button type="button" onClick={() => { navigate('/integrations'); setMenuOpen(false) }}>
                  <Plug size={15} /> Integrations
                </button>
                <button type="button" onClick={() => { navigate('/subscriptions'); setMenuOpen(false) }}>
                  <CreditCard size={15} /> Subscriptions
                </button>
                <button type="button" onClick={() => { navigate('/invoices'); setMenuOpen(false) }}>
                  <Receipt size={15} /> Invoices
                </button>
                <button type="button" onClick={handleSignOut}>
                  <LogOut size={15} /> Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
