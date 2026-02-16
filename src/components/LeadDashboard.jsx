import { useState, useMemo } from 'react'
import { Search, Filter, Trash2, Eye, TrendingUp, Calendar, Building2, Mail, Phone, Globe, MapPin, Tag } from 'lucide-react'
import './LeadDashboard.css'
import './LeadDashboard.css'

const LeadDashboard = ({ leads, setLeads }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPriority, setFilterPriority] = useState('all')
  const [selectedLead, setSelectedLead] = useState(null)

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      const matchesSearch = 
        lead.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.industry?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email?.toLowerCase().includes(searchTerm.toLowerCase())
      
      const matchesPriority = filterPriority === 'all' || lead.aiAnalysis?.priority === filterPriority
      
      return matchesSearch && matchesPriority
    })
  }, [leads, searchTerm, filterPriority])

  const handleDelete = (leadId) => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      setLeads(prev => prev.filter(lead => lead.id !== leadId))
      if (selectedLead?.id === leadId) {
        setSelectedLead(null)
      }
    }
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high':
        return 'var(--primary)'
      case 'medium':
        return 'var(--primary)'
      case 'low':
        return 'var(--primary)'
      default:
        return 'var(--text-muted)'
    }
  }

  const getPriorityOpacity = (priority) => {
    switch (priority) {
      case 'high':
        return '0.9'
      case 'medium':
        return '0.6'
      case 'low':
        return '0.3'
      default:
        return '0.2'
    }
  }

  const stats = useMemo(() => {
    const total = leads.length
    const high = leads.filter(l => l.aiAnalysis?.priority === 'high').length
    const medium = leads.filter(l => l.aiAnalysis?.priority === 'medium').length
    const low = leads.filter(l => l.aiAnalysis?.priority === 'low').length
    const avgScore = leads.length > 0
      ? Math.round(leads.reduce((sum, l) => sum + (l.aiAnalysis?.leadScore || 0), 0) / leads.length)
      : 0

    return { total, high, medium, low, avgScore }
  }, [leads])

  if (leads.length === 0) {
    return (
      <div className="dashboard-empty">
        <div className="empty-content">
          <Building2 className="empty-icon" />
          <h2>No Leads Yet</h2>
          <p>Start generating leads to see them here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lead-dashboard">
      <div className="dashboard-header">
        <h2>Lead Dashboard</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Leads</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--primary)', opacity: '0.9' }}>{stats.high}</div>
            <div className="stat-label">High Priority</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--primary)', opacity: '0.6' }}>{stats.medium}</div>
            <div className="stat-label">Medium Priority</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--primary)', opacity: '0.3' }}>{stats.low}</div>
            <div className="stat-label">Low Priority</div>
          </div>
          <div className="stat-card highlight">
            <TrendingUp className="stat-icon" />
            <div className="stat-value">{stats.avgScore}</div>
            <div className="stat-label">Avg Lead Score</div>
          </div>
        </div>
      </div>

      <div className="dashboard-controls">
        <div className="search-box">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-box">
          <Filter className="filter-icon" />
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="leads-list">
          {filteredLeads.map(lead => (
            <div
              key={lead.id}
              className={`lead-card ${selectedLead?.id === lead.id ? 'selected' : ''}`}
              onClick={() => setSelectedLead(lead)}
            >
              <div className="lead-card-header">
                <div className="lead-title">
                  <Building2 className="lead-icon" />
                  <div>
                    <h3>{lead.companyName}</h3>
                    <p className="lead-industry">{lead.industry}</p>
                  </div>
                </div>
                <div className="lead-badges">
                  <span
                    className="priority-badge"
                    style={{ 
                      backgroundColor: `rgba(0, 139, 255, ${getPriorityOpacity(lead.aiAnalysis?.priority)})`, 
                      color: getPriorityColor(lead.aiAnalysis?.priority)
                    }}
                  >
                    {lead.aiAnalysis?.priority || 'N/A'}
                  </span>
                  <span className="score-badge">
                    Score: {lead.aiAnalysis?.leadScore || 'N/A'}
                  </span>
                </div>
              </div>
              <div className="lead-card-body">
                <div className="lead-contact">
                  <div className="contact-item">
                    <Mail className="contact-icon" />
                    <span>{lead.contactName}</span>
                  </div>
                  <div className="contact-item">
                    <Mail className="contact-icon" />
                    <span>{lead.email}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedLead && (
          <div className="lead-details">
            <div className="details-header">
              <h3>Lead Details</h3>
              <button
                className="close-btn"
                onClick={() => setSelectedLead(null)}
              >
                ×
              </button>
            </div>
            <div className="details-content">
              <div className="detail-section">
                <h4>Company Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <Building2 className="detail-icon" />
                    <div>
                      <label>Company Name</label>
                      <p>{selectedLead.companyName}</p>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Tag className="detail-icon" />
                    <div>
                      <label>Industry</label>
                      <p>{selectedLead.industry}</p>
                    </div>
                  </div>
                  <div className="detail-item">
                    <MapPin className="detail-icon" />
                    <div>
                      <label>Location</label>
                      <p>{selectedLead.location || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Globe className="detail-icon" />
                    <div>
                      <label>Website</label>
                      <p>{selectedLead.website || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Tag className="detail-icon" />
                    <div>
                      <label>Company Size</label>
                      <p>{selectedLead.companySize || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4>Contact Information</h4>
                <div className="detail-grid">
                  <div className="detail-item">
                    <Mail className="detail-icon" />
                    <div>
                      <label>Contact Name</label>
                      <p>{selectedLead.contactName}</p>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Mail className="detail-icon" />
                    <div>
                      <label>Email</label>
                      <p>{selectedLead.email}</p>
                    </div>
                  </div>
                  <div className="detail-item">
                    <Phone className="detail-icon" />
                    <div>
                      <label>Phone</label>
                      <p>{selectedLead.phone || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {selectedLead.notes && (
                <div className="detail-section">
                  <h4>Notes</h4>
                  <p className="notes-text">{selectedLead.notes}</p>
                </div>
              )}

              <div className="detail-section">
                <h4>AI Analysis</h4>
                <div className="ai-analysis">
                  <div className="analysis-item">
                    <label>Lead Score</label>
                    <div className="score-bar">
                      <div
                        className="score-fill"
                        style={{
                          width: `${selectedLead.aiAnalysis?.leadScore || 0}%`
                        }}
                      />
                      <span className="score-text">{selectedLead.aiAnalysis?.leadScore || 0}/100</span>
                    </div>
                  </div>
                  <div className="analysis-item">
                    <label>Priority</label>
                    <span
                      className="priority-tag"
                      style={{
                        backgroundColor: `rgba(0, 139, 255, ${getPriorityOpacity(selectedLead.aiAnalysis?.priority)})`,
                        color: getPriorityColor(selectedLead.aiAnalysis?.priority)
                      }}
                    >
                      {selectedLead.aiAnalysis?.priority || 'N/A'}
                    </span>
                  </div>
                  <div className="analysis-item">
                    <label>Estimated Value</label>
                    <p>{selectedLead.aiAnalysis?.estimatedValue || 'N/A'}</p>
                  </div>
                  <div className="analysis-item">
                    <label>Summary</label>
                    <p>{selectedLead.aiAnalysis?.summary || 'N/A'}</p>
                  </div>
                  {selectedLead.aiAnalysis?.recommendedActions && (
                    <div className="analysis-item">
                      <label>Recommended Actions</label>
                      <ul className="actions-list">
                        {selectedLead.aiAnalysis.recommendedActions.map((action, idx) => (
                          <li key={idx}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedLead.aiAnalysis?.nextSteps && (
                    <div className="analysis-item">
                      <label>Next Steps</label>
                      <p>{selectedLead.aiAnalysis.nextSteps}</p>
                    </div>
                  )}
                  {selectedLead.aiAnalysis?.tags && selectedLead.aiAnalysis.tags.length > 0 && (
                    <div className="analysis-item">
                      <label>Tags</label>
                      <div className="tags-list">
                        {selectedLead.aiAnalysis.tags.map((tag, idx) => (
                          <span key={idx} className="tag">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                <h4>Timeline</h4>
                <div className="timeline-item">
                  <Calendar className="timeline-icon" />
                  <div>
                    <label>Processed At</label>
                    <p>{new Date(selectedLead.processedAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="details-actions">
                <button
                  className="btn-danger"
                  onClick={() => handleDelete(selectedLead.id)}
                >
                  <Trash2 className="btn-icon" />
                  Delete Lead
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LeadDashboard
