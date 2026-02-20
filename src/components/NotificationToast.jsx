import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  X, UserPlus, Mail, Phone, Globe, Zap,
  Sparkles, ArrowRight,
} from 'lucide-react'
import useNotificationStore from '../stores/notificationStore'
import './NotificationToast.css'

/* Source → icon + colours */
const SOURCE_CFG = {
  'Website API': { Icon: Globe,    color: '#10b981', bg: 'rgba(16,185,129,.10)' },
  'Web Form':    { Icon: Globe,    color: '#3b82f6', bg: 'rgba(59,130,246,.10)' },
  'CSV Import':  { Icon: Zap,      color: '#f59e0b', bg: 'rgba(245,158,11,.10)' },
  'Manual':      { Icon: UserPlus, color: '#8b5cf6', bg: 'rgba(139,92,246,.10)' },
  'Referral':    { Icon: Sparkles, color: '#ec4899', bg: 'rgba(236,72,153,.10)' },
}
const DEFAULT_CFG = { Icon: UserPlus, color: '#6366f1', bg: 'rgba(99,102,241,.10)' }

/* ═══════════════════  TOAST CONTAINER  ═══════════════════ */
const NotificationToast = () => {
  const navigate = useNavigate()
  const toasts = useNotificationStore((s) => s.toasts)
  const removeToast = useNotificationStore((s) => s.removeToast)

  return (
    <div className="nt-container">
      {toasts.map((toast) => (
        <ToastCard
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

/* ═══════════════════  SINGLE TOAST  ═══════════════════ */
const ToastCard = ({ toast, onClose, onView }) => {
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)

  /* Smooth progress bar via requestAnimationFrame */
  useEffect(() => {
    const start = Date.now()
    let raf
    const tick = () => {
      const pct = Math.max(0, 100 - ((Date.now() - start) / 8000) * 100)
      setProgress(pct)
      if (pct > 0) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handleClose = () => { setExiting(true); setTimeout(onClose, 400) }
  const handleView  = () => { setExiting(true); setTimeout(onView, 400) }

  const cfg = SOURCE_CFG[toast.source] || DEFAULT_CFG
  const SourceIcon = cfg.Icon

  const initials = (toast.leadName || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const timeStr = new Date(toast.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`nt-card ${exiting ? 'nt-exit' : 'nt-enter'}`}>
      {/* ── Gradient accent bar ── */}
      <div className="nt-accent">
        <div className="nt-accent-fill" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Header ── */}
      <div className="nt-header">
        <div className="nt-label">
          <span className="nt-dot" />
          NEW LEAD
        </div>
        <div className="nt-header-right">
          <span className="nt-time">{timeStr}</span>
          <button className="nt-close" onClick={handleClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Body (clickable) ── */}
      <div className="nt-body" onClick={handleView} role="button" tabIndex={0}>
        <div className="nt-avatar">{initials}</div>

        <div className="nt-info">
          <span className="nt-name">{toast.leadName}</span>

          <div className="nt-contact">
            {toast.leadEmail && (
              <span className="nt-contact-item">
                <Mail size={11} /> {toast.leadEmail}
              </span>
            )}
            {toast.leadPhone && (
              <span className="nt-contact-item">
                <Phone size={11} /> {toast.leadPhone}
              </span>
            )}
          </div>

          <div className="nt-tags">
            <span
              className="nt-source-pill"
              style={{ color: cfg.color, background: cfg.bg }}
            >
              <SourceIcon size={11} />
              {toast.source}
            </span>
            {toast.services && (
              <span className="nt-service-pill">{toast.services}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Action button ── */}
      <button className="nt-action" onClick={handleView}>
        View Lead Profile
        <ArrowRight size={14} />
      </button>
    </div>
  )
}

export default NotificationToast
