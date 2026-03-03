// ═══════════════════════════════════════════════════════════════════════════
// Notification Store — Zustand
// Hybrid: Supabase Realtime (instant) + Polling fallback (guaranteed)
// + Browser Notifications API (desktop popups like WhatsApp Web)
// ═══════════════════════════════════════════════════════════════════════════

import { create } from 'zustand'
import { supabase } from '../services/supabaseClient'

const MAX_NOTIFICATIONS = 50
const POLL_INTERVAL_MS = 15_000 // 15 seconds
const TOAST_DURATION_MS = 8_000

// ─────────────────────────────────────────────
// Notification Sound  (three-tone ascending chime)
// ─────────────────────────────────────────────
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const t = ctx.currentTime

    const notes = [
      { freq: 587.33, start: 0,    dur: 0.18, vol: 0.20 }, // D5  — pop
      { freq: 880.00, start: 0.10, dur: 0.30, vol: 0.15 }, // A5  — resolve
      { freq: 1174.66, start: 0.22, dur: 0.28, vol: 0.09 }, // D6  — sparkle
    ]

    notes.forEach(({ freq, start, dur, vol }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, t + start)
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(vol, t + start)
      gain.gain.exponentialRampToValueAtTime(0.001, t + start + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t + start)
      osc.stop(t + start + dur)
    })

    setTimeout(() => ctx.close(), 700)
  } catch (_) { /* audio not available */ }
}

// ─────────────────────────────────────────────
// Browser (OS-level) Desktop Notification
// ─────────────────────────────────────────────
function showBrowserNotification(lead) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  try {
    const lines = [
      lead.email,
      lead.phone,
      lead.source ? `Source: ${lead.source}` : null,
      lead.services ? `Services: ${lead.services}` : null,
    ].filter(Boolean).join('\n')

    const notif = new Notification(`🔔 New Lead: ${lead.full_name || 'Unknown'}`, {
      body: lines || 'A new lead has been added to your CRM.',
      icon: '/favicon.ico',
      tag: `lead-${lead.id}`,
      requireInteraction: false,
      silent: true, // we play our own sound
    })

    notif.onclick = () => {
      window.focus()
      notif.close()
    }

    setTimeout(() => notif.close(), 8000)
  } catch (_) { /* ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// Store
// ═══════════════════════════════════════════════════════════════

const useNotificationStore = create((set, get) => ({
  // ── State ──
  notifications: [],
  unreadCount: 0,
  panelOpen: false,
  toasts: [],
  subscription: null,
  pollTimer: null,
  soundEnabled: true,
  browserPermission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  channelStatus: 'idle',
  lastSeenAt: null,
  notifiedIds: new Set(),

  // ── Panel Actions ──
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  closePanel: () => set({ panelOpen: false }),

  markAllRead: () => set((s) => ({
    notifications: s.notifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0,
  })),

  markRead: (id) => set((s) => {
    const updated = s.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    )
    return {
      notifications: updated,
      unreadCount: updated.filter((n) => !n.read).length,
    }
  }),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),

  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

  // ── Request Browser Notification Permission ──
  requestPermission: async () => {
    if (!('Notification' in window)) {
      set({ browserPermission: 'denied' })
      return
    }
    if (Notification.permission === 'granted') {
      set({ browserPermission: 'granted' })
      return
    }
    try {
      const perm = await Notification.requestPermission()
      set({ browserPermission: perm })
    } catch (_) {
      set({ browserPermission: 'denied' })
    }
  },

  // ── Core: Add Notification (deduplicated) ──
  addNotification: (lead) => {
    const { notifiedIds } = get()

    // Skip if we already notified about this lead
    if (lead.id && notifiedIds.has(lead.id)) return

    console.log('[Notifications] 🔔 New lead:', lead.full_name, '| Source:', lead.source)

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

    // Track this ID to prevent duplicates (Realtime + Polling might both fire)
    const newIds = new Set(notifiedIds)
    if (lead.id) newIds.add(lead.id)

    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
      unreadCount: s.unreadCount + 1,
      notifiedIds: newIds,
    }))

    // Show in-app toast
    get().showToast(notification)

    // Play sound
    if (get().soundEnabled) playNotificationSound()

    // Show browser/OS notification (works even when tab is in background)
    showBrowserNotification(lead)
  },

  // ── Toast Management ──
  showToast: (notification) => {
    const toastId = `toast-${Date.now()}-${Math.random()}`
    const toast = { ...notification, toastId }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    setTimeout(() => get().removeToast(toastId), TOAST_DURATION_MS)
  },

  removeToast: (toastId) => set((s) => ({
    toasts: s.toasts.filter((t) => t.toastId !== toastId),
  })),

  // ═══════════════════════════════════════════════════════════
  // Start Listening — Realtime (instant) + Polling (reliable)
  // ═══════════════════════════════════════════════════════════
  startListening: async () => {
    const state = get()
    if (state.subscription || state.pollTimer) {
      console.log('[Notifications] Already listening — skipping')
      return
    }

    // ── 1. Initialize lastSeenAt from the database (avoids clock-skew) ──
    try {
      const { data } = await supabase
        .from('leads')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      set({ lastSeenAt: data?.created_at || new Date().toISOString() })
    } catch (_) {
      set({ lastSeenAt: new Date().toISOString() })
    }

    // ── 2. Supabase Realtime Subscription (instant when it works) ──
    console.log('[Notifications] Starting Realtime subscription …')
    const channel = supabase
      .channel('leads-realtime-v2')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          console.log('[Notifications] ⚡ Realtime INSERT:', payload.new?.full_name)
          if (payload.new) get().addNotification(payload.new)
        }
      )
      .subscribe((status, err) => {
        console.log('[Notifications] Realtime status:', status, err || '')
        set({ channelStatus: status })
        if (status === 'SUBSCRIBED') {
          console.log('[Notifications] ✅ Realtime subscription ACTIVE')
        }
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Notifications] ❌ Realtime error — polling will cover us')
        }
      })

    // ── 3. Polling Fallback (guaranteed — queries DB every 15s) ──
    console.log('[Notifications] Starting polling fallback (every 15s) …')
    const pollTimer = setInterval(async () => {
      try {
        const { lastSeenAt } = get()
        if (!lastSeenAt) return

        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .gt('created_at', lastSeenAt)
          .order('created_at', { ascending: true })

        if (error) {
          console.warn('[Notifications] Poll error:', error.message)
          return
        }

        if (data && data.length > 0) {
          console.log(`[Notifications] 📡 Poll found ${data.length} new lead(s)`)
          data.forEach((lead) => get().addNotification(lead))

          // Move the watermark forward
          const latest = data[data.length - 1].created_at
          set({ lastSeenAt: latest })
        }
      } catch (err) {
        console.warn('[Notifications] Poll exception:', err)
      }
    }, POLL_INTERVAL_MS)

    set({ subscription: channel, pollTimer })
  },

  // ═══════════════════════════════════════════════════════════
  // Stop Listening
  // ═══════════════════════════════════════════════════════════
  stopListening: () => {
    const { subscription, pollTimer } = get()
    if (subscription) supabase.removeChannel(subscription)
    if (pollTimer) clearInterval(pollTimer)
    set({ subscription: null, pollTimer: null, channelStatus: 'idle' })
    console.log('[Notifications] Stopped listening')
  },
}))

export default useNotificationStore
