import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
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
import PlatformPage from './pages/PlatformPage'
import BusinessRegisterPage from './pages/BusinessRegisterPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import CheckoutPage from './pages/CheckoutPage'
import PaymentSuccessPage from './pages/PaymentSuccessPage'
import InvoicesPage from './pages/InvoicesPage'
import ProfilePage from './pages/ProfilePage'
import BusinessInfoPage from './pages/BusinessInfoPage'
import { supabase } from './services/supabaseClient'
import { fetchUserProfile, syncUserProfile } from './services/authService'
import { fetchMySubscription, isSubscriptionActive } from './services/subscriptionService'
import useNotificationStore from './stores/notificationStore'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [profileReady, setProfileReady] = useState(false)
  const [subscription, setSubscription] = useState(null)
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const syncingRef = useRef(false)
  const userRef = useRef(null)
  userRef.current = user

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
        const nextUser = session?.user ?? null
        // Token refresh / tab focus often emits a new user object with the same id — avoid
        // re-running profile + notification effects (prevents full-app "reload" feeling).
        setUser((prev) => {
          if (!nextUser) return null
          if (prev?.id === nextUser.id) return prev
          return nextUser
        })
        if (!nextUser) setUserProfile(null)
      }
    )

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  /* ── 2. Sync profile when auth user id changes (not on token refresh object churn) ── */
  useEffect(() => {
    const userId = user?.id
    if (!userId) {
      setUserProfile(null)
      setSubscription(null)
      setProfileReady(true)
      return
    }

    setProfileReady(false)

    // Guard against duplicate syncs
    if (syncingRef.current) return
    syncingRef.current = true

    const doSync = async () => {
      try {
        const authUser = userRef.current
        if (!authUser || authUser.id !== userId) return

        const synced = await syncUserProfile(authUser)
        if (userRef.current?.id !== userId) return

        const profile = synced || await fetchUserProfile(userId)
        if (userRef.current?.id !== userId) return

        setUserProfile(profile)
        if (profile?.role === 'super_admin') {
          setSubscription(null)
        } else {
          const billing = await fetchMySubscription()
          if (userRef.current?.id !== userId) return
          setSubscription(billing.subscription)
        }
      } catch (err) {
        console.error('Profile sync error:', err)
      } finally {
        syncingRef.current = false
        if (userRef.current?.id === userId) {
          setProfileReady(true)
        }
      }
    }

    doSync()
  }, [user?.id])

  /* ── 3. Start/stop notifications + request browser permission ── */
  const startListening = useNotificationStore((s) => s.startListening)
  const stopListening = useNotificationStore((s) => s.stopListening)
  const requestPermission = useNotificationStore((s) => s.requestPermission)

  useEffect(() => {
    if (user?.id) {
      startListening()
      // Request browser notification permission (like WhatsApp Web)
      requestPermission()
    } else {
      stopListening()
    }
    return () => stopListening()
  }, [user?.id, startListening, stopListening, requestPermission])

  const isLoggedIn = !!user
  const role = userProfile?.role || null
  const hasActiveSubscription = role === 'super_admin' || isSubscriptionActive(subscription)
  const defaultPrivateRoute = role === 'super_admin' ? '/platform' : '/dashboard'
  const isPublicRoute = ['/', '/signin', '/signup', '/business-register'].includes(location.pathname)
  const showParticles = isPublicRoute && !isLoggedIn
  const showHeader = isLoggedIn && !isPublicRoute

  useEffect(() => {
    if (!isLoggedIn || role === 'super_admin') {
      setShowTrialExpiredModal(false)
      return
    }
    const status = String(subscription?.status || '').toLowerCase()
    const isExpiredTrial =
      status === 'trialing' &&
      subscription?.ends_at &&
      new Date(subscription.ends_at).getTime() <= Date.now()
    setShowTrialExpiredModal(Boolean(isExpiredTrial))
  }, [isLoggedIn, role, subscription])

  if (!authReady || (isLoggedIn && !profileReady)) {
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
              element={isLoggedIn ? <Navigate to={defaultPrivateRoute} replace /> : <LandingPage />}
            />
            <Route
              path="/signin"
              element={isLoggedIn ? <Navigate to={defaultPrivateRoute} replace /> : <AuthPage mode="signin" />}
            />
            <Route
              path="/signup"
              element={isLoggedIn ? <Navigate to={defaultPrivateRoute} replace /> : <AuthPage mode="signup" />}
            />
            <Route
              path="/business-register"
              element={isLoggedIn ? <Navigate to={defaultPrivateRoute} replace /> : <BusinessRegisterPage />}
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
                  ? (hasActiveSubscription ? <LeadsPage userProfile={userProfile} /> : <Navigate to="/subscription-required" replace />)
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
            <Route
              path="/profile"
              element={
                isLoggedIn
                  ? <ProfilePage currentUser={user} />
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/business-info"
              element={
                isLoggedIn
                  ? <BusinessInfoPage userProfile={userProfile} />
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/subscriptions"
              element={
                isLoggedIn
                  ? <SubscriptionsPage currentUser={user} userProfile={userProfile} />
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/checkout"
              element={
                isLoggedIn
                  ? <CheckoutPage currentUser={user} userProfile={userProfile} />
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/payment-success"
              element={
                isLoggedIn
                  ? <PaymentSuccessPage />
                  : <Navigate to="/signin" replace />
              }
            />
            <Route
              path="/invoices"
              element={
                isLoggedIn
                  ? <InvoicesPage userProfile={userProfile} />
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
              path="/platform"
              element={
                isLoggedIn ? (
                  role === 'super_admin'
                    ? <PlatformPage />
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
                  role === 'super_admin'
                    ? <Navigate to="/platform" replace />
                    : (
                      <div className="loading-screen">
                        <p>Your subscription is inactive. Please contact the super admin to reactivate your plan.</p>
                      </div>
                    )
                ) : (
                  <Navigate to="/signin" replace />
                )
              }
            />

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          {showTrialExpiredModal && (
            <div className="modal-overlay" onClick={() => setShowTrialExpiredModal(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Trial Ended - Upgrade Required</h3>
                </div>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Your 14-day trial has ended. Please upgrade to the full version to continue using all features.
                </p>
                <div className="modal-actions">
                  <button className="btn-outline" onClick={() => setShowTrialExpiredModal(false)}>Later</button>
                  <button
                    className="btn-primary-action"
                    onClick={() => {
                      setShowTrialExpiredModal(false)
                      navigate('/subscriptions')
                    }}
                  >
                    Upgrade Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
