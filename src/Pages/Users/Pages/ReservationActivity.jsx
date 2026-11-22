import { useEffect, useMemo, useState } from 'react'
import { getReservations } from '../../../Services/API/reservationAPI.js'
import { reservationPhotos, useReservationCars } from '../Components/reservationPhotos.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import '../Components/ReservationDialogs.css'
import { carPhoto } from '../Components/carPhoto.js'

const VIEW_COPY = {
  active: {
    eyebrow: 'Your rentals',
    title: 'Active rentals',
    description: 'Confirmed rentals that are currently in progress.',
    emptyTitle: 'No active rentals',
    emptyMessage: 'When you pick up a confirmed vehicle, it will appear here.',
  },
  history: {
    eyebrow: 'Your account',
    title: 'Reservation history',
    description: 'Your completed and past reservations.',
    emptyTitle: 'No reservation history yet',
    emptyMessage: 'Completed and past reservations will appear here.',
  },
}

const STATUS_LABELS = {
  pending: 'Pending payment',
  awaiting_approval: 'Awaiting approval',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  expired: 'Expired (not paid in time)',
  rejected: 'Rejected',
}

const PAYMENT_LABELS = {
  paid: 'Paid',
  pending: 'Pending verification',
  failed: 'Failed',
}

function localToday() {
  const date = new Date()
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return value || '—'
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function money(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: Number(value) % 1 ? 2 : 0,
  }).format(Number(value || 0))
}

function ReservationCard({ reservation, photos }) {
  const [failed, setFailed] = useState(0)
  const photo = photos[failed]
  const payment = reservation.payment_status

  return (
    <article className="rv-card">
      <div className="rv-photo" aria-hidden="true">
        {photo
          ? <img key={photo} {...carPhoto(photo)} alt="" loading="lazy" onError={() => setFailed((count) => count + 1)} />
          : <span className="rv-photo-empty"><CarSilhouette category={reservation.category} /></span>}
      </div>
      <div className="rv-card-body">
        <div className="rv-card-head">
          <div>
            <div className="rv-title">
              <h2>{reservation.make} {reservation.model}</h2>
              <span className={`rv-status rv-status-${reservation.status}`}>
                {STATUS_LABELS[reservation.status] || reservation.status}
              </span>
            </div>
            <p>Reservation #{reservation.id}</p>
          </div>
          <div className="rv-total">
            <b>{money(reservation.total_amount)}</b>
            <small>{reservation.rental_days} day{Number(reservation.rental_days) === 1 ? '' : 's'}</small>
          </div>
        </div>

        <dl className="rv-facts">
          <div><dt>Pickup</dt><dd>{formatDate(reservation.start_date)}</dd></div>
          <div><dt>Return</dt><dd>{formatDate(reservation.end_date)}</dd></div>
          <div><dt>Payment</dt><dd>{PAYMENT_LABELS[payment] || (reservation.payment_required ? 'Not paid' : 'Not required')}</dd></div>
        </dl>
      </div>
    </article>
  )
}

export default function ReservationActivity({ navigate, view = 'active' }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const copy = VIEW_COPY[view] || VIEW_COPY.active

  useEffect(() => {
    let active = true
    getReservations()
      .then((items) => {
        if (active) setReservations(items)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt])

  const visible = useMemo(() => {
    const today = localToday()
    if (view === 'active') {
      return reservations.filter((item) => (
        item.status === 'confirmed'
        && item.start_date <= today
        && item.end_date >= today
      ))
    }

    return reservations.filter((item) => (
      ['completed', 'cancelled', 'rejected', 'expired'].includes(item.status)
      || item.end_date < today
    ))
  }, [reservations, view])

  const cars = useReservationCars(visible)

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  return (
    <div className="public-page content-width rv">
      <header className="rv-header">
        <div>
          <span className="rv-eyebrow">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>
      </header>

      {error && <div className="rv-banner rv-banner-bad" role="alert">{error}</div>}

      {loading ? (
        <div className="rv-list" aria-busy="true">
          {[1, 2].map((id) => (
            <article className="rv-card rv-skeleton" key={id} aria-hidden="true">
              <div className="rv-photo rv-shimmer" />
              <div className="rv-card-body">
                <span className="rv-shimmer rv-line-title" />
                <span className="rv-shimmer rv-line-meta" />
                <span className="rv-shimmer rv-line-facts" />
              </div>
            </article>
          ))}
        </div>
      ) : visible.length > 0 ? (
        <div className="rv-list">
          {visible.map((reservation) => (
            <ReservationCard
              key={`${reservation.id}-${cars[reservation.car_id] ? 'full' : 'basic'}`}
              reservation={reservation}
              photos={reservationPhotos(reservation, cars[reservation.car_id])}
            />
          ))}
        </div>
      ) : (
        <div className="rv-state" role="status">
          <span className="rv-state-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {error
                ? <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5m0 3.2v.1" /></>
                : <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4m8-4v4" /></>}
            </svg>
          </span>
          <h2>{error ? 'Unable to load reservations' : copy.emptyTitle}</h2>
          <p>{error ? 'Check your connection and try again.' : copy.emptyMessage}</p>
          {error
            ? <button className="rv-btn rv-btn-primary" type="button" onClick={retry}>Try again</button>
            : <button className="rv-btn rv-btn-primary" type="button" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button>}
        </div>
      )}
    </div>
  )
}
