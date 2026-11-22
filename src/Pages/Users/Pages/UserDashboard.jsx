import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import { tiltHandlers } from '../Components/tilt.js'
import { reservationPhotos, useReservationCars } from '../Components/reservationPhotos.js'
import { createPaymentCheckout } from '../../../Services/API/reservationAPI.js'
import { PaymentDialog } from '../Components/ReservationDialogs.jsx'
import './UserDashboard.css'
import { carPhoto } from '../Components/carPhoto.js'

const DAY_MS = 86400000
const PICKUP_LOCATION = 'Amuguis Street, Lumangbayan, Calapan, Philippines, 5200'
const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PICKUP_LOCATION)}`
const GOOGLE_MAPS_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(PICKUP_LOCATION)}&output=embed`

function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function formatDay(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const day = parseDay(value)
  return day ? day.toLocaleDateString('en-US', options) : value || '—'
}

function vehicleName(reservation) {
  return `${reservation.make || 'Vehicle'} ${reservation.model || ''}`.trim()
}

function plural(count, word) {
  return `${count} ${word}${Number(count) === 1 ? '' : 's'}`
}

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function describeTrip(trip, today) {
  if (!trip) return 'No trips planned yet. Pick a car and your dates, and your trip will show up here.'
  const name = vehicleName(trip)
  if (trip.status === 'pending') return Number(trip.special_duration_request) === 1
    ? `Your ${name} special rental is waiting for payment. It will be reviewed after payment is verified.`
    : `Your ${name} reservation is waiting for payment. It is confirmed automatically once your payment is verified.`
  if (trip.status === 'awaiting_approval') return `Payment for your ${name} is complete. Your special rental period is awaiting approval; pickup is ${formatDay(trip.start_date)} if approved.`
  if (trip.start_date <= today) return `You’re on the road. Your ${name} is due back ${formatDay(trip.end_date, { month: 'short', day: 'numeric' })}.`
  const days = Math.round((parseDay(trip.start_date) - parseDay(today)) / DAY_MS)
  if (days === 1) return `Pickup for your ${name} is tomorrow.`
  return `Pickup for your ${name} is in ${days} days.`
}

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
}

function StatIcon({ name }) {
  const paths = {
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4m8-4v4" /></>,
    road: <><path d="M5 20 9 4m10 16L15 4" /><path d="M12 6v2m0 4v2m0 4v2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5m0 3.2v.1" /></>,
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function CarThumb({ reservation, photos, className }) {
  const [failed, setFailed] = useState(0)
  const photo = photos[failed]
  return (
    <span className={className} aria-hidden="true">
      {photo
        ? <img key={photo} {...carPhoto(photo)} alt="" loading="lazy" onError={() => setFailed((count) => count + 1)} />
        : <CarSilhouette category={reservation.category} />}
    </span>
  )
}

const QUICK_ACTIONS = [
  { href: '/users/vehicles', title: 'Browse vehicles', text: 'See every car ready to rent', icon: <><path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" /><path d="M3 11h18v7H3zM6 18v2m12-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></> },
  { href: '/users/recommendations', title: 'Find my car', text: 'Match a car to your trip', icon: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8M8.5 11h5M11 8.5v5" /></> },
  { href: '/users/payments', title: 'Payments', text: 'Receipts and payment status', icon: <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></> },
  { href: '/users/profile', title: 'Profile', text: 'License and contact details', icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></> },
]

function QuickActions({ navigate }) {
  return (
    <nav className="dash-quick" aria-label="Quick actions">
      {QUICK_ACTIONS.map((action) => (
        <button type="button" key={action.href} className="dash-quick-item tilt3d" {...tiltHandlers} onClick={() => navigate(action.href)}>
          <span className="dash-quick-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{action.icon}</svg>
          </span>
          <span className="dash-quick-text"><b>{action.title}</b><small>{action.text}</small></span>
          <ArrowIcon />
        </button>
      ))}
    </nav>
  )
}

function PickupLocation() {
  return (
    <section className="dash-location" aria-labelledby="dash-location-title">
      <div className="dash-location-copy">
        <span className="dash-location-kicker">Pickup location</span>
        <h2 id="dash-location-title">Find us in Calapan</h2>
        <p>{PICKUP_LOCATION}</p>
        <a className="dash-link" href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">Open in Google Maps <ArrowIcon /></a>
      </div>
      <div className="dash-location-map">
        <iframe title="DriveRent pickup location" src={GOOGLE_MAPS_EMBED_URL} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
    </section>
  )
}

function Status({ status }) {
  const label = { pending: 'Pending payment', awaiting_approval: 'Awaiting approval' }[status] || status
  return <span className={`status-pill status-${status}`}><i />{label}</span>
}

function NextTripTicket({ trip, loading, failed, onPay }) {
  if (loading) {
    return (
      <div className="dash-ticket" aria-hidden="true">
        <span className="dash-skeleton dash-skeleton-dark" style={{ width: '46%' }} />
        <span className="dash-skeleton dash-skeleton-dark dash-skeleton-lg" style={{ width: '72%' }} />
        <span className="dash-skeleton dash-skeleton-dark" style={{ width: '100%' }} />
      </div>
    )
  }
  if (failed || !trip) {
    return (
      <div className="dash-ticket dash-ticket-empty">
        <small className="dash-ticket-label">Next trip</small>
        <div className="dash-ticket-route" aria-hidden="true">
          <span><small>Pickup</small><b>—</b></span>
          <i />
          <span><small>Return</small><b>—</b></span>
        </div>
        <p>{failed ? 'Unavailable' : 'Nothing booked yet'}</p>
      </div>
    )
  }
  return (
    <article className="dash-ticket">
      <header>
        <small className="dash-ticket-label">Next trip</small>
        <Status status={trip.status} />
      </header>
      <h2>{vehicleName(trip)}</h2>
      <div className="dash-ticket-route">
        <span><small>Pickup</small><b>{formatDay(trip.start_date)}</b></span>
        <i aria-hidden="true" />
        <span><small>Return</small><b>{formatDay(trip.end_date)}</b></span>
      </div>
      <footer>
        <span>{trip.rental_days ? `${plural(trip.rental_days, 'day')} · ` : ''}#{trip.id}</span>
        {trip.status === 'pending' && <button type="button" onClick={() => onPay(trip)}>Complete payment <ArrowIcon /></button>}
      </footer>
    </article>
  )
}

export default function UserDashboard({ user, navigate }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [payFor, setPayFor] = useState(null)

  useEffect(() => {
    let active = true
    api.get('/api/reservations')
      .then((response) => {
        if (active) setReservations(response?.data || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
          setReservations([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt])

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  async function startPayment() {
    const response = await createPaymentCheckout(payFor.id)
    const checkoutUrl = response?.data?.checkout_url
    if (!checkoutUrl) throw new Error('The payment checkout link was not returned.')
    window.location.assign(checkoutUrl)
  }

  const now = new Date()
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const nextRental = reservations
    .filter((item) => ['pending', 'awaiting_approval', 'confirmed'].includes(item.status) && item.end_date >= today)
    .sort((left, right) => left.start_date.localeCompare(right.start_date))[0]
  const recentReservations = reservations.slice(0, 4)
  const cars = useReservationCars(recentReservations)
  const activeRentals = reservations.filter((item) => (
    item.status === 'confirmed' && item.start_date <= today && item.end_date > today
  )).length
  const pendingReservations = reservations.filter((item) => item.status === 'pending').length
  const awaitingApproval = reservations.filter((item) => item.status === 'awaiting_approval').length
  const firstName = (user?.full_name || user?.username || 'Driver').trim().split(/\s+/)[0]
  const failed = Boolean(error)

  const stats = [
    { label: 'Reservations', value: reservations.length, icon: 'calendar' },
    { label: 'On the road', value: activeRentals, icon: 'road' },
    { label: 'Needs attention', value: pendingReservations + awaitingApproval, attention: pendingReservations + awaitingApproval > 0, icon: 'alert' },
  ]

  return (
    <div className="public-page content-width customer-dashboard-page dash">
      <section className="dash-hero">
        <div className="dash-hero-copy">
          <time dateTime={today}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</time>
          <h1>Welcome back, <em>{firstName}.</em></h1>
          <p>{loading ? 'Checking your trips…' : failed ? 'Your trip details are unavailable right now.' : describeTrip(nextRental, today)}</p>
          <section className="dash-stats" aria-label="Reservation overview" aria-busy={loading}>
            {stats.map((stat) => {
              const empty = !loading && !failed && stat.value === 0
              return (
                <article className={`dash-stat${stat.attention ? ' is-attention' : ''}`} key={stat.label}>
                  <span className="dash-stat-icon"><StatIcon name={stat.icon} /></span>
                  {loading
                    ? <span className="dash-skeleton dash-skeleton-num" />
                    : <b className={`${empty ? 'is-zero' : ''}${stat.attention ? ' is-attention' : ''}`}>{failed ? '—' : stat.value}</b>}
                  <span>{stat.label}</span>
                </article>
              )
            })}
          </section>
          <button className="dash-hero-action" type="button" onClick={() => navigate('/users/vehicles')}>Browse vehicles <ArrowIcon /></button>
        </div>
        <NextTripTicket trip={nextRental} loading={loading} failed={failed} onPay={setPayFor} />
      </section>

      <QuickActions navigate={navigate} />

      {error && (
        <div className="dash-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retry}>Try again</button>
        </div>
      )}


      <div className="dash-lower">
        <section className="dash-panel dash-recent" aria-labelledby="dash-recent-title" aria-busy={loading}>
          <header>
            <h2 id="dash-recent-title">Recent reservations</h2>
          </header>
          {loading ? (
            <div className="dash-rows" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div className="dash-row" key={row}>
                  <div><span className="dash-skeleton" style={{ width: '42%' }} /><span className="dash-skeleton" style={{ width: '64%' }} /></div>
                </div>
              ))}
            </div>
          ) : recentReservations.length ? (
            <ul className="dash-rows">
              {recentReservations.map((reservation) => (
                <li className="dash-row" key={reservation.id}>
                  <CarThumb
                    key={`${reservation.id}-${cars[reservation.car_id] ? 'full' : 'basic'}`}
                    reservation={reservation}
                    photos={reservationPhotos(reservation, cars[reservation.car_id])}
                    className="dash-row-thumb"
                  />
                  <div>
                    <b>{vehicleName(reservation)}</b>
                    <small>{formatDay(reservation.start_date, { month: 'short', day: 'numeric' })} – {formatDay(reservation.end_date)} · #{reservation.id}</small>
                  </div>
                  <div className="dash-row-status">
                    <Status status={reservation.status} />
                    {reservation.status === 'pending' && <button className="dash-row-pay" type="button" onClick={() => setPayFor(reservation)}>Pay</button>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dash-empty">
              <p>{failed ? 'Unavailable until your reservations load.' : 'Your bookings will appear here once you reserve a vehicle.'}</p>
            </div>
          )}
        </section>

        <aside className="dash-panel dash-finder">
          <h2>Not sure which car fits?</h2>
          <p>Tell us about your trip and we’ll compare your needs with the vehicles available now.</p>
          <button className="dash-link" type="button" onClick={() => navigate('/users/recommendations')}>Get recommendations <ArrowIcon /></button>
          <PickupLocation />
        </aside>
      </div>
      {payFor && <PaymentDialog
        reservation={payFor}
        amount={money(payFor.total_amount)}
        onCheckout={startPayment}
        onClose={() => setPayFor(null)}
      />}
    </div>
  )
}
