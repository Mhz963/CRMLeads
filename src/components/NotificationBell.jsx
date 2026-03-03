import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell, CheckCheck, Trash2, Volume2, VolumeX,
  UserPlus, Mail, Phone, Globe, Zap, Clock,
} from 'lucide-react'
import useNotificationStore from '../stores/notificationStore'
import './NotificationBell.css'

const SOURCE_ICONS = {
  'Website API': <Globe size={12} />,
  'Web Form': <Globe size={12} />,
  'CSV Import': <Zap size={12} />,
  'Manual': <UserPlus size={12} />,
}

const NotificationBell = () => {
  const navigate = useNavigate()
  const panelRef = useRef(null)
  const bellRef = useRef(null)

  const {
    notifications,
    unreadCount,
    panelOpen,
    soundEnabled,
    togglePanel,
    closePanel,
    markAllRead,
    markRead,
    clearAll,
    toggleSound,
  } = useNotificationStore()

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        panelOpen &&
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        bellRef.current &&
        !bellRef.current.contains(e.target)
      ) {
        closePanel()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [panelOpen, closePanel])

  const formatTime = (dateStr) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diff = now - d
    const secs = Math.floor(diff / 1000)
    if (secs < 10) return 'just now'
    if (secs < 60) return `${secs}s ago`
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const handleNotifClick = (notif) => {
    markRead(notif.id)
    closePanel()
    if (notif.leadId) navigate(`/leads/${notif.leadId}`)
  }

  return (
    <div className="notif-bell-wrap">
      {/* Bell Button */}
      <button
        ref={bellRef}
        className={`notif-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={togglePanel}
        title={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {unreadCount > 0 && <span className="notif-ping" />}
      </button>

      {/* Dropdown Panel */}
      {panelOpen && (
        <div ref={panelRef} className="notif-panel">
          {/* Panel Header */}
          <div className="notif-panel-header">
            <div className="notif-panel-title">
              <h3>Notifications</h3>
              {unreadCount > 0 && (
                <span className="notif-unread-count">{unreadCount} new</span>
              )}
            </div>
            <div className="notif-panel-actions">
              <button
                className="notif-action-btn"
                onClick={toggleSound}
                title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </button>
              {unreadCount > 0 && (
                <button
                  className="notif-action-btn"
                  onClick={markAllRead}
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  className="notif-action-btn danger"
                  onClick={clearAll}
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Panel Body */}
          <div className="notif-panel-body">
            {notifications.length === 0 ? (
              <div className="notif-empty">
                <Bell size={32} />
                <p>No notifications yet</p>
                <span>New leads will appear here in real-time</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`notif-item ${!notif.read ? 'unread' : ''}`}
                  onClick={() => handleNotifClick(notif)}
                >
                  {/* Unread indicator */}
                  {!notif.read && <div className="notif-unread-dot" />}

                  <div className="notif-item-avatar">
                    {notif.leadName?.charAt(0)?.toUpperCase() || '?'}
                  </div>

                  <div className="notif-item-content">
                    <div className="notif-item-top">
                      <span className="notif-item-name">{notif.leadName}</span>
                      <span className="notif-item-time">
                        <Clock size={10} />
                        {formatTime(notif.timestamp)}
                      </span>
                    </div>

                    <div className="notif-item-details">
                      {notif.leadEmail && (
                        <span className="notif-item-detail">
                          <Mail size={10} />
                          {notif.leadEmail}
                        </span>
                      )}
                    </div>

                    <div className="notif-item-tags">
                      <span className="notif-source-pill">
                        {SOURCE_ICONS[notif.source] || <UserPlus size={10} />}
                        {notif.source}
                      </span>
                      {notif.services && (
                        <span className="notif-service-pill">{notif.services}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Panel Footer */}
          {notifications.length > 0 && (
            <div className="notif-panel-footer">
              <button onClick={() => { closePanel(); navigate('/leads') }}>
                View All Leads →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NotificationBell
