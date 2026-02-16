import { Routes, Route, Navigate } from 'react-router-dom'
import ParticleBackground from './components/ParticleBackground'
import Header from './components/Header'
import LeadDashboard from './components/LeadDashboard'
import LeadGenerator from './components/LeadGenerator'
import LeadsPage from './pages/LeadsPage'
import TasksPage from './pages/TasksPage'
import DashboardPage from './pages/DashboardPage'
import './App.css'

function App() {
  return (
    <div className="app">
      <ParticleBackground />
      <div className="app-content">
        <Header />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/new-ai" element={<LeadGenerator />} />
            <Route path="/pipeline" element={<LeadDashboard />} />
            <Route path="/tasks" element={<TasksPage />} />
            {/* Stubs for future sections */}
            <Route path="/companies" element={<div>Companies (coming soon)</div>} />
            <Route path="/deals" element={<div>Deals (coming soon)</div>} />
            <Route path="/settings" element={<div>Settings (coming soon)</div>} />
            <Route path="/reports" element={<div>Reports (coming soon)</div>} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
