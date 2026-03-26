import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Mail, Phone, Globe, Tag, Clock, Plus,
  Edit3, CheckCircle, Loader2, Trash2, Calendar, MessageSquare, Send, MapPin,
} from 'lucide-react'
import { fetchLeadById, updateLead, deleteLead, PIPELINE_STAGES, LEAD_TAGS } from '../services/leadsService'
import { fetchActivitiesByLead, createActivity } from '../services/activitiesService'
import { fetchTasksByLead, createTask, completeTask, deleteTask } from '../services/tasksService'
import './LeadProfilePage.css'

const TAG_STYLES = {
  'Hot': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
  'Needs Follow-up': { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
  'High Value': { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
}

function toPrettyLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function toDisplayValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.trim() || '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const clean = value.filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
    return clean.length ? clean.join(', ') : '—'
  }
  try {
    return JSON.stringify(value)
  } catch {
    return '—'
  }
}

const LeadProfilePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [noteText, setNoteText] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ['lead', id],
    queryFn: () => fetchLeadById(id),
  })

  const { data: activities = [] } = useQuery({
    queryKey: ['lead-activities', id],
    queryFn: () => fetchActivitiesByLead(id),
    enabled: !!id,
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['lead-tasks', id],
    queryFn: () => fetchTasksByLead(id),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (updates) => updateLead(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', id] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      navigate('/leads')
    },
    onError: (err) => {
      console.error('Failed to delete lead:', err)
      alert(err?.message || 'Failed to delete lead')
    },
  })

  const addNoteMutation = useMutation({
    mutationFn: (note) => createActivity({ lead_id: id, type: 'note', notes: note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-activities', id] })
      queryClient.invalidateQueries({ queryKey: ['recent-activities'] })
      setNoteText('')
    },
    onError: (err) => {
      console.error('Failed to add interaction note:', err)
      alert(err?.message || 'Failed to add interaction note.')
    },
  })

  const addTaskMutation = useMutation({
    mutationFn: (payload) => createTask(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', id] })
      queryClient.invalidateQueries({ queryKey: ['due-tasks'] })
      setTaskTitle('')
      setTaskDueDate('')
    },
  })

  const completeTaskMutation = useMutation({
    mutationFn: (taskId) => completeTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', id] })
      queryClient.invalidateQueries({ queryKey: ['due-tasks'] })
    },
  })

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId) => deleteTask(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-tasks', id] })
      queryClient.invalidateQueries({ queryKey: ['due-tasks'] })
    },
  })

  const handleStatusChange = async (newStatus) => {
    if (!lead || lead.status === newStatus) return
    const oldStatus = lead.status
    await updateMutation.mutateAsync({ status: newStatus })
    await createActivity({
      lead_id: id,
      type: 'status_change',
      notes: `Status changed from "${oldStatus}" to "${newStatus}"`,
    })
    queryClient.invalidateQueries({ queryKey: ['lead-activities', id] })
  }

  const handleTagChange = (newTag) => {
    updateMutation.mutate({ tag: newTag || null })
  }

  const handleAddNote = () => {
    if (!noteText.trim()) return
    addNoteMutation.mutate(noteText.trim())
  }

  const handleAddTask = () => {
    if (!taskTitle.trim()) return
    addTaskMutation.mutate({
      title: taskTitle.trim(),
      lead_id: id,
      due_date: taskDueDate || null,
    })
  }

  const handleSaveEdit = () => {
    updateMutation.mutate({
      ...editForm,
      google_rating:
        editForm.google_rating === '' || editForm.google_rating === null
          ? null
          : Number(editForm.google_rating),
      google_reviews:
        editForm.google_reviews === '' || editForm.google_reviews === null
          ? null
          : Number(editForm.google_reviews),
    })
    setIsEditing(false)
  }

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this lead? This cannot be undone.')) {
      deleteMutation.mutate()
    }
  }

  const startEdit = () => {
    setEditForm({
      full_name: lead.full_name,
      email: lead.email || '',
      phone: lead.phone || '',
      business_address: lead.business_address || '',
      website: lead.website || '',
      map_url: lead.map_url || '',
      google_rating: lead.google_rating ?? '',
      google_reviews: lead.google_reviews ?? '',
      services: lead.services || '',
      notes: lead.notes || '',
    })
    setIsEditing(true)
  }

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

  if (leadLoading) {
    return (
      <div className="profile-loading">
        <Loader2 size={32} className="spinning" />
        <p>Loading lead...</p>
      </div>
    )
  }

  if (!lead) {
    return (
      <div className="profile-not-found">
        <h2>Lead not found</h2>
        <Link to="/leads">Back to Leads</Link>
      </div>
    )
  }

  const tagStyle = TAG_STYLES[lead.tag] || null
  const customFields =
    lead.custom_fields && typeof lead.custom_fields === 'object' && !Array.isArray(lead.custom_fields)
      ? lead.custom_fields
      : {}
  const customFieldEntries = Object.entries(customFields).filter(([, value]) => {
    if (value === null || value === undefined) return false
    if (typeof value === 'string' && !value.trim()) return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  })

  return (
    <div className="lead-profile animate-fade-in">
      {/* Top Bar */}
      <div className="profile-top">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
          Back
        </button>
        <div className="profile-actions-top">
          <button className="btn-icon-action" onClick={startEdit} title="Edit lead">
            <Edit3 size={16} />
          </button>
          <button className="btn-icon-action danger" onClick={handleDelete} title="Delete lead">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Header Card */}
      <div className="profile-header-card">
        <div className="profile-avatar">
          {lead.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="profile-info">
          <h1>{lead.full_name}</h1>
          <div className="profile-badges">
            <select
              className="status-select"
              value={lead.status}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              {PIPELINE_STAGES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              className="tag-select"
              value={lead.tag || ''}
              onChange={(e) => handleTagChange(e.target.value)}
              style={tagStyle ? { background: tagStyle.bg, color: tagStyle.color, borderColor: tagStyle.border } : {}}
            >
              <option value="">No Tag</option>
              {LEAD_TAGS.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Edit Inline */}
      {isEditing && (
        <div className="edit-card">
          <h3>Edit Lead</h3>
          <div className="edit-form">
            <div className="edit-field">
              <label>Name</label>
              <input value={editForm.full_name} onChange={e => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Email</label>
              <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Phone</label>
              <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Services</label>
              <input value={editForm.services} onChange={e => setEditForm({ ...editForm, services: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Address</label>
              <input value={editForm.business_address} onChange={e => setEditForm({ ...editForm, business_address: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Website</label>
              <input value={editForm.website} onChange={e => setEditForm({ ...editForm, website: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Google Rating</label>
              <input type="number" min="0" max="5" step="0.1" value={editForm.google_rating} onChange={e => setEditForm({ ...editForm, google_rating: e.target.value })} />
            </div>
            <div className="edit-field">
              <label>Google Reviews</label>
              <input type="number" min="0" step="1" value={editForm.google_reviews} onChange={e => setEditForm({ ...editForm, google_reviews: e.target.value })} />
            </div>
            <div className="edit-field full">
              <label>Google Maps URL</label>
              <input value={editForm.map_url} onChange={e => setEditForm({ ...editForm, map_url: e.target.value })} />
            </div>
            <div className="edit-field full">
              <label>Notes</label>
              <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
            </div>
            <div className="edit-actions">
              <button className="btn-sm primary" onClick={handleSaveEdit}>Save Changes</button>
              <button className="btn-sm" onClick={() => setIsEditing(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="profile-grid">
        {/* Left Column */}
        <div className="profile-left">
          {/* Contact Details */}
          <div className="profile-card">
            <h3>Contact Details</h3>
            <div className="detail-rows">
              {lead.email && (
                <div className="detail-row">
                  <Mail size={16} />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="detail-row">
                  <Phone size={16} />
                  <span>{lead.phone}</span>
                </div>
              )}
              {lead.business_address && (
                <div className="detail-row">
                  <MapPin size={16} />
                  <span>{lead.business_address}</span>
                </div>
              )}
              {lead.website && (
                <div className="detail-row">
                  <Globe size={16} />
                  <a href={lead.website} target="_blank" rel="noopener noreferrer">
                    {lead.website}
                  </a>
                </div>
              )}
              {(lead.google_rating !== null && lead.google_rating !== undefined) && (
                <div className="detail-row">
                  <Tag size={16} />
                  <span>
                    Rating: {lead.google_rating}/5 {lead.google_reviews ? `(${lead.google_reviews} reviews)` : ''}
                  </span>
                </div>
              )}
              {lead.services && (
                <div className="detail-row">
                  <Globe size={16} />
                  <span>{lead.services}</span>
                </div>
              )}
              {lead.source && (
                <div className="detail-row">
                  <Tag size={16} />
                  <span>Source: {lead.source}</span>
                </div>
              )}
              {lead.user_ip && (
                <div className="detail-row">
                  <MapPin size={16} />
                  <span>IP: {lead.user_ip}</span>
                </div>
              )}
              {lead.map_url && (
                <div className="detail-row">
                  <Globe size={16} />
                  <a href={lead.map_url} target="_blank" rel="noopener noreferrer">
                    Open in Google Maps
                  </a>
                </div>
              )}
              <div className="detail-row">
                <Clock size={16} />
                <span>Created: {new Date(lead.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            {lead.notes && (
              <div className="lead-notes-box">
                <strong>Notes:</strong>
                <p>{lead.notes}</p>
              </div>
            )}
            {customFieldEntries.length > 0 && (
              <div className="custom-fields-box">
                <strong>Custom Fields:</strong>
                <div className="custom-fields-grid">
                  {customFieldEntries.map(([key, value]) => (
                    <div key={key} className="custom-field-item">
                      <span className="custom-field-key">{toPrettyLabel(key)}</span>
                      <span className="custom-field-value">{toDisplayValue(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Note */}
          <div className="profile-card">
            <h3><MessageSquare size={18} /> Add Interaction Note</h3>
            <div className="add-note-form">
              <textarea
                placeholder="Add a note about this lead..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={3}
              />
              <button
                className="btn-sm primary"
                onClick={handleAddNote}
                disabled={!noteText.trim() || addNoteMutation.isPending}
              >
                <Send size={14} />
                Add Note
              </button>
            </div>
          </div>

          {/* Follow-up Reminders */}
          <div className="profile-card">
            <h3><Calendar size={18} /> Follow-up Reminders</h3>
            <div className="add-task-form">
              <input
                type="text"
                placeholder="Reminder title..."
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
              />
              <input
                type="date"
                value={taskDueDate}
                onChange={e => setTaskDueDate(e.target.value)}
              />
              <button
                className="btn-sm primary"
                onClick={handleAddTask}
                disabled={!taskTitle.trim() || addTaskMutation.isPending}
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            <div className="tasks-list">
              {tasks.length === 0 ? (
                <p className="empty-msg">No reminders set.</p>
              ) : (
                tasks.map(t => (
                  <div key={t.id} className={`task-item ${t.status === 'completed' ? 'completed' : ''}`}>
                    <button
                      className="task-check"
                      onClick={() => t.status !== 'completed' && completeTaskMutation.mutate(t.id)}
                      title={t.status === 'completed' ? 'Completed' : 'Mark complete'}
                    >
                      <CheckCircle size={16} />
                    </button>
                    <div className="task-info">
                      <span className="task-name">{t.title}</span>
                      {t.due_date && <span className="task-due">{new Date(t.due_date).toLocaleDateString()}</span>}
                    </div>
                    <button className="task-delete" onClick={() => deleteTaskMutation.mutate(t.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Activity Timeline */}
        <div className="profile-right">
          <div className="profile-card">
            <h3>Activity Timeline</h3>
            {activities.length === 0 ? (
              <p className="empty-msg">No activity recorded yet.</p>
            ) : (
              <div className="timeline">
                {activities.map(a => (
                  <div key={a.id} className="timeline-entry">
                    <div className="timeline-dot">{getActivityIcon(a.type)}</div>
                    <div className="timeline-content">
                      <div className="timeline-header-row">
                        <span className="timeline-type">{a.type?.replace('_', ' ')}</span>
                        <span className="timeline-date">
                          {new Date(a.created_at).toLocaleDateString()}{' '}
                          {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {a.notes && <p className="timeline-notes">{a.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AI Summary - Commented Out */}
          {/*
          <div className="profile-card ai-card">
            <h3>AI Lead Summary</h3>
            <p className="ai-summary">
              AI-powered summary and recommendations for this lead.
              Includes smart scoring, suggested actions, and estimated deal value.
            </p>
            <button className="btn-sm primary" disabled>
              Generate AI Summary
            </button>
          </div>
          */}
        </div>
      </div>
    </div>
  )
}

export default LeadProfilePage
