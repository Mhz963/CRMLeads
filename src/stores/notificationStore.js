// ═══════════════════════════════════════════════════════════════════
// Notification Store — Zustand + Supabase Realtime
// Listens for new leads in real-time and manages notification state
// ═══════════════════════════════════════════════════════════════════

import { create } from 'zustand'
import { supabase } from '../services/supabaseClient'

// Max notifications to keep in panel
const MAX_NOTIFICATIONS = 50

// Generate a clean notification chime using Web Audio API
function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()

    // Note 1 — soft chime
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(830, ctx.currentTime) // ~G#5
    gain1.gain.setValueAtTime(0.15, ctx.currentTime)
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc1.connect(gain1).connect(ctx.destination)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.4)

    // Note 2 — resolving chime
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12) // ~C#6
    gain2.gain.setValueAtTime(0, ctx.currentTime)
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.12)
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
    osc2.connect(gain2).connect(ctx.destination)
    osc2.start(ctx.currentTime + 0.12)
    osc2.stop(ctx.currentTime + 0.55)

    // Cleanup
    setTimeout(() => ctx.close(), 700)
  } catch (_) { /* ignore audio errors */ }
}

const useNotificationStore = create((set, get) => ({
  // ── State ──
  notifications: [],        // Array of { id, leadName, leadEmail, source, timestamp, read }
  unreadCount: 0,
  panelOpen: false,
  toasts: [],               // Active toasts being displayed
  subscription: null,        // Supabase realtime channel
  soundEnabled: true,
  channelStatus: 'idle',     // idle | SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED

  // ── Actions ──

  togglePanel: () => set((state) => ({
    panelOpen: !state.panelOpen,
  })),

  closePanel: () => set({ panelOpen: false }),

  markAllRead: () => set((state) => ({
    notifications: state.notifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0,
  })),

  markRead: (id) => set((state) => {
    const updated = state.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    )
    return {
      notifications: updated,
      unreadCount: updated.filter((n) => !n.read).length,
    }
  }),

  clearAll: () => set({
    notifications: [],
    unreadCount: 0,
  }),

  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  // Add a new notification (called when realtime event fires)
  addNotification: (lead) => {
    console.log('[Notifications] New lead received via Realtime:', lead.full_name || lead.id)

    const notification = {
      id: lead.id || crypto.randomUUID(),
      leadId: lead.id,
      leadName: lead.full_name || 'Unknown',
      leadEmail: lead.email || '',
      leadPhone: lead.phone || '',
      source: lead.source || 'Unknown',
      services: lead.services || '',
      timestamp: new Date().toISOString(),
      read: false,
    }

    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
      unreadCount: state.unreadCount + 1,
    }))

    // Show a toast
    get().showToast(notification)

    // Play sound
    if (get().soundEnabled) {
      get().playSound()
    }
  },

  // Toast management
  showToast: (notification) => {
    const toastId = `toast-${Date.now()}-${Math.random()}`
    const toast = { ...notification, toastId }

    set((state) => ({
      toasts: [...state.toasts, toast],
    }))

    // Auto-remove toast after 6 seconds
    setTimeout(() => {
      get().removeToast(toastId)
    }, 6000)
  },

  removeToast: (toastId) => set((state) => ({
    toasts: state.toasts.filter((t) => t.toastId !== toastId),
  })),

  // Play notification sound (two-tone chime via Web Audio API)
  playSound: () => {
    playNotificationChime()
  },

  // ── Supabase Realtime Subscription ──
  startListening: () => {
    const existing = get().subscription
    if (existing) {
      console.log('[Notifications] Already listening — skipping duplicate subscription')
      return
    }

    console.log('[Notifications] Starting Supabase Realtime subscription on public.leads …')

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads',
        },
        (payload) => {
          console.log('[Notifications] Realtime INSERT event received:', payload)
          const newLead = payload.new
          if (newLead) {
            get().addNotification(newLead)
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Notifications] Channel status:', status, err || '')
        set({ channelStatus: status })

        if (status === 'SUBSCRIBED') {
          console.log('[Notifications] ✅ Realtime subscription ACTIVE — listening for new leads')
        }

        if (status === 'CHANNEL_ERROR') {
          console.error('[Notifications] ❌ Realtime channel error:', err)
          // Retry after 5 seconds
          setTimeout(() => {
            console.log('[Notifications] Retrying subscription …')
            get().stopListening()
            get().startListening()
          }, 5000)
        }

        if (status === 'TIMED_OUT') {
          console.warn('[Notifications] ⏰ Realtime subscription timed out — retrying …')
          setTimeout(() => {
            get().stopListening()
            get().startListening()
          }, 3000)
        }
      })

    set({ subscription: channel })
  },

  stopListening: () => {
    const channel = get().subscription
    if (channel) {
      console.log('[Notifications] Stopping Realtime subscription')
      supabase.removeChannel(channel)
      set({ subscription: null, channelStatus: 'idle' })
    }
  },
}))

export default useNotificationStore
