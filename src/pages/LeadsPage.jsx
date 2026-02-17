import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Upload, Filter, RefreshCcw, X, Loader2,
  CheckCircle, AlertCircle, ChevronDown, Eye, Trash2,
  FileSpreadsheet, Globe, ArrowUpDown,
} from 'lucide-react'
import {
  fetchLeads, createLead, deleteLead, importLeadsFromCSV,
  PIPELINE_STAGES, LEAD_SOURCES, LEAD_TAGS,
} from '../services/leadsService'
import { createActivity } from '../services/activitiesService'
import './LeadsPage.css'

/* ── Inline "Add Lead" modal ── */
const EMPTY_FORM = {
  full_name: '',
  email: '',
  phone: '',
  source: 'Manual',
  services: '',
  notes: '',
  tag: '',
}

const LeadsPage = () => {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)

  // UI state
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSource, setFilterSource] = useState('all')
  const [sortField, setSortField] = useState('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCSVModal, setShowCSVModal] = useState(false)
  const [showWebForm, setShowWebForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [csvText, setCsvText] = useState('')
  const [csvResult, setCsvResult] = useState(null)
  const [webForm, setWebForm] = useState({ full_name: '', email: '', phone: '', services: '' })

  // Data
  const { data: leads = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
  })

  const createMutation = useMutation({
    mutationFn: createLead,
    onSuccess: (newLead) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      // Log activity
      createActivity({ lead_id: newLead.id, type: 'created', notes: 'Lead created manually' })
      setShowAddModal(false)
      setForm(EMPTY_FORM)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  /* ── Sort helper ── */
  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
  }

  /* ── Filtered + sorted leads ── */
  const displayedLeads = useMemo(() => {
    let list = [...leads]

    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      list = list.filter(
        (l) =>
          l.full_name?.toLowerCase().includes(q) ||
          l.email?.toLowerCase().includes(q) ||
          l.phone?.toLowerCase().includes(q) ||
          l.source?.toLowerCase().includes(q) ||
          l.notes?.toLowerCase().includes(q) ||
          l.services?.toLowerCase().includes(q)
      )
    }

    // Filter by status
    if (filterStatus !== 'all') {
      list = list.filter((l) => l.status === filterStatus)
    }

    // Filter by source
    if (filterSource !== 'all') {
      list = list.filter((l) => l.source === filterSource)
    }

    // Sort
    list.sort((a, b) => {
      const aVal = a[sortField] || ''
      const bVal = b[sortField] || ''
      if (aVal < bVal) return sortAsc ? -1 : 1
      if (aVal > bVal) return sortAsc ? 1 : -1
      return 0
    })

    return list
  }, [leads, searchTerm, filterStatus, filterSource, sortField, sortAsc])

  /* ── Handlers ── */
  const handleAddLead = (e) => {
    e.preventDefault()
    if (!form.full_name.trim()) return
    createMutation.mutate(form)
  }

  const handleWebFormSubmit = (e) => {
    e.preventDefault()
    if (!webForm.full_name.trim() || !webForm.email.trim()) return
    createMutation.mutate({ ...webForm, source: 'Web Form', status: 'New Lead' }, {
      onSuccess: () => {
        setShowWebForm(false)
        setWebForm({ full_name: '', email: '', phone: '', services: '' })
      },
    })
  }

  const handleCSVImport = async () => {
    if (!csvText.trim()) return
    setCsvResult(null)
    try {
      const result = await importLeadsFromCSV(csvText)
      setCsvResult(result)
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    } catch (err) {
      setCsvResult({ results: [], errors: [err.message] })
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText(ev.target.result)
      setShowCSVModal(true)
    }
    reader.readAsText(file)
    // Reset input
    e.target.value = ''
  }

  const handleDeleteLead = (id) => {
    if (window.confirm('Are you sure you want to delete this lead?')) {
      deleteMutation.mutate(id)
    }
  }

  const getTagStyle = (tag) => {
    switch (tag) {
      case 'Hot':
        return { background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }
      case 'Needs Follow-up':
        return { background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }
      case 'High Value':
        return { background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }
      default:
        return { background: 'var(--primary-opacity-10)', color: 'var(--primary)' }
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'New Lead': return '#008BFF'
      case 'Contacted': return 'rgba(0, 139, 255, 0.8)'
      case 'Interested': return 'rgba(0, 139, 255, 0.65)'
      case 'Proposal': return 'rgba(0, 139, 255, 0.5)'
      case 'Closed': return '#10b981'
      default: return 'var(--text-muted)'
    }
  }

  const SortHeader = ({ field, children }) => (
    <th onClick={() => handleSort(field)} className="sortable-th">
      <span>{children}</span>
      <ArrowUpDown size={12} className={sortField === field ? 'sort-active' : 'sort-icon'} />
    </th>
  )

  return (
    <div className="leads-page animate-fade-in">
      {/* ── Page Header ── */}
      <div className="leads-page-header">
        <div>
          <h2>Leads</h2>
          <p>Manage, import, and track all your leads in one place.</p>
        </div>
        <div className="leads-action-btns">
          <button onClick={() => refetch()} className="btn-outline" title="Refresh">
            <RefreshCcw size={16} />
          </button>
          <button onClick={() => setShowWebForm(true)} className="btn-outline">
            <Globe size={16} />
            Web Form
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="btn-outline">
            <Upload size={16} />
            Import CSV
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />
          <button onClick={() => setShowAddModal(true)} className="btn-primary-action">
            <Plus size={16} />
            Add Lead
          </button>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="leads-filters">
        <div className="search-wrap">
          <Search size={16} className="search-icon-leads" />
          <input
            type="text"
            placeholder="Search by name, email, phone, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <Filter size={14} />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
            <option value="all">All Sources</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="leads-count">{displayedLeads.length} lead{displayedLeads.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="leads-loading">
          <Loader2 size={28} className="spinning" />
          <span>Loading leads...</span>
        </div>
      ) : isError ? (
        <div className="leads-error">
          <AlertCircle size={28} />
          <span>Failed to load leads.</span>
          <button onClick={() => refetch()} className="btn-outline">Retry</button>
        </div>
      ) : displayedLeads.length === 0 ? (
        <div className="leads-empty">
          <FileSpreadsheet size={40} />
          <h3>No leads found</h3>
          <p>{leads.length === 0 ? 'Get started by adding your first lead.' : 'Try adjusting your search or filters.'}</p>
          {leads.length === 0 && (
            <button onClick={() => setShowAddModal(true)} className="btn-primary-action" style={{ marginTop: '1rem' }}>
              <Plus size={16} />
              Add Your First Lead
            </button>
          )}
        </div>
      ) : (
        <div className="leads-table-wrap">
          <table className="leads-table">
            <thead>
              <tr>
                <SortHeader field="full_name">Name</SortHeader>
                <SortHeader field="email">Email</SortHeader>
                <th>Phone</th>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="source">Source</SortHeader>
                <th>Tag</th>
                <SortHeader field="created_at">Created</SortHeader>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link to={`/leads/${lead.id}`} className="lead-name-link">
                      {lead.full_name}
                    </Link>
                  </td>
                  <td className="cell-muted">{lead.email || '—'}</td>
                  <td className="cell-muted">{lead.phone || '—'}</td>
                  <td>
                    <span
                      className="status-pill"
                      style={{ background: `${getStatusColor(lead.status)}20`, color: getStatusColor(lead.status) }}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="cell-muted">{lead.source || '—'}</td>
                  <td>
                    {lead.tag ? (
                      <span className="tag-pill" style={getTagStyle(lead.tag)}>
                        {lead.tag}
                      </span>
                    ) : (
                      <span className="cell-muted">—</span>
                    )}
                  </td>
                  <td className="cell-muted">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/leads/${lead.id}`} className="row-action-btn" title="View">
                        <Eye size={15} />
                      </Link>
                      <button
                        className="row-action-btn danger"
                        onClick={() => handleDeleteLead(lead.id)}
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════  MODALS  ════════ */}

      {/* ── Add Lead Modal ── */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Lead</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddLead} className="modal-form">
              <div className="modal-form-grid">
                <div className="form-field">
                  <label>Name <span className="req">*</span></label>
                  <input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="form-field">
                  <label>Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+64 21 123 4567"
                  />
                </div>
                <div className="form-field">
                  <label>Source</label>
                  <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                    {LEAD_SOURCES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label>Services</label>
                  <input
                    value={form.services}
                    onChange={(e) => setForm({ ...form, services: e.target.value })}
                    placeholder="e.g. Web Design, SEO"
                  />
                </div>
                <div className="form-field">
                  <label>Tag</label>
                  <select value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })}>
                    <option value="">No Tag</option>
                    {LEAD_TAGS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-field full-w">
                <label>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary-action" disabled={createMutation.isPending}>
                  {createMutation.isPending ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />}
                  Create Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {showCSVModal && (
        <div className="modal-overlay" onClick={() => { setShowCSVModal(false); setCsvResult(null); setCsvText('') }}>
          <div className="modal-content modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><FileSpreadsheet size={20} /> CSV Import</h3>
              <button className="modal-close" onClick={() => { setShowCSVModal(false); setCsvResult(null); setCsvText('') }}>
                <X size={18} />
              </button>
            </div>
            <div className="csv-body">
              <p className="csv-help">
                Paste CSV text below or upload a <strong>.csv</strong> file. Expected columns:
                <code>name, email, phone, services, notes</code> (header row required).
              </p>
              <textarea
                className="csv-textarea"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                placeholder={`name,email,phone,services,notes\nJohn Doe,john@example.com,+64211234567,Web Design,Met at conference`}
              />
              {csvResult && (
                <div className="csv-result">
                  {csvResult.results.length > 0 && (
                    <p className="csv-success">
                      <CheckCircle size={16} /> {csvResult.results.length} lead{csvResult.results.length > 1 ? 's' : ''} imported successfully!
                    </p>
                  )}
                  {csvResult.errors.length > 0 && (
                    <div className="csv-errors">
                      <p><AlertCircle size={16} /> {csvResult.errors.length} error(s):</p>
                      <ul>
                        {csvResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn-outline" onClick={() => { setShowCSVModal(false); setCsvResult(null); setCsvText('') }}>
                Close
              </button>
              <button className="btn-primary-action" onClick={handleCSVImport} disabled={!csvText.trim()}>
                <Upload size={16} />
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Web Form Simulation Modal ── */}
      {showWebForm && (
        <div className="modal-overlay" onClick={() => setShowWebForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><Globe size={20} /> Web Form Simulation</h3>
              <button className="modal-close" onClick={() => setShowWebForm(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="webform-desc">
              This simulates a lead capture form that could be embedded on your website. When submitted, a new lead is created automatically with source <strong>"Web Form"</strong>.
            </p>
            <form onSubmit={handleWebFormSubmit} className="modal-form">
              <div className="webform-preview">
                <div className="webform-header">
                  <h4>Get a Free Quote</h4>
                  <p>Fill out the form below and we'll get back to you within 24 hours.</p>
                </div>
                <div className="form-field">
                  <label>Your Name <span className="req">*</span></label>
                  <input
                    value={webForm.full_name}
                    onChange={(e) => setWebForm({ ...webForm, full_name: e.target.value })}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Email Address <span className="req">*</span></label>
                  <input
                    type="email"
                    value={webForm.email}
                    onChange={(e) => setWebForm({ ...webForm, email: e.target.value })}
                    placeholder="john@example.com"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Phone Number</label>
                  <input
                    value={webForm.phone}
                    onChange={(e) => setWebForm({ ...webForm, phone: e.target.value })}
                    placeholder="+64 21 123 4567"
                  />
                </div>
                <div className="form-field">
                  <label>Services Interested In</label>
                  <input
                    value={webForm.services}
                    onChange={(e) => setWebForm({ ...webForm, services: e.target.value })}
                    placeholder="e.g. Website, SEO, Branding"
                  />
                </div>
                <button type="submit" className="webform-submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Submitting...' : 'Submit Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default LeadsPage
