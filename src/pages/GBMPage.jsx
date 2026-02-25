import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, MapPinned, RefreshCcw, Search, Star, ExternalLink } from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import './GBMPage.css'

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

async function fetchGBMDirectFromGoogle({ query, region, maxResults }) {
  // Fallback only if server endpoint is not deployed yet.
  // In localhost dev, use Vite proxy to avoid browser CORS.
  const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!googleKey) {
    throw new Error(
      'Missing VITE_GOOGLE_MAPS_API_KEY in local .env. Add it and restart npm run dev.'
    )
  }

  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  const baseUrl = isLocalhost
    ? `${window.location.origin}/__gbm_proxy/textsearch`
    : 'https://maps.googleapis.com/maps/api/place/textsearch/json'

  const url = new URL(baseUrl)
  url.searchParams.set('query', query)
  url.searchParams.set('region', region)
  url.searchParams.set('key', googleKey)

  const response = await fetch(url.toString())
  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS')) {
    throw new Error(payload.error_message || payload.status || `Google API failed (HTTP ${response.status}).`)
  }

  const sliced = (payload.results || []).slice(0, maxResults)
  const businesses = await Promise.all(
    sliced.map(async (place) => {
      const details = await fetchPlaceDetailsClient({
        placeId: place.place_id,
        googleKey,
      })
      const base = mapGooglePlace(place)
      return {
        ...base,
        name: details?.name || base.name,
        address: details?.formatted_address || base.address,
        website: details?.website || base.website,
        contact_no:
          details?.international_phone_number ||
          details?.formatted_phone_number ||
          base.contact_no,
        maps_url: details?.url || base.maps_url,
      }
    })
  )

  return {
    success: true,
    query,
    total: businesses.length,
    next_page_token: payload.next_page_token || null,
    businesses,
  }
}

async function fetchGBMResults({ query, region, maxResults }) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (!token) throw new Error('Please sign in again to use GBM search.')

  const response = await fetch('/api/gbm-search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query,
      region,
      max_results: maxResults,
    }),
  })

  const raw = await response.text()
  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = {}
  }

  // If endpoint is not yet deployed (404/405), fallback to direct Google fetch.
  if (response.status === 404 || response.status === 405) {
    // In production domain this direct fallback can still be blocked by CORS.
    // We keep it primarily for localhost dev via Vite proxy.
    return fetchGBMDirectFromGoogle({ query, region, maxResults })
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Failed to fetch GBM data (HTTP ${response.status}).`)
  }
  return payload
}

const GBMPage = () => {
  const [mode, setMode] = useState('new') // new | list
  const [query, setQuery] = useState('plumber in Auckland New Zealand')
  const [submittedQuery, setSubmittedQuery] = useState('plumber in Auckland New Zealand')
  const [entriesPerPage, setEntriesPerPage] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)

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
  })

  const businesses = data?.businesses || []
  const totalPages = Math.max(1, Math.ceil(businesses.length / entriesPerPage))
  const pageStart = (currentPage - 1) * entriesPerPage
  const paginatedBusinesses = businesses.slice(pageStart, pageStart + entriesPerPage)

  const avgRating = useMemo(() => {
    const rated = businesses.filter((b) => typeof b.rating === 'number')
    if (!rated.length) return null
    return (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(2)
  }, [businesses])

  const onSearch = (e) => {
    e.preventDefault()
    setSubmittedQuery(query.trim() || 'plumber in Auckland New Zealand')
    setCurrentPage(1)
  }

  return (
    <div className="gbm-page animate-fade-in">
      <div className="gbm-header">
        <div>
          <h2><MapPinned size={22} /> GBM Leads</h2>
          <p>
            {mode === 'new'
              ? 'Google Business data fetched by query and displayed inside your CRM.'
              : 'Saved GBM entries loaded from your Supabase database.'}
          </p>
        </div>
        <div className="gbm-header-actions">
          <div className="gbm-field small">
            <label>View</label>
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value)
                setCurrentPage(1)
              }}
            >
              <option value="new">New</option>
              <option value="list">List</option>
            </select>
          </div>
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
              placeholder="plumber in Auckland New Zealand"
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
        <span><strong>{mode === 'new' ? submittedQuery : 'Database List'}</strong></span>
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

      {isLoading ? (
        <div className="gbm-loading">
          <Loader2 size={26} className="spinning" />
          <span>Loading GBM data...</span>
        </div>
      ) : isError ? (
        <div className="gbm-error">
          <span>{error?.message || 'Failed to fetch GBM businesses.'}</span>
        </div>
      ) : (
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
                <th>Map</th>
              </tr>
            </thead>
            <tbody>
              {businesses.length === 0 ? (
                <tr><td colSpan="9" className="gbm-empty">No results found.</td></tr>
              ) : (
                paginatedBusinesses.map((biz) => (
                  <tr key={biz.place_id || `${biz.name}-${biz.address}`}>
                    <td className="biz-name">{biz.name}</td>
                    <td className="biz-address">{biz.address || '—'}</td>
                    <td>{biz.contact_no || '—'}</td>
                    <td>{biz.email || '—'}</td>
                    <td className="biz-website">
                      {biz.website ? (
                        <a href={biz.website} target="_blank" rel="noopener noreferrer">
                          {biz.website}
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
                    <td>{biz.business_status || '—'}</td>
                    <td>
                      {biz.maps_url ? (
                        <a href={biz.maps_url} target="_blank" rel="noopener noreferrer" className="map-link">
                          Open <ExternalLink size={12} />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {businesses.length > 0 && (
        <div className="gbm-pagination">
          <button
            className="btn-outline"
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span>
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </span>
          <button
            className="btn-outline"
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default GBMPage
