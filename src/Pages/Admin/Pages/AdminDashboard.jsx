import { useCallback, useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'
import { getFleetCounts } from '../../../Services/API/vehicleAPI.js'
import DashboardCharts from '../Components/DashboardCharts.jsx'
import { getAssessmentFleet } from '../../../Services/API/assessmentAPI.js'
import './AdminDashboard.css'

const DAY_MS = 86400000
const SCHEDULE_DAYS = 7
const SCHEDULE_LIMIT = 8
const UNPAID_WARNING_DAYS = 2
const SKELETON_TILES = [1, 2, 3, 4]

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function addDays(day, count) {
  return new Date(Date.parse(day) + count * DAY_MS).toISOString().slice(0, 10)
}

function dateOnly(value) {
  return String(value || '').slice(0, 10)
}

function formatDay(day, options = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Intl.DateTimeFormat('en-PH', options).format(new Date(`${day}T00:00:00`))
}

function dayHeading(day, today) {
  if (day === today) return `Today, ${formatDay(day, { month: 'short', day: 'numeric' })}`
  if (day === addDays(today, 1)) return `Tomorrow, ${formatDay(day, { month: 'short', day: 'numeric' })}`
  return formatDay(day)
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function customerName(item) {
  return item.full_name || item.username || `Customer #${item.user_id}`
}

function reservationStatus(item) {
  return String(item.status || '').trim().toLowerCase()
}

/** Things an administrator has to act on, most urgent first. Only groups with something in them are returned. */
function attentionItems(reservations, today) {
  const confirmed = reservations.filter((item) => reservationStatus(item) === 'confirmed')
  const notCheckedOut = confirmed.filter((item) => !item.checked_out_at)
  const missedPickups = notCheckedOut.filter((item) => (
    dateOnly(item.start_date) < today
    && dateOnly(item.end_date) > today
  ))
  const paymentsDue = notCheckedOut.filter((item) => (
    Number(item.payment_required) === 1
    && ['unpaid', 'failed'].includes(item.payment_status)
    && dateOnly(item.start_date) >= today
    && dateOnly(item.start_date) <= addDays(today, UNPAID_WARNING_DAYS)
  ))
  return [
    {
      key: 'late-returns',
      level: 'critical',
      count: confirmed.filter((item) => item.checked_out_at && !item.returned_at && dateOnly(item.end_date) < today).length,
      label: (n) => `${plural(n, 'late return')}`,
      action: 'Return',
      href: '/admin/reservations?status=confirmed',
    },
    {
      key: 'missed-pickups',
      level: 'critical',
      count: missedPickups.length,
      label: (n) => `${plural(n, 'missed pickup')}`,
      action: 'Review',
      href: '/admin/reservations?status=confirmed',
    },
    {
      key: 'special-approval',
      level: 'warning',
      count: reservations.filter((item) => reservationStatus(item) === 'awaiting_approval').length,
      label: (n) => `${plural(n, 'approval')} pending`,
      action: 'Review',
      href: '/admin/reservations?status=awaiting_approval',
    },
    // Standard reservations are confirmed by the payment gateway; unpaid bookings close to pickup
    // are shown here for follow-up.
    {
      key: 'awaiting-payment',
      level: 'warning',
      count: reservations.filter((item) => (
        item.status === 'pending'
        && dateOnly(item.start_date) >= today
        && dateOnly(item.start_date) <= addDays(today, UNPAID_WARNING_DAYS)
      )).length,
      label: (n) => `${plural(n, 'payment')} due soon`,
      action: 'View',
      href: '/admin/reservations?status=pending',
    },
    {
      key: 'unpaid-soon',
      level: 'warning',
      count: paymentsDue.length,
      label: (n) => `${plural(n, 'unpaid rental')}, pickup soon`,
      action: 'Review',
      href: '/admin/reservations?status=confirmed',
    },
  ].filter((item) => item.count > 0)
}

/** Monthly vehicle reassessments, from the status the assessment overview computes for each vehicle. */
function reassessmentItems(vehicles) {
  const count = (status) => vehicles.filter((vehicle) => vehicle.reassessment?.status === status).length
  return [
    {
      key: 'reassessment-overdue',
      level: 'warning',
      count: count('overdue'),
      label: (n) => `${plural(n, 'reassessment')} overdue`,
      action: 'Assess',
      href: '/admin/maintenance/predictions',
    },
    {
      key: 'reassessment-due-soon',
      level: 'info',
      count: count('due_soon'),
      label: (n) => `${plural(n, 'reassessment')} due this week`,
      action: 'Plan',
      href: '/admin/maintenance/predictions',
    },
    {
      key: 'reassessment-never',
      level: 'info',
      count: count('never_assessed'),
      label: (n) => `${plural(n, 'vehicle')} never assessed`,
      action: 'Assess',
      href: '/admin/maintenance/predictions',
    },
  ].filter((item) => item.count > 0)
}

/** Each reservation gives a pickup and a return, placed on the days they fall due. */
function scheduleEvents(reservations, today) {
  const lastDay = addDays(today, SCHEDULE_DAYS)
  const inWindow = (day) => day >= today && day <= lastDay
  const events = []
  for (const item of reservations) {
    const start = dateOnly(item.start_date)
    const end = dateOnly(item.end_date)
    if (['pending', 'confirmed'].includes(reservationStatus(item)) && !item.checked_out_at && inWindow(start)) {
      events.push({ key: `${item.id}-pickup`, day: start, type: 'Pickup', item })
    }
    if (reservationStatus(item) === 'confirmed' && !item.returned_at && inWindow(end)) {
      events.push({ key: `${item.id}-return`, day: end, type: 'Return', item })
    }
  }
  return events.sort((left, right) => left.day.localeCompare(right.day) || left.type.localeCompare(right.type))
}

function AlertIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
}

function ClockIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
}

function CheckIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500" /></svg>
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="ad-tiles" aria-hidden="true">
        {SKELETON_TILES.map((key) => <div className="ad-card ad-tile" key={key}><span className="ad-shimmer ad-line-short" /><span className="ad-shimmer ad-line-value" /><span className="ad-shimmer ad-line-short" /></div>)}
      </div>
      <div className="ad-panels" aria-hidden="true">
        <div className="ad-card ad-panel"><span className="ad-shimmer ad-line-short" /><span className="ad-shimmer ad-line-block" /></div>
        <div className="ad-card ad-panel"><span className="ad-shimmer ad-line-short" /><span className="ad-shimmer ad-line-block" /></div>
      </div>
    </div>
  )
}

export default function AdminDashboard({ navigate }) {
  const [fleet, setFleet] = useState({ total: 0, available: 0, rented: 0, maintenance: 0 })
  const [reservations, setReservations] = useState([])
  const [assessedVehicles, setAssessedVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [today, setToday] = useState(localToday)

  useEffect(() => {
    const refreshToday = () => setToday(localToday())
    const interval = window.setInterval(refreshToday, 60_000)
    window.addEventListener('focus', refreshToday)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshToday)
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    // Reassessment reminders are extra: if the assessment overview fails, the rest of the dashboard still loads.
    return Promise.all([getFleetCounts(), api.get('/api/reservations', { cache: 'no-store' }), getAssessmentFleet().catch(() => null)])
  }, [])

  useEffect(() => {
    let active = true
    loadDashboard()
      .then(([fleetCounts, reservationsResponse, assessmentFleet]) => {
        if (!active) return
        setFleet(fleetCounts)
        setReservations(reservationsResponse?.data || [])
        setAssessedVehicles(assessmentFleet?.vehicles || [])
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt, loadDashboard])

  useEffect(() => {
    let active = true
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      loadDashboard()
        .then(([fleetCounts, reservationsResponse, assessmentFleet]) => {
          if (!active) return
          setFleet(fleetCounts)
          setReservations(reservationsResponse?.data || [])
          if (assessmentFleet) setAssessedVehicles(assessmentFleet.vehicles || [])
          setError('')
        })
        .catch((requestError) => {
          if (active) setError(requestError.message)
        })
    }
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      active = false
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [loadDashboard])

  useEffect(() => {
    const refreshAfterReservationChange = () => {
      setAttempt((value) => value + 1)
    }
    window.addEventListener('reservations:changed', refreshAfterReservationChange)
    return () => window.removeEventListener('reservations:changed', refreshAfterReservationChange)
  }, [])

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  const counted = reservations.filter((item) => ['pending', 'awaiting_approval', 'confirmed', 'completed'].includes(reservationStatus(item)))
  const bookingValue = counted.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
  const paidValue = counted.reduce((sum, item) => sum + (item.payment_status === 'paid' ? Number(item.total_amount || 0) : 0), 0)
  const onTheRoad = reservations.filter((item) => reservationStatus(item) === 'confirmed' && item.checked_out_at && !item.returned_at).length
  const pendingCount = reservations.filter((item) => reservationStatus(item) === 'pending').length
  const awaitingApprovalCount = reservations.filter((item) => reservationStatus(item) === 'awaiting_approval').length
  const confirmedCount = reservations.filter((item) => reservationStatus(item) === 'confirmed').length

  const attention = [...attentionItems(reservations, today), ...reassessmentItems(assessedVehicles)]
  const events = scheduleEvents(reservations, today)
  const visibleEvents = events.slice(0, SCHEDULE_LIMIT)
  const eventDays = [...new Set(visibleEvents.map((event) => event.day))]
  const fleetBreakdown = [
    `${fleet.rented} rented`,
    `${fleet.maintenance} in maintenance`,
  ].join(' · ')

  return (
    <div className="admin-content ad">
      <header className="ad-header">
        <div>
          <span className="ad-eyebrow">{formatDay(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
          <h1>Dashboard</h1>
        </div>
        <button type="button" className="ad-btn ad-btn-primary" onClick={() => navigate('/admin/vehicles')}>Vehicles</button>
      </header>

      {loading ? <DashboardSkeleton /> : error ? (
        <div className="ad-card ad-state" role="alert">
          <h2>Couldn't load</h2>
          <p>{error}</p>
          <button type="button" className="ad-btn ad-btn-primary" onClick={retry}>Retry</button>
        </div>
      ) : (
        <>
          <dl className="ad-tiles">
            <div className="ad-card ad-tile">
              <dt>Available</dt>
              <dd className="ad-value">{fleet.available} <small>of {fleet.total}</small></dd>
              <dd className="ad-detail">{fleetBreakdown}</dd>
            </div>
            <div className="ad-card ad-tile">
              <dt>Out</dt>
              <dd className="ad-value">{onTheRoad}</dd>
              <dd className="ad-detail">On the road</dd>
            </div>
            <div className="ad-card ad-tile">
              <dt>Open</dt>
              <dd className="ad-value">{pendingCount + awaitingApprovalCount + confirmedCount}</dd>
              <dd className="ad-detail">{confirmedCount} confirmed</dd>
            </div>
            <div className="ad-card ad-tile">
              <dt>Value</dt>
              <dd className="ad-value">{money(bookingValue)}</dd>
              <dd className="ad-detail">{money(paidValue)} paid</dd>
            </div>
          </dl>

          <DashboardCharts reservations={reservations} today={today} fleetTotal={fleet.total} />

          <div className="ad-panels">
            <section className="ad-card ad-panel" aria-labelledby="ad-attention-title">
              <h2 id="ad-attention-title">To do</h2>
              {attention.length ? (
                <ul className="ad-attention">
                  {attention.map((entry) => (
                    <li key={entry.key}>
                      <button type="button" className={`ad-alert ad-alert-${entry.level}`} onClick={() => navigate(entry.href)}>
                        <span className="ad-alert-icon">{entry.level === 'critical' ? <AlertIcon /> : <ClockIcon />}</span>
                        <span className="ad-alert-text">{entry.label(entry.count)}</span>
                        <span className="ad-alert-action">{entry.action}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="ad-clear">
                  <span><CheckIcon /></span>
                  <p>All clear</p>
                </div>
              )}
            </section>

            <section className="ad-card ad-panel" aria-labelledby="ad-schedule-title">
              <div className="ad-panel-head">
                <h2 id="ad-schedule-title">Schedule <small>{SCHEDULE_DAYS} days</small></h2>
                <button type="button" className="ad-btn ad-btn-outline" onClick={() => navigate('/admin/reservations')}>View all</button>
              </div>
              {visibleEvents.length ? (
                <>
                  {eventDays.map((day) => (
                    <div className="ad-day" key={day}>
                      <h3>{dayHeading(day, today)}</h3>
                      <ul>
                        {visibleEvents.filter((event) => event.day === day).map(({ key, type, item }) => (
                          <li key={key}>
                            <span className={`ad-type ad-type-${type.toLowerCase()}`}>{type}</span>
                            <span className="ad-event-main">
                              <b>{item.make} {item.model}{item.variant_color ? ` · ${item.variant_color}` : ''}</b>
                              <small>{customerName(item)}</small>
                            </span>
                            <span className={`ad-status ad-status-${item.status}`}>{item.status}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {events.length > SCHEDULE_LIMIT && <p className="ad-more">+{events.length - SCHEDULE_LIMIT} more</p>}
                </>
              ) : <p className="ad-empty">Nothing scheduled.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
