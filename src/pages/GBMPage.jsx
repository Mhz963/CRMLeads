import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Loader2, MapPinned, RefreshCcw, Search, Star, ExternalLink, ArrowLeft, MessageSquare, Edit3, Eye, Send } from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import './GBMPage.css'

const BUSINESS_STATUSES = ['New', 'Contacted', 'Qualified', 'Closed']

function normalizeBusinessStatus(status) {
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return 'New'
  if (raw === 'new' || raw === 'old') return 'New'
  if (raw === 'contacted') return 'Contacted'
  if (raw === 'qualified' || raw === 'interested' || raw === 'proposal') return 'Qualified'
  if (raw === 'closed') return 'Closed'
  return 'New'
}

function mapGooglePlace(place) {
  return {
    place_id: place.place_id || null,
    name: place.name || 'Unknown',
    address: place.formatted_address || '',
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviews: Number.isFinite(place.user_ratings_total) ? place.user_ratings_total : 0,
    business_status: place.business_status || '',
    open_now: typeof place?.opening_hours?.open_now === 'boolean'
      ? place.opening_hours.open_now
      : null,
    contact_no:
      place.international_phone_number ||
      place.formatted_phone_number ||
      null,
    website: place.website || null,
    maps_url: place.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${place.place_id}`
      : null,
    types: Array.isArray(place.types) ? place.types : [],
  }
}

async function fetchPlaceDetailsClient({ placeId, googleKey }) {
  if (!placeId) return null
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  const baseUrl = isLocalhost
    ? `${window.location.origin}/__gbm_proxy/details`
    : 'https://maps.googleapis.com/maps/api/place/details/json'

  const url = new URL(baseUrl)
  url.searchParams.set('place_id', placeId)
  url.searchParams.set(
    'fields',
    [
      'name',
      'formatted_address',
      'website',
      'formatted_phone_number',
      'international_phone_number',
      'url',
    ].join(',')
  )
  url.searchParams.set('key', googleKey)

  const resp = await fetch(url.toString())
  if (!resp.ok) return null
  const raw = await resp.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }
  if (payload.status !== 'OK') return null
  return payload.result || null
}

async function fetchGBMResults({ query, region, maxResults, pageToken = null }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Please sign in again to use GBM search.')

  const requestBody = {
    query,
    region,
    max_results: maxResults,
  }
  if (pageToken) {
    requestBody.pagetoken = pageToken
    requestBody.page_token = pageToken
    requestBody.next_page_token = pageToken
  }

  const response = await fetch('/api/gbm-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(requestBody),
  })
  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    const err = new Error(
      payload.error_message ||
      payload.status ||
      payload.error ||
      `Failed to fetch GBM data (HTTP ${response.status}).`
    )
    err.apiStatus = payload.status || null
    err.apiErrorMessage = payload.error_message || null
    err.httpStatus = response.status
    throw err
  }

  return payload
}

const GBMPage = () => {
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('view') === 'new' ? 'new' : 'list'
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [entriesPerPage, setEntriesPerPage] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [newModeApiPage, setNewModeApiPage] = useState(1)
  const [newModeBusinesses, setNewModeBusinesses] = useState([])
  const [nextPageToken, setNextPageToken] = useState(null)
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false)
  const [apiError, setApiError] = useState('')
  const [statusByPlaceId, setStatusByPlaceId] = useState({})
  const [viewBusiness, setViewBusiness] = useState(null)
  const [feedbackInput, setFeedbackInput] = useState('')
  const [feedbackByKey, setFeedbackByKey] = useState({})
  const [editingBusiness, setEditingBusiness] = useState(null)
  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    contact_no: '',
    website: '',
    status: 'New',
  })
  const nextPageRequestInFlightRef = useRef(false)
  const resultsTopRef = useRef(null)

  function isRlsPolicyMessage(message) {
    return typeof message === 'string' && message.toLowerCase().includes('row-level security policy')
  }

  function setApiErrorSafe(message) {
    if (isRlsPolicyMessage(message)) {
      console.error('[GBM RLS]', message)
      setApiError('')
      return
    }
    setApiError(message || '')
  }

  async function refreshStatusMap(businesses) {
    const ids = (businesses || []).map((b) => b.place_id).filter(Boolean)
    if (!ids.length) {
      setStatusByPlaceId({})
      return
    }
    const { data: existing, error: existingErr } = await supabase
      .from('gbm_businesses')
      .select('place_id, business_status')
      .in('place_id', ids)
    if (existingErr) {
      console.error('[GBM status map]', existingErr.message || existingErr)
      return
    }
    const existingMap = new Map((existing || []).map((row) => [row.place_id, row.business_status]))
    const next = {}
    ids.forEach((id) => {
      next[id] = normalizeBusinessStatus(existingMap.get(id))
    })
    setStatusByPlaceId(next)
  }

  const getBusinessStatusLabel = (biz) => {
    if (biz?.place_id && statusByPlaceId[biz.place_id]) return normalizeBusinessStatus(statusByPlaceId[biz.place_id])
    if (biz?.business_status) return normalizeBusinessStatus(biz.business_status)
    return 'New'
  }

  const applyBusinessPatch = (targetBiz, patch) => {
    const targetKey = targetBiz.place_id || `${targetBiz.name}-${targetBiz.address}`
    setNewModeBusinesses((prev) => prev.map((biz) => {
      const key = biz.place_id || `${biz.name}-${biz.address}`
      return key === targetKey ? { ...biz, ...patch } : biz
    }))
    if (viewBusiness) {
      const viewKey = viewBusiness.place_id || `${viewBusiness.name}-${viewBusiness.address}`
      if (viewKey === targetKey) {
        setViewBusiness((prev) => (prev ? { ...prev, ...patch } : prev))
      }
    }
  }

  async function persistBusinessStatus(biz, nextStatus, overrides = {}) {
    if (!biz?.place_id) return
    const { error: upsertErr } = await supabase
      .from('gbm_businesses')
      .upsert({
        place_id: biz.place_id,
        name: overrides.name ?? biz.name ?? null,
        formatted_address: overrides.address ?? biz.address ?? null,
        contact_no: overrides.contact_no ?? biz.contact_no ?? null,
        website: overrides.website ?? biz.website ?? null,
        business_status: nextStatus,
        maps_url: overrides.maps_url ?? biz.maps_url ?? null,
        rating: overrides.rating ?? biz.rating,
        reviews: overrides.reviews ?? biz.reviews ?? 0,
        types: overrides.types ?? (Array.isArray(biz.types) ? biz.types : []),
        last_query: submittedQuery || null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'place_id' })

    if (upsertErr) throw upsertErr
  }

  const handleManualStatusChange = async (biz, nextStatus) => {
    if (!BUSINESS_STATUSES.includes(nextStatus)) return
    const prevStatus = getBusinessStatusLabel(biz)

    applyBusinessPatch(biz, { business_status: nextStatus })
    if (biz.place_id) {
      setStatusByPlaceId((prev) => ({ ...prev, [biz.place_id]: nextStatus }))
      try {
        await persistBusinessStatus(biz, nextStatus)
      } catch (upsertErr) {
        applyBusinessPatch(biz, { business_status: prevStatus })
        setStatusByPlaceId((prev) => ({ ...prev, [biz.place_id]: prevStatus }))
        console.error('[GBM status update]', upsertErr.message || upsertErr)
        setApiErrorSafe(upsertErr.message || 'Failed to save status update.')
      }
    }
  }

  async function fetchGBMListFromDb() {
    const { data, error: dbErr } = await supabase
      .from('gbm_businesses')
      .select(`
        place_id,
        name,
        formatted_address,
        contact_no,
        email,
        website,
        rating,
        reviews,
        business_status,
        maps_url,
        types,
        last_query
      `)
      .order('last_seen_at', { ascending: false })

    if (dbErr) {
      throw new Error(dbErr.message || 'Failed to fetch GBM list from database.')
    }

    const businesses = (data || []).map((row) => ({
      place_id: row.place_id,
      name: row.name || 'Unknown',
      address: row.formatted_address || '',
      contact_no: row.contact_no || null,
      email: row.email || null,
      website: row.website || null,
      rating: row.rating,
      reviews: row.reviews ?? 0,
      business_status: row.business_status || '',
      maps_url: row.maps_url || null,
      types: Array.isArray(row.types) ? row.types : [],
    }))

    return {
      success: true,
      query: (data?.[0]?.last_query || '').trim(),
      total: businesses.length,
      businesses,
    }
  }

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['gbm-data', mode, submittedQuery],
    queryFn: () => (
      mode === 'new'
        ? fetchGBMResults({ query: submittedQuery, region: 'nz', maxResults: 60 })
        : fetchGBMListFromDb()
    ),
    enabled: mode === 'list' || Boolean(submittedQuery.trim()),
  })

  useEffect(() => {
    setCurrentPage(1)
    setNewModeApiPage(1)
  }, [mode])

  useEffect(() => {
    if (mode === 'new' && data?.businesses) {
      setNewModeBusinesses(data.businesses)
      setNextPageToken(data.next_page_token || null)
      setApiError('')
      setCurrentPage(1)
      setNewModeApiPage(1)
      refreshStatusMap(data.businesses).catch((err) => console.error('[GBM status map]', err))
    }
  }, [mode, data?.businesses])

  useEffect(() => {
    if (mode !== 'new') {
      setNextPageToken(null)
      setIsLoadingNextPage(false)
      setApiError('')
    }
  }, [mode])

  const businesses = mode === 'new' ? newModeBusinesses : (data?.businesses || [])
  const totalPages = mode === 'new'
    ? Math.max(1, newModeApiPage)
    : Math.max(1, Math.ceil(businesses.length / entriesPerPage))
  const pageStart = (currentPage - 1) * entriesPerPage
  const paginatedBusinesses = mode === 'new'
    ? businesses
    : businesses.slice(pageStart, pageStart + entriesPerPage)

  useEffect(() => {
    // Prevent impossible state like "Page 2 of 1", which hides all rows.
    if (mode === 'new') return
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [mode, currentPage, totalPages])

  const avgRating = useMemo(() => {
    const rated = businesses.filter((b) => typeof b.rating === 'number')
    if (!rated.length) return null
    return (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(2)
  }, [businesses])

  const onSearch = (e) => {
    e.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setApiError('Please enter a search query. Example: "plumber in Auckland New Zealand".')
      return
    }
    setSubmittedQuery(trimmedQuery)
    setCurrentPage(1)
    setNewModeApiPage(1)
    setNewModeBusinesses([])
    setNextPageToken(null)
    setApiError('')
    setStatusByPlaceId({})
    setViewBusiness(null)
  }

  const handleNextPage = async () => {
    if (mode !== 'new') {
      if (currentPage < totalPages) setCurrentPage((p) => p + 1)
      return
    }

    if (!nextPageToken || isLoadingNextPage || nextPageRequestInFlightRef.current) return

    nextPageRequestInFlightRef.current = true
    setIsLoadingNextPage(true)
    setApiError('')
    try {
      const nextPageData = await fetchGBMResults({
        query: submittedQuery,
        region: 'nz',
        pageToken: nextPageToken,
        maxResults: 20,
      })
      setNewModeBusinesses(nextPageData.businesses || [])
      setNextPageToken(nextPageData.next_page_token || null)
      setNewModeApiPage((p) => p + 1)
      setCurrentPage((p) => p + 1)
      refreshStatusMap(nextPageData.businesses || []).catch((err) => console.error('[GBM status map]', err))
      requestAnimationFrame(() => {
        resultsTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    } catch (err) {
      setApiErrorSafe(err?.apiErrorMessage || err?.apiStatus || err?.message || 'Failed to load next page.')
    } finally {
      setIsLoadingNextPage(false)
      nextPageRequestInFlightRef.current = false
    }
  }

  const openEditModal = (biz) => {
    setEditingBusiness(biz)
    setEditForm({
      name: biz.name || '',
      address: biz.address || '',
      contact_no: biz.contact_no || '',
      website: biz.website || '',
      status: getBusinessStatusLabel(biz),
    })
  }

  const saveEditBusiness = async () => {
    if (!editingBusiness) return
    const rowKey = editingBusiness.place_id || `${editingBusiness.name}-${editingBusiness.address}`
    const applyUpdate = (arr) => arr.map((biz) => {
      const key = biz.place_id || `${biz.name}-${biz.address}`
      if (key !== rowKey) return biz
      return {
        ...biz,
        name: editForm.name.trim() || biz.name,
        address: editForm.address.trim(),
        contact_no: editForm.contact_no.trim() || null,
        website: editForm.website.trim() || null,
        business_status: editForm.status,
      }
    })

    setNewModeBusinesses((prev) => applyUpdate(prev))
    if (viewBusiness) {
      const viewKey = viewBusiness.place_id || `${viewBusiness.name}-${viewBusiness.address}`
      if (viewKey === rowKey) {
        setViewBusiness((prev) => prev ? {
          ...prev,
          name: editForm.name.trim() || prev.name,
          address: editForm.address.trim(),
          contact_no: editForm.contact_no.trim() || null,
          website: editForm.website.trim() || null,
          business_status: editForm.status,
        } : prev)
      }
    }

    if (editingBusiness.place_id) {
      setStatusByPlaceId((prev) => ({
        ...prev,
        [editingBusiness.place_id]: editForm.status,
      }))
    }

    if (editingBusiness.place_id) {
      try {
        await persistBusinessStatus(editingBusiness, editForm.status || 'New', {
          name: editForm.name.trim() || editingBusiness.name,
          address: editForm.address.trim() || null,
          contact_no: editForm.contact_no.trim() || null,
          website: editForm.website.trim() || null,
        })
      } catch (upsertErr) {
        console.error('[GBM edit save]', upsertErr.message || upsertErr)
        setApiErrorSafe(upsertErr.message || 'Failed to save business update.')
      }
    }
    setEditingBusiness(null)
  }

  const sendFeedback = () => {
    const text = feedbackInput.trim()
    if (!text || !viewBusiness) return
    const key = viewBusiness.place_id || `${viewBusiness.name}-${viewBusiness.address}`
    setFeedbackByKey((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), { text, at: new Date().toISOString() }],
    }))
    setFeedbackInput('')
  }

  if (viewBusiness) {
    const viewKey = viewBusiness.place_id || `${viewBusiness.name}-${viewBusiness.address}`
    const feedbackItems = feedbackByKey[viewKey] || []
    const handleBackFromDetails = () => setViewBusiness(null)
    return (
      <div className="gbm-page gbm-client-view animate-fade-in">
        <div className="gbm-header">
          <div>
            <h2><MapPinned size={22} /> Client Details</h2>
            <p>Detailed view and feedback thread.</p>
          </div>
          <div className="gbm-header-actions">
            <button className="btn-outline" onClick={handleBackFromDetails}>
              <ArrowLeft size={15} />
              Back
            </button>
          </div>
        </div>
        <div className="gbm-content-wrap">
          <div className="gbm-client-card">
            <div className="gbm-client-grid">
              <div className="gbm-client-row"><span>Name</span><strong>{viewBusiness.name || '—'}</strong></div>
              <div className="gbm-client-row"><span>Status</span><strong>{getBusinessStatusLabel(viewBusiness)}</strong></div>
              <div className="gbm-client-row"><span>Address</span><strong>{viewBusiness.address || '—'}</strong></div>
              <div className="gbm-client-row"><span>Contact</span><strong>{viewBusiness.contact_no || '—'}</strong></div>
              <div className="gbm-client-row">
                <span>Website</span>
                <strong>
                  {viewBusiness.website ? (
                    <a href={viewBusiness.website} target="_blank" rel="noopener noreferrer">Website</a>
                  ) : '—'}
                </strong>
              </div>
              <div className="gbm-client-row"><span>Rating</span><strong>{typeof viewBusiness.rating === 'number' ? viewBusiness.rating : '—'}</strong></div>
              <div className="gbm-client-row"><span>Reviews</span><strong>{viewBusiness.reviews ?? 0}</strong></div>
            </div>
            <div className="gbm-client-links">
              <span>Google Maps</span>
              {viewBusiness.maps_url ? (
                <a href={viewBusiness.maps_url} target="_blank" rel="noopener noreferrer" className="map-link">
                  Open <ExternalLink size={12} />
                </a>
              ) : '—'}
            </div>
          </div>
          <aside className="gbm-side-panel open gbm-feedback-panel">
            <div className="gbm-side-panel-header">
              <h3><MessageSquare size={16} /> Feedback</h3>
              <span className="gbm-feedback-count">{feedbackItems.length}</span>
            </div>
            <div className="gbm-side-panel-body">
              <div className="gbm-feedback-thread">
                {feedbackItems.length === 0 ? (
                  <p className="gbm-feedback-empty">No feedback yet. Start the conversation.</p>
                ) : (
                  feedbackItems.map((item, idx) => (
                    <div key={`${item.at}-${idx}`} className="gbm-feedback-bubble">
                      <div className="gbm-feedback-text">{item.text}</div>
                      <small className="gbm-feedback-time">{new Date(item.at).toLocaleString()}</small>
                    </div>
                  ))
                )}
              </div>
              <div className="gbm-feedback-input-wrap">
                <input
                  value={feedbackInput}
                  className="gbm-feedback-input"
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendFeedback()
                    }
                  }}
                  placeholder="Write feedback and press Enter..."
                />
                <button type="button" className="btn-primary-action gbm-feedback-send" onClick={sendFeedback}>
                  <Send size={14} />
                  Send
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  return (
    <div className="gbm-page animate-fade-in">
      <div className="gbm-header">
        <div>
          <h2><MapPinned size={22} /> GBM Leads</h2>
          <p>
            {mode === 'new'
              ? 'Search Google Business listings by entering your own query.'
              : ''}
          </p>
        </div>
        <div className="gbm-header-actions">
          <button className="btn-outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCcw size={15} className={isFetching ? 'spinning' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {mode === 'new' ? (
        <form className="gbm-search-bar" onSubmit={onSearch}>
          <div className="gbm-field grow">
            <label>Query</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Use format: "<service> in <city> <country>" e.g. "plumber in Auckland New Zealand"'
            />
          </div>
          <div className="gbm-field small">
            <label>Entries per page</label>
            <select
              value={entriesPerPage}
              onChange={(e) => {
                setEntriesPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
          <button className="btn-primary-action" type="submit">
            <Search size={16} />
            Search
          </button>
        </form>
      ) : (
        <div className="gbm-search-bar">
          <div className="gbm-field small">
            <label>Entries per page</label>
            <select
              value={entriesPerPage}
              onChange={(e) => {
                setEntriesPerPage(Number(e.target.value))
                setCurrentPage(1)
              }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>
      )}

      <div className="gbm-stats">
        <span><strong>{businesses.length}</strong> businesses</span>
        <span><strong>{mode === 'new' ? (submittedQuery || 'No query submitted yet') : 'Database List'}</strong></span>
        <span>
          Avg Rating:{' '}
          <strong>{avgRating ?? 'N/A'}</strong>
        </span>
        {typeof data?.inserted_count === 'number' && (
          <span>
            New saved: <strong>{data.inserted_count}</strong>
          </span>
        )}
        {typeof data?.updated_count === 'number' && (
          <span>
            Existing refreshed: <strong>{data.updated_count}</strong>
          </span>
        )}
      </div>
      <div ref={resultsTopRef} />
      {isLoading ? (
        <div className="gbm-loading">
          <Loader2 size={26} className="spinning" />
          <span>{mode === 'new' ? 'Loading first page...' : 'Loading GBM data...'}</span>
        </div>
      ) : isError ? (
        <div className="gbm-error">
          <span>
            {isRlsPolicyMessage(error?.apiErrorMessage || error?.apiStatus || error?.message)
              ? 'Failed to fetch GBM businesses.'
              : (error?.apiErrorMessage || error?.apiStatus || error?.message || 'Failed to fetch GBM businesses.')}
          </span>
        </div>
      ) : (
        <div className="gbm-content-wrap">
          <div className="gbm-table-wrap">
            <table className="gbm-table">
              <thead>
                <tr>
                  <th>Business Name</th>
                  <th>Address</th>
                  <th>Contact No.</th>
                  <th>Email</th>
                  <th>Website</th>
                  <th>Rating</th>
                  <th>Reviews</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {businesses.length === 0 ? (
                  <tr><td colSpan="9" className="gbm-empty">No results found.</td></tr>
                ) : (
                  paginatedBusinesses.map((biz) => {
                    const rowKey = biz.place_id || `${biz.name}-${biz.address}`
                    return (
                      <tr key={rowKey}>
                        <td className="biz-name">{biz.name}</td>
                        <td className="biz-address">{biz.address || '—'}</td>
                        <td>{biz.contact_no || '—'}</td>
                        <td>{biz.email || '—'}</td>
                        <td className="biz-website">
                          {biz.website ? (
                            <a href={biz.website} target="_blank" rel="noopener noreferrer">
                              Website
                            </a>
                          ) : '—'}
                        </td>
                        <td>
                          {typeof biz.rating === 'number' ? (
                            <span className="rating-pill">
                              <Star size={12} />
                              {biz.rating}
                            </span>
                          ) : '—'}
                        </td>
                        <td>{biz.reviews ?? 0}</td>
                        <td>
                          <select
                            className="gbm-status-select"
                            value={getBusinessStatusLabel(biz)}
                            onChange={(e) => handleManualStatusChange(biz, e.target.value)}
                          >
                            {BUSINESS_STATUSES.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="gbm-row-actions">
                            <button
                              type="button"
                              className="details-toggle-btn"
                              onClick={() => setViewBusiness(biz)}
                              title="View details page"
                            >
                              <Eye size={13} /> View
                            </button>
                            <button
                              type="button"
                              className="details-toggle-btn"
                              onClick={() => openEditModal(biz)}
                              title="Edit details"
                            >
                              <Edit3 size={13} /> Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === 'new' && isLoadingNextPage && !isLoading && (
        <div className="gbm-loading">
          <Loader2 size={18} className="spinning" />
          <span>Loading next page...</span>
        </div>
      )}

      {mode === 'new' && apiError && !isLoading && (
        <div className="gbm-error">
          <span>{apiError}</span>
        </div>
      )}

      {businesses.length > 0 && (
        <div className="gbm-pagination">
          <button
            className="btn-outline"
            type="button"
            disabled={mode === 'new' || currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span>
            Page <strong>{mode === 'new' ? newModeApiPage : currentPage}</strong> of <strong>{totalPages}</strong>
          </span>
          <button
            className="btn-outline"
            type="button"
            disabled={
              mode === 'new'
                ? !nextPageToken || isLoadingNextPage
                : currentPage >= totalPages
            }
            onClick={handleNextPage}
          >
            {mode === 'new' ? (isLoadingNextPage ? 'Loading...' : 'Next Page') : 'Next'}
          </button>
        </div>
      )}
      {editingBusiness && (
        <div className="modal-overlay" onClick={() => setEditingBusiness(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Business</h3>
            </div>
            <div className="modal-form">
              <div className="form-field">
                <label>Name</label>
                <input value={editForm.name} onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Address</label>
                <input value={editForm.address} onChange={(e) => setEditForm((prev) => ({ ...prev, address: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Contact</label>
                <input value={editForm.contact_no} onChange={(e) => setEditForm((prev) => ({ ...prev, contact_no: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Website</label>
                <input value={editForm.website} onChange={(e) => setEditForm((prev) => ({ ...prev, website: e.target.value }))} />
              </div>
              <div className="form-field">
                <label>Status</label>
                <select value={editForm.status} onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}>
                  {BUSINESS_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-outline" onClick={() => setEditingBusiness(null)}>Cancel</button>
                <button type="button" className="btn-primary-action" onClick={saveEditBusiness}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GBMPage
