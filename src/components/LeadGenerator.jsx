import { useState } from 'react'
import { Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { processLeadData, generateLeadSuggestions } from '../services/openaiService'
import './LeadGenerator.css'
import './LeadGenerator.css'

const LeadGenerator = ({ onLeadGenerated }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    industry: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    companySize: '',
    location: '',
    notes: ''
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    setError(null)
    setSuccess(false)
  }

  const validateForm = () => {
    const required = ['companyName', 'industry', 'contactName', 'email']
    const missing = required.filter(field => !formData[field])
    
    if (missing.length > 0) {
      setError(`Please fill in required fields: ${missing.join(', ')}`)
      return false
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address')
      return false
    }

    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      const processedLead = await processLeadData(formData)
      onLeadGenerated(processedLead)
      setSuccess(true)
      
      // Reset form after a delay
      setTimeout(() => {
        setFormData({
          companyName: '',
          industry: '',
          contactName: '',
          email: '',
          phone: '',
          website: '',
          companySize: '',
          location: '',
          notes: ''
        })
        setSuccess(false)
      }, 2000)
    } catch (err) {
      setError('Failed to process lead. Please try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateSuggestions = async () => {
    if (!formData.industry) {
      setError('Please enter an industry first to generate suggestions')
      return
    }

    setLoading(true)
    try {
      const suggestions = await generateLeadSuggestions(formData.industry)
      if (suggestions.length > 0) {
        setFormData(prev => ({ ...prev, ...suggestions[0] }))
      }
    } catch (err) {
      console.error('Error generating suggestions:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lead-generator">
      <div className="generator-header">
        <h2>Generate New Lead</h2>
        <p className="subtitle">Fill in the required fields and let AI process and enrich your lead data</p>
      </div>

      <form onSubmit={handleSubmit} className="lead-form">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="companyName">
              Company Name <span className="required">*</span>
            </label>
            <input
              type="text"
              id="companyName"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              placeholder="Enter company name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="industry">
              Industry <span className="required">*</span>
            </label>
            <input
              type="text"
              id="industry"
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              placeholder="e.g., Technology, Healthcare, Finance"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="contactName">
              Contact Person <span className="required">*</span>
            </label>
            <input
              type="text"
              id="contactName"
              name="contactName"
              value={formData.contactName}
              onChange={handleChange}
              placeholder="Full name"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">
              Email <span className="required">*</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="contact@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="phone">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div className="form-group">
            <label htmlFor="website">Website</label>
            <input
              type="url"
              id="website"
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://www.company.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="companySize">Company Size</label>
            <select
              id="companySize"
              name="companySize"
              value={formData.companySize}
              onChange={handleChange}
            >
              <option value="">Select size</option>
              <option value="1-10">1-10 employees</option>
              <option value="11-50">11-50 employees</option>
              <option value="51-200">51-200 employees</option>
              <option value="201-500">201-500 employees</option>
              <option value="501-1000">501-1000 employees</option>
              <option value="1000+">1000+ employees</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="City, Country"
            />
          </div>
        </div>

        <div className="form-group full-width">
          <label htmlFor="notes">Additional Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Any additional information about this lead..."
            rows="4"
          />
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle className="alert-icon" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success">
            <CheckCircle className="alert-icon" />
            <span>Lead generated successfully! Redirecting to dashboard...</span>
          </div>
        )}

        <div className="form-actions">
          <button
            type="button"
            onClick={handleGenerateSuggestions}
            className="btn btn-secondary"
            disabled={loading || !formData.industry}
          >
            <Sparkles className="btn-icon" />
            AI Generate Suggestions
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="btn-icon spinning" />
                Processing with AI...
              </>
            ) : (
              <>
                <Sparkles className="btn-icon" />
                Generate Lead
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

export default LeadGenerator
