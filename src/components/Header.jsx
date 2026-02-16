import { Sparkles, LayoutDashboard, Zap } from 'lucide-react'
import './Header.css'
import './Header.css'

const Header = ({ activeTab, setActiveTab }) => {
  return (
    <header className="header">
      <div className="header-content">
        <div className="logo">
          <Sparkles className="logo-icon" />
          <h1>AI CRM Leads</h1>
        </div>
        <nav className="nav-tabs">
          <button
            className={`nav-tab ${activeTab === 'generate' ? 'active' : ''}`}
            onClick={() => setActiveTab('generate')}
          >
            <Zap className="nav-icon" />
            Generate Leads
          </button>
          <button
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard className="nav-icon" />
            Dashboard
          </button>
        </nav>
      </div>
    </header>
  )
}

export default Header
