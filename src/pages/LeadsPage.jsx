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
  business_address: '',
  website: '',
  map_url: '',
  google_rating: '',
  google_reviews: '',
  source: 'Manual',
  services: '',
  notes: '',
  tag: '',
}

const EMPTY_WEB_FORM = {
  full_name: '',
  email: '',
  phone: '',
  service: '',
  number_of_rooms: '',
  property_type: '',
  postcode: '',
  preferred_date: '',
  preferred_time: '',
  additional_message: '',
}

function getLeadPriorityMeta(lead) {
  const status = lead?.status || 'New Lead'
  if (status === 'Closed') {
    return { label: 'Cold', className: 'cold' }
  }
  if (String(lead?.tag || '').toLowerCase() === 'hot') {
    return { label: 'Hot', className: 'hot' }
  }
  const touchDate = lead?.updated_at || lead?.created_at
  const daysSinceTouch = touchDate
    ? Math.floor((Date.now() - new Date(touchDate).getTime()) / (1000 * 60 * 60 * 24))
    : 999
  if (status === 'New Lead' && daysSinceTouch <= 2) {
    return { label: 'Hot', className: 'hot' }
  }
  if (['Contacted', 'Interested', 'Proposal'].includes(status) && daysSinceTouch <= 7) {
    return { label: 'Warm', className: 'warm' }
  }
  if (daysSinceTouch <= 14) {
    return { label: 'Warm', className: 'warm' }
  }
  return { label: 'Cold', className: 'cold' }
}

const LeadsPage = ({ userProfile }) => {
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const isSuperAdmin = String(userProfile?.role || '').toLowerCase() === 'super_admin'

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
  const [webForm, setWebForm] = useState(EMPTY_WEB_FORM)

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
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData(['leads'], (prev = []) => prev.filter((lead) => lead.id !== deletedId))
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
    onError: (err) => {
      console.error('Failed to delete lead:', err)
      alert(err?.message || 'Failed to delete lead')
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
          l.business_address?.toLowerCase().includes(q) ||
          l.website?.toLowerCase().includes(q) ||
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
    createMutation.mutate({
      ...form,
      google_rating: form.google_rating === '' ? null : Number(form.google_rating),
      google_reviews: form.google_reviews === '' ? null : Number(form.google_reviews),
    })
  }

  const handleWebFormSubmit = (e) => {
    e.preventDefault()
    if (!webForm.full_name.trim() || !webForm.email.trim()) return
    createMutation.mutate({
      full_name: webForm.full_name.trim(),
      email: webForm.email.trim(),
      phone: webForm.phone.trim() || null,
      services: webForm.service.trim() || null,
      notes: webForm.additional_message.trim() || null,
      source: 'Web Form',
      status: 'New Lead',
      custom_fields: {
        service: webForm.service.trim() || null,
        number_of_rooms: webForm.number_of_rooms === '' ? null : Number(webForm.number_of_rooms),
        property_type: webForm.property_type.trim() || null,
        postcode: webForm.postcode.trim() || null,
        preferred_date: webForm.preferred_date || null,
        preferred_time: webForm.preferred_time.trim() || null,
        additional_message: webForm.additional_message.trim() || null,
      },
    }, {
      onSuccess: () => {
        setShowWebForm(false)
        setWebForm(EMPTY_WEB_FORM)
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
        <div className="leads-empty">
          <FileSpreadsheet size={40} />
          <h3>Leads are not available yet</h3>
          <p>There are no accessible leads for this business at the moment.</p>
          <button onClick={() => refetch()} className="btn-outline">Refresh</button>
        </div>
      ) : displayedLeads.length === 0 ? (
        <div className="leads-empty">
          <FileSpreadsheet size={40} />
          <h3>No leads available yet</h3>
          <p>{leads.length === 0 ? 'Leads will appear here once they are added.' : 'Try adjusting your search or filters.'}</p>
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
                {isSuperAdmin && <th>Business</th>}
                <th>Business</th>
                <SortHeader field="status">Status</SortHeader>
                <SortHeader field="source">Source</SortHeader>
                <th>Tag</th>
                <th>Priority</th>
                <SortHeader field="created_at">Created</SortHeader>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedLeads.map((lead) => {
                const priority = getLeadPriorityMeta(lead)
                return (
                <tr key={lead.id}>
                  <td>
                    <Link to={`/leads/${lead.id}`} className="lead-name-link">
                      {lead.full_name}
                    </Link>
                  </td>
                  <td className="cell-muted">{lead.email || '—'}</td>
                  <td className="cell-muted">{lead.phone || '—'}</td>
                  {isSuperAdmin && (
                    <td className="cell-muted">
                      {lead.business_id && lead.business_name ? (
                        <Link
                          to={`/platform?tab=businesses&businessId=${encodeURIComponent(lead.business_id)}`}
                          className="lead-name-link"
                        >
                          {lead.business_name}
                        </Link>
                      ) : '—'}
                    </td>
                  )}
                  <td className="cell-muted">
                    <div className="business-cell">
                      {lead.business_address && <div>{lead.business_address}</div>}
                      {lead.website && (
                        <a href={lead.website} target="_blank" rel="noopener noreferrer">
                          {lead.website}
                        </a>
                      )}
                      {(lead.google_rating !== null && lead.google_rating !== undefined) && (
                        <span className="business-rating">
                          {lead.google_rating}/5 {lead.google_reviews ? `(${lead.google_reviews})` : ''}
                        </span>
                      )}
                      {!lead.business_address && !lead.website && lead.google_rating == null && '—'}
                    </div>
                  </td>
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
                  <td>
                    <span className={`priority-pill ${priority.className}`}>{priority.label}</span>
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
              )})}
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
                  <label>Address</label>
                  <input
                    value={form.business_address}
                    onChange={(e) => setForm({ ...form, business_address: e.target.value })}
                    placeholder="Business address"
                  />
                </div>
                <div className="form-field">
                  <label>Website</label>
                  <input
                    value={form.website}
                    onChange={(e) => setForm({ ...form, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="form-field">
                  <label>Google Rating</label>
                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.1"
                    value={form.google_rating}
                    onChange={(e) => setForm({ ...form, google_rating: e.target.value })}
                    placeholder="4.5"
                  />
                </div>
                <div className="form-field">
                  <label>Google Reviews</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.google_reviews}
                    onChange={(e) => setForm({ ...form, google_reviews: e.target.value })}
                    placeholder="120"
                  />
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
                <label>Google Maps URL</label>
                <input
                  value={form.map_url}
                  onChange={(e) => setForm({ ...form, map_url: e.target.value })}
                  placeholder="https://www.google.com/maps/place/?q=place_id:..."
                />
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
              This simulates an embeddable website contact form with custom fields. On submit, lead data is saved with source <strong>"Web Form"</strong> and extra fields go into <strong>custom_fields (JSON)</strong>.
            </p>
            <form onSubmit={handleWebFormSubmit} className="modal-form">
              <div className="webform-preview">
                <div className="webform-header">
                  <h4>Get a Free Quote</h4>
                  <p>Fill out the form below and we'll get back to you within 24 hours.</p>
                </div>
                <div className="webform-grid">
                  <div className="form-field">
                    <label>Full Name <span className="req">*</span></label>
                    <input
                      value={webForm.full_name}
                      onChange={(e) => setWebForm({ ...webForm, full_name: e.target.value })}
                      placeholder="John Doe"
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
                  <label>Select a Service</label>
                  <select
                    value={webForm.service}
                    onChange={(e) => setWebForm({ ...webForm, service: e.target.value })}
                  >
                    <option value="">Select a Service</option>
                    <option value="Carpet Cleaning">Carpet Cleaning</option>
                    <option value="Deep Cleaning">Deep Cleaning</option>
                    <option value="Stain Removal">Stain Removal</option>
                    <option value="Upholstery Cleaning">Upholstery Cleaning</option>
                  </select>
                </div>
                <div className="webform-grid">
                  <div className="form-field">
                    <label>Number of Rooms</label>
                    <input
                      type="number"
                      min="0"
                      value={webForm.number_of_rooms}
                      onChange={(e) => setWebForm({ ...webForm, number_of_rooms: e.target.value })}
                      placeholder="3"
                    />
                  </div>
                  <div className="form-field">
                    <label>Property Type</label>
                    <select
                      value={webForm.property_type}
                      onChange={(e) => setWebForm({ ...webForm, property_type: e.target.value })}
                    >
                      <option value="">Select property type</option>
                      <option value="Apartment">Apartment</option>
                      <option value="House">House</option>
                      <option value="Office">Office</option>
                      <option value="Commercial">Commercial</option>
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label>Postcode</label>
                  <input
                    value={webForm.postcode}
                    onChange={(e) => setWebForm({ ...webForm, postcode: e.target.value })}
                    placeholder="1010"
                  />
                </div>
                <div className="webform-grid">
                  <div className="form-field">
                    <label>Preferred Date</label>
                    <input
                      type="date"
                      value={webForm.preferred_date}
                      onChange={(e) => setWebForm({ ...webForm, preferred_date: e.target.value })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Preferred Time</label>
                    <select
                      value={webForm.preferred_time}
                      onChange={(e) => setWebForm({ ...webForm, preferred_time: e.target.value })}
                    >
                      <option value="">Select time</option>
                      <option value="Morning">Morning</option>
                      <option value="Afternoon">Afternoon</option>
                      <option value="Evening">Evening</option>
                    </select>
                  </div>
                </div>
                <div className="form-field">
                  <label>Additional Message</label>
                  <textarea
                    value={webForm.additional_message}
                    onChange={(e) => setWebForm({ ...webForm, additional_message: e.target.value })}
                    rows={3}
                    placeholder="Tell us anything important..."
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
