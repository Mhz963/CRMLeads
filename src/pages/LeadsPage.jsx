import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, RefreshCcw } from 'lucide-react'
import { fetchLeads, LEAD_STATUSES } from '../services/leadsService'
import LeadDashboard from '../components/LeadDashboard'

const LeadsPage = () => {
  const [localLeads, setLocalLeads] = useState([])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
  })

  const leads = data || localLeads

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Leads</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            Manage your leads and track their status through the pipeline.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => refetch()}
            className="btn btn-secondary"
            type="button"
          >
            <RefreshCcw className="btn-icon" />
            Refresh
          </button>
          <Link to="/leads/new-ai" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            <Plus className="btn-icon" />
            New Lead (AI)
          </Link>
        </div>
      </div>

      {isLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading leads...</p>}
      {isError && <p style={{ color: 'var(--error)' }}>Failed to load leads.</p>}

      {/* Reuse existing dashboard UI as a list/inspector for now */}
      <LeadDashboard leads={leads} setLeads={setLocalLeads} />
    </div>
  )
}

export default LeadsPage

