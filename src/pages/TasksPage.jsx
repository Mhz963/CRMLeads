import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  CheckCircle, Circle, Trash2, Clock, Calendar, Loader2,
  Filter, AlertCircle, ClipboardList, Plus, X,
} from 'lucide-react'
import {
  fetchTasks, createTask, completeTask, deleteTask,
} from '../services/tasksService'
import { fetchLeads } from '../services/leadsService'
import './TasksPage.css'

const FILTER_OPTIONS = ['all', 'pending', 'completed', 'overdue']

const TasksPage = () => {
  const queryClient = useQueryClient()

  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newLeadId, setNewLeadId] = useState('')

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: fetchTasks,
  })

  const { data: leads = [] } = useQuery({
    queryKey: ['leads'],
    queryFn: fetchLeads,
  })

  const addMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['due-tasks'] })
      setNewTitle('')
      setNewDueDate('')
      setNewLeadId('')
      setShowAdd(false)
    },
  })

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['due-tasks'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['due-tasks'] })
    },
  })

  const today = new Date().toISOString().split('T')[0]

  const isOverdue = (task) =>
    task.status === 'pending' && task.due_date && task.due_date < today

  const filteredTasks = useMemo(() => {
    let list = [...tasks]
    if (filter === 'pending') list = list.filter((t) => t.status === 'pending' && !isOverdue(t))
    else if (filter === 'completed') list = list.filter((t) => t.status === 'completed')
    else if (filter === 'overdue') list = list.filter(isOverdue)
    return list
  }, [tasks, filter, today])

  // Counts
  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending' && !isOverdue(t)).length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    overdue: tasks.filter(isOverdue).length,
  }), [tasks, today])

  const handleAdd = (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    addMutation.mutate({
      title: newTitle.trim(),
      due_date: newDueDate || null,
      lead_id: newLeadId || null,
    })
  }

  const handleComplete = (id) => completeMutation.mutate(id)
  const handleDelete = (id) => {
    if (window.confirm('Delete this task?')) deleteMutation.mutate(id)
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="tasks-page animate-fade-in">
      <div className="tasks-header">
        <div>
          <h2>Tasks & Follow-Ups</h2>
          <p>Manage your reminders and follow-up tasks for leads.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary-action">
          <Plus size={16} />
          New Task
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="task-filter-tabs">
        {FILTER_OPTIONS.map((f) => (
          <button
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''} ${f === 'overdue' && counts.overdue > 0 ? 'has-overdue' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' && 'All'}
            {f === 'pending' && 'Pending'}
            {f === 'completed' && 'Completed'}
            {f === 'overdue' && 'Overdue'}
            <span className="tab-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="tasks-loading">
          <Loader2 size={28} className="spinning" />
          <span>Loading tasks...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="tasks-empty">
          <ClipboardList size={40} />
          <h3>{filter === 'all' ? 'No tasks yet' : `No ${filter} tasks`}</h3>
          <p>
            {filter === 'all'
              ? 'Create tasks from lead profiles or click "New Task" above.'
              : 'Try changing the filter.'}
          </p>
        </div>
      ) : (
        <div className="tasks-list-container">
          {filteredTasks.map((task) => {
            const overdue = isOverdue(task)
            const done = task.status === 'completed'
            return (
              <div key={task.id} className={`task-row ${done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
                <button
                  className="task-toggle"
                  onClick={() => !done && handleComplete(task.id)}
                  title={done ? 'Completed' : 'Mark as complete'}
                >
                  {done ? <CheckCircle size={20} /> : <Circle size={20} />}
                </button>

                <div className="task-body">
                  <span className="task-title-text">{task.title}</span>
                  <div className="task-meta">
                    {task.due_date && (
                      <span className={`task-due-badge ${overdue ? 'overdue-badge' : ''}`}>
                        <Calendar size={12} />
                        {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.leads && (
                      <Link to={`/leads/${task.leads.id}`} className="task-lead-link">
                        {task.leads.full_name}
                      </Link>
                    )}
                  </div>
                </div>

                <button
                  className="task-delete-btn"
                  onClick={() => handleDelete(task.id)}
                  title="Delete task"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Task Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3>New Task</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAdd} className="modal-form">
              <div className="form-field">
                <label>Title <span className="req">*</span></label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Follow up with client"
                  required
                  autoFocus
                />
              </div>
              <div className="form-field">
                <label>Due Date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Linked Lead</label>
                <select value={newLeadId} onChange={(e) => setNewLeadId(e.target.value)}>
                  <option value="">None</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>{l.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn-primary-action" disabled={addMutation.isPending}>
                  {addMutation.isPending ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />}
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TasksPage
