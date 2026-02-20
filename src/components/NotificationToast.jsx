import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, UserPlus, Mail, Phone, Globe, Zap } from 'lucide-react'
import useNotificationStore from '../stores/notificationStore'
import './NotificationToast.css'

const SOURCE_ICONS = {
  'Website API': <Globe size={14} />,
  'Web Form': <Globe size={14} />,
  'CSV Import': <Zap size={14} />,
  'Manual': <UserPlus size={14} />,
}

const NotificationToast = () => {
  const navigate = useNavigate()
  const toasts = useNotificationStore((s) => s.toasts)
  const removeToast = useNotificationStore((s) => s.removeToast)

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.toastId}
          toast={toast}
          onClose={() => removeToast(toast.toastId)}
          onView={() => {
            removeToast(toast.toastId)
            if (toast.leadId) navigate(`/leads/${toast.leadId}`)
          }}
        />
      ))}
    </div>
  )
}

const ToastItem = ({ toast, onClose, onView }) => {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)

  // Animate progress bar
  useEffect(() => {
    const start = Date.now()
    const duration = 6000
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 50)
    return () => clearInterval(interval)
  }, [])

  const handleClose = () => {
    setExiting(true)
    setTimeout(onClose, 300) // Wait for exit animation
  }

  const handleView = () => {
    setExiting(true)
    setTimeout(onView, 300)
  }

  const sourceIcon = SOURCE_ICONS[toast.source] || <UserPlus size={14} />

  return (
    <div className={`toast-item ${exiting ? 'toast-exit' : 'toast-enter'}`}>
      {/* Glow accent */}
      <div className="toast-glow" />

      {/* Progress bar */}
      <div className="toast-progress">
        <div className="toast-progress-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* Header */}
      <div className="toast-header">
        <div className="toast-badge">
          <UserPlus size={14} />
          <span>New Lead</span>
        </div>
        <button className="toast-close" onClick={handleClose}>
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="toast-body">
        <div className="toast-avatar">
          {toast.leadName?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="toast-info">
          <span className="toast-name">{toast.leadName}</span>
          <div className="toast-details">
            {toast.leadEmail && (
              <span className="toast-detail">
                <Mail size={11} />
                {toast.leadEmail}
              </span>
            )}
            {toast.leadPhone && (
              <span className="toast-detail">
                <Phone size={11} />
                {toast.leadPhone}
              </span>
            )}
          </div>
          <div className="toast-meta">
            <span className="toast-source-badge">
              {sourceIcon}
              {toast.source}
            </span>
            {toast.services && (
              <span className="toast-services">{toast.services}</span>
            )}
          </div>
        </div>
      </div>

      {/* Action */}
      <button className="toast-view-btn" onClick={handleView}>
        View Lead →
      </button>
    </div>
  )
}

export default NotificationToast
