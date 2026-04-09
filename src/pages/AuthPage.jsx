import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, AlertCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react'
import { signUp, signIn, syncUserProfile } from '../services/authService'
import './AuthPage.css'

const AuthPage = ({ mode = 'signin' }) => {
  const isSignUp = mode === 'signup'
  const navigate = useNavigate()

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)

  const fillSuperAdminDemo = () => {
    setForm((prev) => ({
      ...prev,
      email: 'demo.superadmin@crmleads.app',
      password: 'Demo@12345',
      confirmPassword: 'Demo@12345',
    }))
    setError(null)
  }

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  const validate = () => {
    if (isSignUp && !form.fullName.trim()) {
      setError('Please enter your full name')
      return false
    }
    if (!form.email.trim()) {
      setError('Please enter your email')
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Please enter a valid email address')
      return false
    }
    if (!form.password) {
      setError('Please enter a password')
      return false
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    if (isSignUp && form.password !== form.confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)

    if (!validate()) return

    setLoading(true)
    try {
      const loginEmail = !isSignUp && !String(form.email).includes('@')
        ? `${String(form.email).trim().toLowerCase()}@crm-owner.local`
        : form.email
      if (isSignUp) {
        const data = await signUp({
          email: loginEmail,
          password: form.password,
          fullName: form.fullName,
        })

        // If session is returned (email confirmation disabled), sync & route by role
        if (data?.session?.user) {
          const profile = await syncUserProfile(data.session.user)
          navigate(profile?.role === 'super_admin' ? '/platform' : '/dashboard', { replace: true })
        } else {
          // Email confirmation is required — tell user to check inbox
          setSuccessMsg(
            'Account created! Please check your email to confirm your account, then sign in.'
          )
          setForm({ fullName: '', email: '', password: '', confirmPassword: '' })
        }
      } else {
        const data = await signIn({ email: loginEmail, password: form.password })

        // Directly sync profile to crm_users right after sign-in
        if (data?.user) {
          const profile = await syncUserProfile(data.user)
          navigate(profile?.role === 'super_admin' ? '/platform' : '/dashboard', { replace: true })
          return
        }
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <Link to="/" className="auth-back">
          <ArrowLeft size={18} />
          Back to home
        </Link>

        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <Sparkles className="auth-logo-icon" />
              <span>AI CRM Leads</span>
            </div>
            <h1>{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
            <p>
              {isSignUp
                ? 'Start managing your leads and growing your sales today.'
                : 'Sign in to your CRM dashboard to continue.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {isSignUp && (
              <div className="auth-field">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={form.fullName}
                  onChange={handleChange}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="email">{isSignUp ? 'Email Address' : 'Email or Username'}</label>
              <input
                id="email"
                name="email"
                type={isSignUp ? 'email' : 'text'}
                placeholder={isSignUp ? 'you@company.com' : 'you@company.com or username'}
                value={form.email}
                onChange={handleChange}
                autoComplete="email"
              />
            </div>

            <div className="auth-field">
              <label htmlFor="password">Password</label>
              <div className="password-wrap">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={isSignUp ? 'Min. 6 characters' : 'Enter your password'}
                  value={form.password}
                  onChange={handleChange}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div className="auth-field">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  autoComplete="new-password"
                />
              </div>
            )}

            {error && (
              <div className="auth-alert auth-alert-error">
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="auth-alert auth-alert-success">
                <Sparkles size={18} />
                <span>{successMsg}</span>
              </div>
            )}

            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="spinning" size={18} />
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </>
              ) : isSignUp ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="auth-footer">
            {!isSignUp && (
              <div className="demo-superadmin-box">
                <p className="demo-title">Super Admin Demo</p>
                <p><strong>Email:</strong> demo.superadmin@crmleads.app</p>
                <p><strong>Password:</strong> Demo@12345</p>
                <button type="button" className="demo-fill-btn" onClick={fillSuperAdminDemo}>
                  Use demo credentials
                </button>
                <p className="demo-note">Create this user once in Supabase Auth and set role to <code>super_admin</code>.</p>
              </div>
            )}
            {isSignUp ? (
              <p>
                Already have an account?{' '}
                <Link to="/signin" className="auth-link">
                  Sign In
                </Link>
              </p>
            ) : (
              <p>
                Don&apos;t have an account?{' '}
                <Link to="/signup" className="auth-link">
                  Create one
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthPage
