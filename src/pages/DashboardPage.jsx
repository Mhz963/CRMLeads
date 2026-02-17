import { useQuery } from '@tanstack/react-query'
import { Users, TrendingUp, ArrowUpRight, Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { fetchDashboardStats, PIPELINE_STAGES } from '../services/leadsService'
import { fetchDueTasks } from '../services/tasksService'
import { fetchRecentActivities } from '../services/activitiesService'
import './DashboardPage.css'

const CHART_COLORS = [
  'rgba(0, 139, 255, 1)',
  'rgba(0, 139, 255, 0.8)',
  'rgba(0, 139, 255, 0.6)',
  'rgba(0, 139, 255, 0.4)',
  'rgba(0, 139, 255, 0.25)',
]

const DashboardPage = () => {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const { data: dueTasks } = useQuery({
    queryKey: ['due-tasks'],
    queryFn: fetchDueTasks,
  })

  const { data: recentActivities } = useQuery({
    queryKey: ['recent-activities'],
    queryFn: () => fetchRecentActivities(8),
  })

  const s = stats || { totalLeads: 0, byStage: {}, conversionRate: 0, bySource: {}, byTag: {}, newThisWeek: 0 }
  const followUpsDue = dueTasks?.length || 0

  const stageData = PIPELINE_STAGES.map(stage => ({
    name: stage,
    count: s.byStage[stage] || 0,
  }))

  const sourceData = Object.entries(s.bySource).map(([name, value]) => ({ name, value }))

  const getActivityIcon = (type) => {
    switch (type) {
      case 'note': return '📝'
      case 'status_change': return '🔄'
      case 'call': return '📞'
      case 'email': return '📧'
      case 'meeting': return '🤝'
      case 'reminder': return '⏰'
      case 'created': return '✨'
      default: return '📋'
    }
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div className="dashboard-page animate-fade-in">
      <div className="dashboard-page-header">
        <h2>Dashboard</h2>
        <p>Overview of your leads, pipeline, and follow-ups.</p>
      </div>

      {/* ─── Metric Cards ─── */}
      <div className="metric-cards">
        <div className="metric-card">
          <div className="metric-icon-wrap blue">
            <Users size={22} />
          </div>
          <div>
            <p className="metric-label">Total Leads</p>
            <p className="metric-value">{s.totalLeads}</p>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap green">
            <ArrowUpRight size={22} />
          </div>
          <div>
            <p className="metric-label">New This Week</p>
            <p className="metric-value">{s.newThisWeek}</p>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap purple">
            <TrendingUp size={22} />
          </div>
          <div>
            <p className="metric-label">Conversion Rate</p>
            <p className="metric-value">{s.conversionRate}%</p>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap orange">
            <Clock size={22} />
          </div>
          <div>
            <p className="metric-label">Follow-ups Due</p>
            <p className="metric-value">{followUpsDue}</p>
          </div>
        </div>
      </div>

      {/* ─── Charts ─── */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>Leads by Pipeline Stage</h3>
          {statsLoading ? (
            <div className="chart-placeholder">Loading...</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stageData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b6b6b' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#6b6b6b' }} />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid rgba(0,139,255,0.2)',
                    borderRadius: '0.5rem',
                    fontSize: '0.9rem',
                  }}
                />
                <Bar dataKey="count" fill="#008BFF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <h3>Leads by Source</h3>
          {statsLoading || sourceData.length === 0 ? (
            <div className="chart-placeholder">{statsLoading ? 'Loading...' : 'No data yet'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {sourceData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Bottom: Activity + Due Tasks ─── */}
      <div className="bottom-row">
        <div className="feed-card">
          <h3>Recent Activity</h3>
          {(!recentActivities || recentActivities.length === 0) ? (
            <p className="empty-text">No recent activity.</p>
          ) : (
            <div className="activity-feed">
              {recentActivities.map(a => (
                <div key={a.id} className="activity-item">
                  <span className="activity-icon">{getActivityIcon(a.type)}</span>
                  <div className="activity-info">
                    <span className="activity-text">
                      <strong>{a.leads?.full_name || 'Unknown'}</strong>
                      {' — '}{a.notes || a.type}
                    </span>
                    <span className="activity-time">{formatTime(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="feed-card">
          <h3>Follow-ups Due</h3>
          {(!dueTasks || dueTasks.length === 0) ? (
            <p className="empty-text">No follow-ups due. You're all caught up!</p>
          ) : (
            <div className="due-tasks-list">
              {dueTasks.map(t => (
                <div key={t.id} className="due-task-item">
                  <Clock size={16} className="due-icon" />
                  <div className="due-info">
                    <span className="due-title">{t.title}</span>
                    <span className="due-lead">{t.leads?.full_name || ''}</span>
                  </div>
                  <span className="due-date">{new Date(t.due_date).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardPage
