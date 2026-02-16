import { useQuery } from '@tanstack/react-query'
import { fetchDashboardStats } from '../services/leadsService'
import './DashboardPage.css'

const DashboardPage = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const stats = data || {
    totalLeads: 0,
    byStatus: {},
    avgScore: 0,
    bySource: {},
  }

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-page-header">
        <h2>Overview</h2>
        <p>High-level view of your pipeline, performance, and lead sources.</p>
      </div>

      <div className="dashboard-page-grid">
        <div className="dashboard-card">
          <h3>Total Leads</h3>
          <p className="metric">{stats.totalLeads}</p>
        </div>
        <div className="dashboard-card">
          <h3>Average Lead Score</h3>
          <p className="metric">{stats.avgScore}</p>
        </div>
      </div>

      <div className="dashboard-section">
        <h3>Leads by Status</h3>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <div className="status-list">
            {Object.entries(stats.byStatus).map(([status, count]) => (
              <div key={status} className="status-item">
                <span>{status}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dashboard-section">
        <h3>Leads by Source</h3>
        {isLoading ? (
          <p>Loading...</p>
        ) : (
          <div className="status-list">
            {Object.entries(stats.bySource).map(([source, count]) => (
              <div key={source} className="status-item">
                <span>{source}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardPage

