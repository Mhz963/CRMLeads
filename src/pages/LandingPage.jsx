import { Link } from 'react-router-dom'
import {
  Sparkles,
  BarChart3,
  Users,
  Zap,
  Target,
  TrendingUp,
  Shield,
  ArrowRight,
  CheckCircle,
  LayoutDashboard,
  Mail,
  Calendar,
} from 'lucide-react'
import './LandingPage.css'

const features = [
  {
    icon: <Target className="feature-icon" />,
    title: 'Smart Lead Capture',
    desc: 'Capture leads from multiple channels — web forms, CSV imports, manual entry — all in one place.',
  },
  {
    icon: <BarChart3 className="feature-icon" />,
    title: 'Visual Sales Pipeline',
    desc: 'Drag-and-drop Kanban board to track every deal through your custom pipeline stages.',
  },
  {
    icon: <TrendingUp className="feature-icon" />,
    title: 'Real-Time Analytics',
    desc: 'Conversion rates, revenue forecasts, lead sources, and salesperson performance at a glance.',
  },
  {
    icon: <Users className="feature-icon" />,
    title: 'Team Collaboration',
    desc: 'Admin & team member roles with fine-grained access. Assign leads, track activities, stay in sync.',
  },
  {
    icon: <Mail className="feature-icon" />,
    title: 'Email Integration',
    desc: 'Send emails, track opens, use templates, and build automated follow-up sequences.',
  },
  {
    icon: <Calendar className="feature-icon" />,
    title: 'Tasks & Reminders',
    desc: 'Never miss a follow-up. Create tasks, set due dates, and get automatic reminders.',
  },
]

const stats = [
  { value: '10×', label: 'Faster Lead Processing' },
  { value: '95%', label: 'Data Accuracy' },
  { value: '3×', label: 'More Conversions' },
  { value: '24/7', label: 'Always Available' },
]

const LandingPage = () => {
  return (
    <div className="landing">
      {/* ──────── Hero ──────── */}
      <section className="hero">
        <div className="hero-badge">
          <Sparkles size={14} />
          <span>AI-Powered CRM Platform</span>
        </div>

        <h1 className="hero-title">
          Capture, Organize &amp;
          <br />
          <span className="hero-highlight">Convert Leads</span>
          <br />
          Like Never Before
        </h1>

        <p className="hero-subtitle">
          The all-in-one CRM that helps your sales team manage leads, automate follow-ups,
          track pipelines, and close deals faster — powered by intelligent automation.
        </p>

        <div className="hero-actions">
          <Link to="/signup" className="btn-hero-primary">
            Get Started Free
            <ArrowRight size={18} />
          </Link>
          <Link to="/signin" className="btn-hero-secondary">
            Sign In
          </Link>
        </div>

        <div className="hero-stats">
          {stats.map((s, i) => (
            <div key={i} className="hero-stat">
              <span className="hero-stat-value">{s.value}</span>
              <span className="hero-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ──────── Features ──────── */}
      <section className="features-section">
        <div className="section-header">
          <span className="section-badge">Features</span>
          <h2>Everything You Need to Grow Revenue</h2>
          <p>A complete toolkit designed for modern sales teams — no bloat, just results.</p>
        </div>

        <div className="features-grid">
          {features.map((f, i) => (
            <div key={i} className="feature-card" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="feature-icon-wrap">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────── How it Works ──────── */}
      <section className="how-section">
        <div className="section-header">
          <span className="section-badge">How It Works</span>
          <h2>From Lead to Customer in 4 Simple Steps</h2>
        </div>

        <div className="steps-row">
          {[
            { num: '01', title: 'Sign Up', desc: 'Create your account in seconds — no credit card required.' },
            { num: '02', title: 'Add Leads', desc: 'Import leads via CSV, add manually, or connect your website forms.' },
            { num: '03', title: 'Track & Automate', desc: 'Pipeline board, automated follow-ups, and AI-powered scoring.' },
            { num: '04', title: 'Close Deals', desc: 'Convert leads to customers and watch your revenue grow.' },
          ].map((step, i) => (
            <div key={i} className="step-card">
              <div className="step-num">{step.num}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────── Roles ──────── */}
      <section className="roles-section">
        <div className="section-header">
          <span className="section-badge">Team Roles</span>
          <h2>Built for Your Entire Sales Team</h2>
        </div>

        <div className="roles-grid">
          <div className="role-card role-admin">
            <Shield className="role-icon" />
            <h3>Admin</h3>
            <ul>
              <li><CheckCircle size={16} /> Full access to all data</li>
              <li><CheckCircle size={16} /> Manage team members</li>
              <li><CheckCircle size={16} /> Configure pipeline &amp; settings</li>
              <li><CheckCircle size={16} /> View all analytics &amp; reports</li>
              <li><CheckCircle size={16} /> Assign &amp; reassign leads</li>
            </ul>
          </div>
          <div className="role-card role-member">
            <Users className="role-icon" />
            <h3>Team Member</h3>
            <ul>
              <li><CheckCircle size={16} /> Access own leads &amp; contacts</li>
              <li><CheckCircle size={16} /> Update lead statuses</li>
              <li><CheckCircle size={16} /> Log activities &amp; notes</li>
              <li><CheckCircle size={16} /> Manage assigned tasks</li>
              <li><CheckCircle size={16} /> View personal dashboard</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ──────── CTA ──────── */}
      <section className="cta-section">
        <div className="cta-card">
          <LayoutDashboard className="cta-icon" />
          <h2>Ready to Supercharge Your Sales?</h2>
          <p>
            Join thousands of sales teams who have transformed their pipeline management. 
            Start for free today — no credit card required.
          </p>
          <Link to="/signup" className="btn-hero-primary">
            Create Your Account
            <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      {/* ──────── Footer ──────── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Sparkles size={20} />
            <span>AI CRM Leads</span>
          </div>
          <p>&copy; {new Date().getFullYear()} AI CRM Leads. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
