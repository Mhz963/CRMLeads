import { useState } from 'react'

const TasksPage = () => {
  // Placeholder for future Supabase-backed tasks
  const [tasks] = useState([])

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Tasks & Follow-Ups</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Create and manage reminders to follow up with your leads.
        </p>
      </div>

      {tasks.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>
          Task management will be powered by Supabase tasks table. You can extend this page to
          create, assign, and track follow-ups per lead.
        </p>
      ) : null}
    </div>
  )
}

export default TasksPage

