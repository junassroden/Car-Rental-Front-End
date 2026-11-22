import { useCallback, useEffect, useMemo, useState } from 'react'
import { getReservations, sendAgreementEmail, updateReservationStatus, updateVehicleUse } from '../../../Services/API/reservationAPI.js'
import './ReservationManagement.css'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

// Reservations are confirmed by a verified payment; a paid special-duration request then waits here for approval.
const STATUS_LABELS = { pending: 'Unpaid', awaiting_approval: 'Approval', confirmed: 'Confirmed', cancelled: 'Cancelled', rejected: 'Rejected', completed: 'Completed', expired: 'Expired' }
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending', failed: 'Failed', unpaid: 'Unpaid', not_required: 'Free' }
const ACTIVE_STATUSES = ['pending', 'awaiting_approval', 'confirmed']
const HISTORY_STATUSES = ['completed', 'cancelled', 'rejected', 'expired']

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Whole days from ISO date a to ISO date b (both YYYY-MM-DD). */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

function shortDate(value, withYear = false) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(date)
}

const needsRefund = (reservation) => reservation.payment_status === 'paid' && ['cancelled', 'rejected'].includes(reservation.status)

/** Where a current reservation stands today, for the trip column. Null when nothing time-based applies. */
function timing(reservation, today) {
  if (reservation.status !== 'confirmed') return null
  if (reservation.checked_out_at) {
    if (reservation.end_date < today) return { tone: 'red', label: `Overdue ${daysBetween(reservation.end_date, today)}d` }
    if (reservation.end_date === today) return { tone: 'amber', label: 'Due today' }
    return { tone: 'teal', label: `Back ${shortDate(reservation.end_date)}` }
  }
  if (reservation.start_date === today) return { tone: 'green', label: 'Pickup today' }
  if (reservation.start_date > today) {
    const days = daysBetween(today, reservation.start_date)
    return { tone: 'blue', label: days === 1 ? 'Tomorrow' : `In ${days}d` }
  }
  if (reservation.end_date > today) return { tone: 'green', label: 'Ready' }
  return { tone: 'grey', label: 'Missed' }
}

function Icon({ name, size = 18 }) {
  const shapes = {
    key: <><circle cx="8" cy="15" r="5" /><path d="m11.5 11.5 8-8M16 7l2 2m-5 1 2 2" /></>,
    car: <><path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" /><path d="M3 11h18v7H3zM6 18v2m12-2v2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    refund: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
    statReady: <><circle cx="7.5" cy="16" r="4.5" /><circle cx="7.5" cy="16" r="1.2" /><path d="M10.8 12.7 20 3.5M16.5 7l2.5 2.5M14 9.5l2 2" /></>,
    statOut: <><path d="M3 16.5v-3.4c0-.5.3-.9.8-1l2.9-.9 2.1-3.1c.3-.4.8-.7 1.3-.7h5c.5 0 1 .2 1.3.6l2.6 3.2 1.3.3c.4.1.7.5.7 1v4" /><circle cx="7.5" cy="16.5" r="1.9" /><circle cx="16.5" cy="16.5" r="1.9" /><path d="M9.4 16.5h5.2M8.5 11.2h10" /></>,
    statOverdue: <><path d="M20.6 13.5A9 9 0 1 1 12 3a9 9 0 0 1 7.4 3.9" /><path d="M12 7.5V12l3 2" /><path d="M20 9.5v4M20 17h.01" /></>,
    statReview: <><path d="M6.5 3h11M6.5 21h11" /><path d="M7.5 3v2.6a4 4 0 0 0 1.7 3.3L12 11l2.8-2.1a4 4 0 0 0 1.7-3.3V3M7.5 21v-2.6a4 4 0 0 1 1.7-3.3L12 13l2.8 2.1a4 4 0 0 1 1.7 3.3V21" /></>,
    statDone: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16.2 9.5" /></>,
    statCancelled: <><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></>,
    statRejected: <><circle cx="12" cy="12" r="9" /><path d="m5.7 5.7 12.6 12.6" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

/** One segment of the summary strip. Clickable segments filter the list. */
function Stat({ icon, tone = 'grey', label, value, note, onClick, active }) {
  const content = <>
    <span className="rsv-stat-label">{label}</span>
    <strong>{value}</strong>
    {note && <small>{note}</small>}
    <span className={`rsv-stat-icon tone-${tone}`} aria-hidden="true"><Icon name={icon} size={20} /></span>
  </>
  return onClick
    ? <button type="button" className={`rsv-stat is-action${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onClick}>{content}</button>
    : <div className="rsv-stat">{content}</div>
}

export default function ReservationManagement({ historyView = false, setToast }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') || 'all')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const today = localToday()

  const refresh = useCallback(async () => {
    setError('')
    try {
      setReservations(await getReservations())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => { if (active) setReservations(results) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function updateStatus(id, status) {
    const reservation = reservations.find((item) => Number(item.id) === Number(id))
    if (status === 'cancelled' && !window.confirm(`Cancel reservation #${id}? The record is kept in Reservation History.`)) return
    if (status === 'confirmed' && reservation?.status === 'awaiting_approval'
      && !window.confirm(`Approve special reservation #${id}? The customer will be emailed the agreement and pickup date.`)) return
    if (status === 'rejected' && reservation?.status === 'awaiting_approval'
      && !window.confirm(`Reject special reservation #${id}? Payment has been received; a refund will need to be arranged.`)) return
    setUpdatingId(id)
    setError('')
    try {
      const response = await updateReservationStatus(id, status)
      await refresh()
      window.dispatchEvent(new Event('reservations:changed'))
      setToast?.(response?.message || 'Reservation status updated.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  async function updateUse(id, action) {
    setUpdatingId(id)
    setError('')
    try {
      await updateVehicleUse(id, action)
      await refresh()
      window.dispatchEvent(new Event('reservations:changed'))
      setToast?.(action === 'checkout' ? 'Vehicle handover recorded.' : 'Vehicle return recorded.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  async function resendAgreement(id) {
    setUpdatingId(id)
    setError('')
    try {
      const response = await sendAgreementEmail(id)
      await refresh()
      setToast?.(response?.message || 'Rental agreement emailed.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const viewStatuses = historyView ? HISTORY_STATUSES : ACTIVE_STATUSES
  const inView = useMemo(() => reservations.filter((reservation) => viewStatuses.includes(reservation.status)), [reservations, viewStatuses])
  const activeFilter = viewStatuses.includes(statusFilter) || ['pickup', 'out', 'overdue', 'refund', 'attention'].includes(statusFilter) ? statusFilter : 'all'

  const stats = useMemo(() => {
    const counts = { all: inView.length }
    viewStatuses.forEach((status) => { counts[status] = inView.filter((item) => item.status === status).length })
    const out = inView.filter((item) => item.status === 'confirmed' && item.checked_out_at)
    return {
      counts,
      pickupsToday: inView.filter((item) => item.status === 'confirmed' && !item.checked_out_at && item.start_date <= today && item.end_date > today).length,
      out: out.length,
      overdue: out.filter((item) => item.end_date < today).length,
      dueToday: out.filter((item) => item.end_date === today).length,
      refunds: inView.filter(needsRefund).length,
      refundAmount: inView.filter(needsRefund).reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      pendingValue: inView.filter((item) => item.status === 'pending').reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      awaitingApproval: inView.filter((item) => item.status === 'awaiting_approval').length,
      completedValue: inView.filter((item) => item.status === 'completed').reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    }
  }, [inView, viewStatuses, today])

  const matchesQuick = (reservation) => {
    if (activeFilter === 'attention') return ['pending', 'awaiting_approval'].includes(reservation.status)
    if (activeFilter === 'pickup') return reservation.status === 'confirmed' && !reservation.checked_out_at && reservation.start_date <= today && reservation.end_date > today
    if (activeFilter === 'out') return reservation.status === 'confirmed' && Boolean(reservation.checked_out_at)
    if (activeFilter === 'overdue') return reservation.status === 'confirmed' && reservation.checked_out_at && reservation.end_date < today
    if (activeFilter === 'refund') return needsRefund(reservation)
    return activeFilter === 'all' || reservation.status === activeFilter
  }

  const searchTerm = search.trim().toLowerCase()
  const visibleReservations = inView.filter((reservation) => (
    matchesQuick(reservation)
    && (!searchTerm || [
      reservation.id,
      reservation.full_name,
      reservation.username,
      reservation.email,
      reservation.make,
      reservation.model,
      reservation.variant_color,
      reservation.plate_number,
      reservation.payment_reference,
    ].some((value) => String(value || '').toLowerCase().includes(searchTerm)))
  ))
  const toggle = (value) => setStatusFilter(activeFilter === value ? 'all' : value)

  const quickLabels = { pickup: 'Ready', out: 'Out', overdue: 'Overdue', refund: 'Refunds', attention: 'To review' }
  const dash = (value) => (loading ? '—' : value)

  return (
    <div className="admin-content rsv-page">
      <header className="rsv-header">
        <h1>{historyView ? 'Reservation History' : 'Reservations'}</h1>
        <label className="rsv-search">
          <Icon name="search" size={16} />
          <span className="rsv-sr">Search reservations</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
        </label>
      </header>

      <section className="rsv-stats" aria-label="Reservation summary">
        {historyView ? <>
          <Stat tone="green" icon="statDone" label="Completed" value={dash(stats.counts.completed)} note={stats.completedValue ? money(stats.completedValue) : null} />
          <Stat tone="grey" icon="statCancelled" label="Cancelled" value={dash(stats.counts.cancelled)} />
          <Stat tone="red" icon="statRejected" label="Rejected" value={dash(stats.counts.rejected)} />
          <Stat tone="red" icon="refund" label="Refunds" value={dash(stats.refunds)} note={stats.refunds ? money(stats.refundAmount) : null} onClick={stats.refunds ? () => toggle('refund') : undefined} active={activeFilter === 'refund'} />
        </> : <>
          <Stat tone="green" icon="statReady" label="Ready" value={dash(stats.pickupsToday)} onClick={stats.pickupsToday ? () => toggle('pickup') : undefined} active={activeFilter === 'pickup'} />
          <Stat tone="teal" icon="statOut" label="Out" value={dash(stats.out)} note={stats.dueToday ? `${stats.dueToday} due today` : null} onClick={stats.out ? () => toggle('out') : undefined} active={activeFilter === 'out'} />
          <Stat tone="red" icon="statOverdue" label="Overdue" value={dash(stats.overdue)} onClick={stats.overdue ? () => toggle('overdue') : undefined} active={activeFilter === 'overdue'} />
          <Stat tone="amber" icon="statReview" label="To review" value={dash(stats.counts.pending + stats.awaitingApproval)} onClick={stats.counts.pending + stats.awaitingApproval ? () => toggle('attention') : undefined} active={activeFilter === 'attention'} />
        </>}
      </section>

      <section className="rsv-panel" aria-label={historyView ? 'Reservation records' : 'Current reservations'}>
        <div className="rsv-toolbar">
          <div className="rsv-tabs" role="tablist" aria-label="Filter by status">
            {['all', ...viewStatuses].map((status) => (
              <button key={status} type="button" role="tab" aria-selected={activeFilter === status} className={activeFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
                {status === 'all' ? 'All' : STATUS_LABELS[status]}<span>{stats.counts[status] ?? 0}</span>
              </button>
            ))}
          </div>
          {!['all', ...viewStatuses].includes(activeFilter) && (
            <button type="button" className="rsv-chip" onClick={() => setStatusFilter('all')}>
              {quickLabels[activeFilter]}<Icon name="x" size={12} />
            </button>
          )}
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? (
          <div className="rsv-loading" aria-busy="true" aria-label="Loading reservations">{[0, 1, 2, 3].map((key) => <span key={key} />)}</div>
        ) : visibleReservations.length ? (
          <>
            <div className="rsv-table-wrap">
              <table className="rsv-table">
                <thead><tr><th>Customer</th><th>Vehicle</th><th>Trip</th><th className="is-num">Total</th><th>Status</th>{!historyView && <th className="is-end"><span className="rsv-sr">Actions</span></th>}</tr></thead>
                <tbody>{visibleReservations.map((reservation, index) => {
                  const when = historyView ? null : timing(reservation, today)
                  const name = reservation.full_name || reservation.username || 'Customer'
                  const refund = needsRefund(reservation)
                  const busy = updatingId === reservation.id
                  const canCancel = !reservation.checked_out_at && reservation.payment_status !== 'paid'
                  const canReturn = reservation.status === 'confirmed' && reservation.checked_out_at
                  const canCheckout = reservation.status === 'confirmed' && !reservation.checked_out_at
                    && ['paid', 'not_required'].includes(reservation.payment_status)
                    && reservation.start_date <= today && reservation.end_date > today
                  const waitingForPickup = reservation.status === 'confirmed' && !reservation.checked_out_at && reservation.start_date > today
                  const awaitingApproval = reservation.status === 'awaiting_approval'
                  const canResendAgreement = reservation.status === 'confirmed'
                    && reservation.payment_status === 'paid'
                    && !reservation.agreement_email_sent_at
                  return (
                    <tr key={reservation.id} className={when?.tone === 'red' || refund ? 'is-alert' : ''} style={{ '--i': Math.min(index, 12) }}>
                      <td>
                        <div className="rsv-customer">
                          <span className="rsv-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                          <div>
                            <b title={reservation.email || undefined}>{name}</b>
                            <small>
                              #{reservation.id}
                              {Number(reservation.special_duration_request) === 1 && <span className="rsv-tag tone-violet">Special</span>}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <b>{reservation.make} {reservation.model}</b>
                        <div className="rsv-vehicle-meta">
                          {reservation.plate_number && <small className="rsv-plate">{reservation.plate_number}</small>}
                          {reservation.variant_color && <small>{reservation.variant_color}</small>}
                        </div>
                      </td>
                      <td>
                        <b className="rsv-trip">{shortDate(reservation.start_date)} <Icon name="arrow" size={12} /> {shortDate(reservation.end_date)}</b>
                        <small className="rsv-trip-meta">
                          {reservation.rental_days}d
                          {when && <span className={`rsv-tag tone-${when.tone}`}>{when.label}</span>}
                        </small>
                      </td>
                      <td className="is-num">
                        <b className="rsv-amount">{money(reservation.total_amount)}</b>
                        <small className={`rsv-pay is-${reservation.payment_status}`} title={reservation.payment_reference || undefined}>
                          <i />{PAYMENT_LABELS[reservation.payment_status] || reservation.payment_status}
                        </small>
                        {refund && <small className="rsv-refund">Refund</small>}
                        {reservation.payment_review_reason && <small className="rsv-refund" title={reservation.payment_review_reason}>Review</small>}
                      </td>
                      <td>
                        <span className={`rsv-status is-${reservation.status}`}>{STATUS_LABELS[reservation.status] || reservation.status}</span>
                        {reservation.checked_out_at && reservation.status === 'confirmed' && <span className="rsv-status is-out">Out</span>}
                      </td>
                      {!historyView && (
                        <td className="is-end">
                          {/* Two fixed slots so every row's buttons line up: next step, then a secondary action. */}
                          <div className="rsv-actions">
                            <span className="rsv-slot is-main">
                              {awaitingApproval ? (
                                <button type="button" className="rsv-btn is-primary" disabled={busy} onClick={() => updateStatus(reservation.id, 'confirmed')}>
                                  <Icon name="check" size={14} />{busy ? '…' : 'Approve'}
                                </button>
                              ) : canCheckout ? (
                                <button type="button" className="rsv-btn is-primary" disabled={busy} onClick={() => updateUse(reservation.id, 'checkout')}>
                                  <Icon name="key" size={14} />{busy ? '…' : 'Check out'}
                                </button>
                              ) : canReturn ? (
                                <button type="button" className="rsv-btn is-primary is-return" disabled={busy} onClick={() => updateUse(reservation.id, 'return')}>
                                  <Icon name="return" size={14} />{busy ? '…' : 'Return'}
                                </button>
                              ) : (
                                <span className="rsv-no-action">{waitingForPickup ? <><Icon name="clock" size={13} />{shortDate(reservation.start_date)}</> : '—'}</span>
                              )}
                            </span>
                            <span className="rsv-slot is-side">
                              {awaitingApproval ? (
                                <button type="button" className="rsv-btn is-icon is-danger" disabled={busy} title="Reject" aria-label="Reject" onClick={() => updateStatus(reservation.id, 'rejected')}>
                                  <Icon name="x" size={14} />
                                </button>
                              ) : canResendAgreement ? (
                                <button type="button" className="rsv-btn is-icon" disabled={busy} title="Send agreement email" aria-label="Send agreement email" onClick={() => resendAgreement(reservation.id)}>
                                  <Icon name="mail" size={15} />
                                </button>
                              ) : canCancel ? (
                                <button type="button" className="rsv-btn is-icon is-danger" disabled={busy} title="Cancel reservation" aria-label="Cancel reservation" onClick={() => updateStatus(reservation.id, 'cancelled')}>
                                  <Icon name="x" size={14} />
                                </button>
                              ) : null}
                            </span>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
            <footer className="rsv-foot"><b>{visibleReservations.length}</b> of {inView.length}</footer>
          </>
        ) : !error && (
          <div className="rsv-empty" role="status">
            <span className="rsv-empty-icon"><Icon name="calendar" size={20} /></span>
            <h3>{inView.length ? 'No matches' : 'No reservations'}</h3>
            {inView.length > 0 && <button type="button" onClick={() => { setStatusFilter('all'); setSearch('') }}>Clear filters</button>}
          </div>
        )}
      </section>
    </div>
  )
}
