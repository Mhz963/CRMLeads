import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ParticleBackground from './components/ParticleBackground'
import Header from './components/Header'
import NotificationToast from './components/NotificationToast'
import LeadsPage from './pages/LeadsPage'
import DashboardPage from './pages/DashboardPage'
import PipelinePage from './pages/PipelinePage'
import LeadProfilePage from './pages/LeadProfilePage'
import IntegrationsPage from './pages/IntegrationsPage'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import { supabase } from './services/supabaseClient'
import { syncUserProfile } from './services/authService'
import { fetchMySubscription, isSubscriptionActive } from './services/subscriptionService'
import useNotificationStore from './stores/notificationStore'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const location = useLocation()
  const syncingRef = useRef(false)

  /* ── 1. Listen for auth changes (only set user state, no DB calls) ── */
  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      const currentUser = data.session?.user ?? null
      setUser(currentUser)
      setAuthReady(true)
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        if (!currentUser) setUserProfile(null)
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  /* ── 2. Sync profile to crm_users whenever `user` changes ── */
  useEffect(() => {
    if (!user) {
      setUserProfile(null)
      setSubscription(null)
      return
    }

    // Guard against duplicate syncs
    if (syncingRef.current) return
    syncingRef.current = true

    const doSync = async () => {
      try {
        const profile = await syncUserProfile(user)
        setUserProfile(profile)
        const sub = await fetchMySubscription()
        setSubscription(sub)
      } catch (err) {
        console.error('Profile sync error:', err)
      } finally {
        syncingRef.current = false
      }
    }

    doSync()
  }, [user])

  /* ── 3. Start/stop notifications + request browser permission ── */
  const startListening = useNotificationStore((s) => s.startListening)
  const stopListening = useNotificationStore((s) => s.stopListening)
  const requestPermission = useNotificationStore((s) => s.requestPermission)

  useEffect(() => {
    if (user) {
      startListening()
      // Request browser notification permission (like WhatsApp Web)
      requestPermission()
    } else {
      stopListening()
    }
    return () => stopListening()
  }, [user, startListening, stopListening, requestPermission])

  const isLoggedIn = !!user
  const role = userProfile?.role || null
  const hasActiveSubscription = isSubscriptionActive(subscription)
  const isPublicRoute = ['/', '/signin', '/signup'].includes(location.pathname)
  const showParticles = isPublicRoute && !isLoggedIn

  if (!authReady) {
    return (
      <div className="app">
        <ParticleBackground />
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  const showHeader = isLoggedIn && !isPublicRoute

  return (
    <div className="app">
      {showParticles && <ParticleBackground />}
      {isLoggedIn && <NotificationToast />}
      <div className="app-content">
        {showHeader && <Header user={user} userProfile={userProfile} subscription={subscription} />}
        <main className={showHeader ? 'main-content' : ''}>
          <Routes>
            {/* ── Public routes ── */}
            <Route
              path="/"
              element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <LandingPage />}
            />
            <Route
              path="/signin"
              element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <AuthPage mode="signin" />}
            />
            <Route
              path="/signup"
              element={isLoggedIn ? <Navigate to="/dashboard" replace /> : <AuthPage mode="signup" />}
            />

            {/* ── Protected routes ── */}
            <Route
              path="/dashboard"
              element={
                isLoggedIn
                  ? (hasActiveSubscription ? <DashboardPage /> : <Navigate to="/subscription-required" replace />)
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/leads"
              element={
                isLoggedIn
                  ? (hasActiveSubscription ? <LeadsPage /> : <Navigate to="/subscription-required" replace />)
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/leads/:id"
              element={
                isLoggedIn
                  ? (hasActiveSubscription ? <LeadProfilePage /> : <Navigate to="/subscription-required" replace />)
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/pipeline"
              element={
                isLoggedIn
                  ? (hasActiveSubscription ? <PipelinePage /> : <Navigate to="/subscription-required" replace />)
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/integrations"
              element={
                isLoggedIn
                  ? (hasActiveSubscription ? <IntegrationsPage /> : <Navigate to="/subscription-required" replace />)
                  : <Navigate to="/signin" replace />
              }
            />
            <Route path="/gbm" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/admin"
              element={
                isLoggedIn ? (
                  role === 'admin' || role === 'super_admin'
                    ? <AdminPage currentUser={user} userProfile={userProfile} />
                    : <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/signin" replace />
                )
              }
            />
            <Route
              path="/subscription-required"
              element={
                isLoggedIn ? (
                  <div className="loading-screen">
                    <p>Your subscription is inactive. Please contact the super admin to reactivate your plan.</p>
                  </div>
                ) : (
                  <Navigate to="/signin" replace />
                )
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export default App
