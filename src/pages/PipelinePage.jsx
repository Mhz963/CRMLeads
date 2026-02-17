import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, GripVertical, Mail, Phone } from 'lucide-react'
import { fetchLeads, moveLeadStage, PIPELINE_STAGES } from '../services/leadsService'
import { createActivity } from '../services/activitiesService'
import './PipelinePage.css'

const STAGE_COLORS = {
  'New Lead': '#008BFF',
  'Contacted': 'rgba(0, 139, 255, 0.8)',
  'Interested': 'rgba(0, 139, 255, 0.65)',
  'Proposal': 'rgba(0, 139, 255, 0.5)',
  'Closed': '#10b981',
}

const TAG_COLORS = {
  'Hot': { bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' },
  'Needs Follow-up': { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' },
  'High Value': { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981' },
}

const PipelinePage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [draggedLeadId, setDraggedLeadId] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, newStatus }) => moveLeadStage(id, newStatus),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })

  const handleDragStart = (e, leadId) => {
    setDraggedLeadId(leadId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leadId)
  }

  const handleDragOver = (e, stage) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e, stage) => {
    e.preventDefault()
    setDragOverStage(null)
    const leadId = e.dataTransfer.getData('text/plain')
    if (!leadId) return

    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === stage) {
      setDraggedLeadId(null)
      return
    }

    try {
      await moveMutation.mutateAsync({ id: leadId, newStatus: stage })
      // Log status change activity
      await createActivity({
        lead_id: leadId,
        type: 'status_change',
        notes: `Status changed from "${lead.status}" to "${stage}"`,
      })
    } catch (err) {
      console.error('Failed to move lead', err)
    }
    setDraggedLeadId(null)
  }

  const handleDragEnd = () => {
    setDraggedLeadId(null)
    setDragOverStage(null)
  }

  // Group leads by stage
  const leadsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = leads.filter(l => l.status === stage)
    return acc
  }, {})

  if (isLoading) {
    return (
      <div className="pipeline-loading">
        <Loader2 size={32} className="spinning" />
        <p>Loading pipeline...</p>
      </div>
    )
  }

  return (
    <div className="pipeline-page animate-fade-in">
      <div className="pipeline-header">
        <div>
          <h2>Sales Pipeline</h2>
          <p>Drag and drop leads between stages to update their status.</p>
        </div>
        <div className="pipeline-summary">
          <span>{leads.length} total leads</span>
        </div>
      </div>

      <div className="pipeline-board">
        {PIPELINE_STAGES.map(stage => {
          const stageLeads = leadsByStage[stage] || []
          const isOver = dragOverStage === stage

          return (
            <div
              key={stage}
              className={`pipeline-column ${isOver ? 'drag-over' : ''}`}
              onDragOver={(e) => handleDragOver(e, stage)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage)}
            >
              <div className="column-header">
                <div
                  className="column-indicator"
                  style={{ background: STAGE_COLORS[stage] }}
                />
                <h3>{stage}</h3>
                <span className="column-count">{stageLeads.length}</span>
              </div>

              <div className="column-body">
                {stageLeads.length === 0 ? (
                  <div className="column-empty">
                    <p>No leads</p>
                  </div>
                ) : (
                  stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      className={`pipeline-card ${draggedLeadId === lead.id ? 'dragging' : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      onDragEnd={handleDragEnd}
                      onClick={() => navigate(`/leads/${lead.id}`)}
                    >
                      <div className="pipeline-card-top">
                        <GripVertical size={14} className="drag-handle" />
                        <span className="card-name">{lead.full_name}</span>
                      </div>

                      {lead.email && (
                        <div className="card-detail">
                          <Mail size={12} />
                          <span>{lead.email}</span>
                        </div>
                      )}
                      {lead.phone && (
                        <div className="card-detail">
                          <Phone size={12} />
                          <span>{lead.phone}</span>
                        </div>
                      )}

                      <div className="card-footer">
                        {lead.tag && (
                          <span
                            className="card-tag"
                            style={{
                              background: TAG_COLORS[lead.tag]?.bg || 'var(--primary-opacity-10)',
                              color: TAG_COLORS[lead.tag]?.color || 'var(--primary)',
                            }}
                          >
                            {lead.tag}
                          </span>
                        )}
                        {lead.source && (
                          <span className="card-source">{lead.source}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PipelinePage
