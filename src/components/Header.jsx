import { NavLink } from 'react-router-dom'
import { Sparkles, LayoutDashboard, Zap } from 'lucide-react'
import './Header.css'

const Header = () => {
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
            Tasks
          </NavLink>
          <NavLink
            to="/reports"
            className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}
          >
            Reports
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

export default Header
