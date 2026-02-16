import { useState } from 'react'
import ParticleBackground from './components/ParticleBackground'
import Header from './components/Header'
import LeadGenerator from './components/LeadGenerator'
import LeadDashboard from './components/LeadDashboard'
import './App.css'

function App() {
  const [leads, setLeads] = useState([])
  const [activeTab, setActiveTab] = useState('generate')

  const handleNewLead = (lead) => {
    setLeads(prev => [lead, ...prev])
    setActiveTab('dashboard')
  }

  return (
    <div className="app">
      <ParticleBackground />
      <div className="app-content">
        <Header activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="main-content">
          {activeTab === 'generate' ? (
            <LeadGenerator onLeadGenerated={handleNewLead} />
          ) : (
            <LeadDashboard leads={leads} setLeads={setLeads} />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
