import { useEffect, useState, useRef } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ParticleBackground from './components/ParticleBackground'
import Header from './components/Header'
import LeadsPage from './pages/LeadsPage'
import TasksPage from './pages/TasksPage'
import DashboardPage from './pages/DashboardPage'
import PipelinePage from './pages/PipelinePage'
import LeadProfilePage from './pages/LeadProfilePage'
import LandingPage from './pages/LandingPage'
import AuthPage from './pages/AuthPage'
import AdminPage from './pages/AdminPage'
import { supabase } from './services/supabaseClient'
import { syncUserProfile } from './services/authService'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authReady, setAuthReady] = useState(false)
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
      return
    }

    // Guard against duplicate syncs
    if (syncingRef.current) return
    syncingRef.current = true

    const doSync = async () => {
      try {
        const profile = await syncUserProfile(user)
        setUserProfile(profile)
      } catch (err) {
        console.error('Profile sync error:', err)
      } finally {
        syncingRef.current = false
      }
    }

    doSync()
  }, [user])

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

  const isLoggedIn = !!user
  const isPublicRoute = ['/', '/signin', '/signup'].includes(location.pathname)
  const showHeader = isLoggedIn && !isPublicRoute

  return (
    <div className="app">
      <ParticleBackground />
      <div className="app-content">
        {showHeader && <Header user={user} userProfile={userProfile} />}
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
              element={isLoggedIn ? <DashboardPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/leads"
              element={isLoggedIn ? <LeadsPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/leads/:id"
              element={isLoggedIn ? <LeadProfilePage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/pipeline"
              element={isLoggedIn ? <PipelinePage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/tasks"
              element={isLoggedIn ? <TasksPage /> : <Navigate to="/signin" replace />}
            />
            <Route
              path="/admin"
              element={
                isLoggedIn ? (
                  <AdminPage currentUser={user} userProfile={userProfile} />
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
