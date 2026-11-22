import { useEffect, useMemo, useState } from 'react'
import { getReservations } from '../../../Services/API/reservationAPI.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import './PaymentHistory.css'
import { carPhoto } from '../Components/carPhoto.js'
import { reservationPhotos, useReservationCars } from '../Components/reservationPhotos.js'

// The server returns only the signed-in customer's reservations, so only their payments appear here.
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending verification', failed: 'Failed' }
const RESERVATION_LABELS = {
  pending: 'Awaiting payment',
  awaiting_approval: 'Special rental awaiting approval',
  confirmed: 'Reservation confirmed',
  completed: 'Rental completed',
  cancelled: 'Reservation cancelled',
  rejected: 'Reservation rejected',
}
const FILTERS = [
  ['all', 'All payments'],
  ['paid', 'Paid'],
  ['pending', 'Pending'],
  ['failed', 'Failed'],
]

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value) {
  const date = parseDate(value)
  if (!date) return value || '—'
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatShortDate(value) {
  const date = parseDate(value)
  if (!date) return value || '—'
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatRange(start, end) {
  const from = parseDate(start)
  const to = parseDate(end)
  if (!from || !to) return `${start || '—'} → ${end || '—'}`
  const sameYear = from.getFullYear() === to.getFullYear()
  const left = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(from)
  return `${left} – ${formatShortDate(end)}`
}

function paymentAmount(item) {
  return Number(item.payment_amount ?? item.total_amount ?? 0)
}

function paymentDate(item) {
  return item.payment_status === 'paid' ? item.payment_paid_at : item.payment_created_at
}

function Icon({ name, size = 18 }) {
  const shapes = {
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18m-5 5h2" /><path d="M6 5V3h12v2" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    arrow: <path d="M5 12h14m-7-7 7 7-7 7" />,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

function CopyReference({ value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="pay-ref-empty">No reference</span>
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button type="button" className={`pay-ref${copied ? ' is-copied' : ''}`} onClick={copy} title={value} aria-label={copied ? 'Reference copied' : `Copy reference ${value}`}>
      <code>{value}</code>
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
  )
}

function PaymentCard({ item, photos }) {
  const status = item.payment_status
  const [failed, setFailed] = useState(0)
  const photo = photos[failed]
  const days = Number(item.rental_days) || null
  return (
    <article className={`pay-card pay-card--${status}`}>
      <div className="pay-card-vehicle">
        <div className="pay-thumb" aria-hidden="true">
          {photo ? <img key={photo} {...carPhoto(photo)} alt="" loading="lazy" onError={() => setFailed((count) => count + 1)} /> : <CarSilhouette category={item.category} />}
        </div>
        <div>
          <span className="pay-card-kicker">Reservation #{item.id}</span>
          <h3>{item.make} {item.model}</h3>
          <p><Icon name="calendar" size={14} />{formatRange(item.start_date, item.end_date)}{days ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}</p>
        </div>
      </div>

      <dl className="pay-card-meta">
        <div><dt>Method</dt><dd>{item.payment_method || '—'}</dd></div>
        <div><dt>{status === 'paid' ? 'Paid on' : 'Started on'}</dt><dd>{formatDateTime(paymentDate(item))}</dd></div>
        <div className="pay-card-ref"><dt>Reference</dt><dd><CopyReference value={item.payment_reference} /></dd></div>
      </dl>

      <div className="pay-card-amount">
        <span className={`pay-status pay-status--${status}`}><i />{PAYMENT_LABELS[status] || status}</span>
        <strong>{money(paymentAmount(item))}</strong>
        <small className="pay-reservation-status">{RESERVATION_LABELS[item.status] || item.status}</small>
      </div>
    </article>
  )
}

export default function PaymentHistory({ navigate }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [paymentNotice, setPaymentNotice] = useState('')

  useEffect(() => {
    let active = true
    let timer
    let attempts = 0
    const params = new URLSearchParams(window.location.search)
    const paymentResult = params.get('payment')
    const reservationId = Number(params.get('reservation'))

    async function refresh() {
      try {
        const results = await getReservations()
        if (!active) return
        const withPayments = results.filter((item) => item.payment_id)
        withPayments.sort((a, b) => (parseDate(paymentDate(b))?.getTime() || 0) - (parseDate(paymentDate(a))?.getTime() || 0))
        setPayments(withPayments)
        attempts += 1

        if (paymentResult === 'cancelled') {
          setPaymentNotice('Checkout was cancelled. No payment was completed.')
        } else if (paymentResult === 'success') {
          const reservation = results.find((item) => Number(item.id) === reservationId)
          if (reservation?.payment_status === 'paid') {
            setPaymentNotice(reservation.status === 'awaiting_approval'
              ? `Payment verified. Your special rental is awaiting approval. Pickup is ${formatShortDate(reservation.start_date)}.`
              : `Payment verified. Your reservation is confirmed. Pickup is ${formatShortDate(reservation.start_date)}.`)
          } else if (reservation?.payment_status === 'failed') {
            setPaymentNotice('The payment provider reported that this payment failed. You can retry from the Next trip panel on your dashboard.')
          } else if (attempts < 8) {
            setPaymentNotice('Payment submitted. Waiting for the provider to verify it…')
            timer = window.setTimeout(refresh, 3000)
          } else {
            setPaymentNotice('Payment submitted, but verification is still pending. Refresh this page later to check the latest status.')
          }
        }
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    if (paymentResult || params.has('reservation')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [])

  const summary = useMemo(() => {
    const paid = payments.filter((item) => item.payment_status === 'paid')
    const counts = { all: payments.length, paid: paid.length, pending: 0, failed: 0 }
    payments.forEach((item) => { if (item.payment_status in counts && item.payment_status !== 'paid') counts[item.payment_status] += 1 })
    return {
      counts,
      totalPaid: paid.reduce((sum, item) => sum + paymentAmount(item), 0),
      latest: paid[0] ? paymentDate(paid[0]) : null,
    }
  }, [payments])

  const visible = filter === 'all' ? payments : payments.filter((item) => item.payment_status === filter)
  const cars = useReservationCars(visible)

  return (
    <div className="public-page content-width pay-page">
      <header className="pay-header">
        <div>
          <span className="pay-eyebrow">Your account</span>
          <h1>Payment history</h1>
          <p>Payments are verified by the provider. Standard reservations confirm automatically; special rental periods need administrator approval.</p>
        </div>
      </header>

      {paymentNotice && <div className="pay-return" role="status">{paymentNotice}</div>}

      <section className="pay-stats" aria-label="Payment summary">
        <article className="pay-stat pay-stat--feature">
          <span className="pay-stat-icon"><Icon name="wallet" size={20} /></span>
          <span className="pay-stat-label">Total paid</span>
          <strong>{loading ? '—' : money(summary.totalPaid)}</strong>
          <small>{summary.counts.paid} verified payment{summary.counts.paid === 1 ? '' : 's'}</small>
        </article>
        <article className="pay-stat">
          <span className="pay-stat-icon"><Icon name="receipt" size={20} /></span>
          <span className="pay-stat-label">Payments</span>
          <strong>{loading ? '—' : summary.counts.all}</strong>
          <small>Across your reservations</small>
        </article>
        <article className="pay-stat">
          <span className="pay-stat-icon"><Icon name="clock" size={20} /></span>
          <span className="pay-stat-label">Pending verification</span>
          <strong>{loading ? '—' : summary.counts.pending}</strong>
          <small>{summary.counts.pending ? 'Waiting on the provider' : 'Nothing waiting'}</small>
        </article>
        <article className="pay-stat">
          <span className="pay-stat-icon"><Icon name="calendar" size={20} /></span>
          <span className="pay-stat-label">Last payment</span>
          <strong className="pay-stat-date">{loading ? '—' : summary.latest ? formatShortDate(summary.latest) : 'None yet'}</strong>
          <small>Most recent verified payment</small>
        </article>
      </section>

      <section className="pay-panel" aria-labelledby="pay-list-title">
        <div className="pay-panel-head">
          <h2 id="pay-list-title">Transactions</h2>
          <div className="pay-tabs" role="tablist" aria-label="Filter payments by status">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
                {label}<span>{summary.counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}

        {loading ? (
          <div className="pay-list" aria-busy="true" aria-label="Loading payment records">
            {[0, 1, 2].map((key) => <div className="pay-skeleton" key={key}><span /><i /><i /></div>)}
          </div>
        ) : visible.length ? (
          <div className="pay-list">
            {visible.map((item) => (
              <PaymentCard
                key={`${item.payment_id}-${cars[item.car_id] ? 'full' : 'basic'}`}
                item={item}
                photos={reservationPhotos(item, cars[item.car_id])}
              />
            ))}
          </div>
        ) : !error && (
          <div className="pay-empty" role="status">
            <span className="pay-empty-icon"><Icon name="card" size={26} /></span>
            <h3>{payments.length ? `No ${filter} payments` : 'No payments yet'}</h3>
            <p>{payments.length ? 'Try another filter to see the rest of your payments.' : 'Payments you make for your reservations will appear here.'}</p>
            {!payments.length && navigate && <button type="button" className="pay-empty-action" onClick={() => navigate('/users/vehicles')}>Browse vehicles <Icon name="arrow" size={15} /></button>}
          </div>
        )}
      </section>

      <aside className="pay-note">
        <span className="pay-note-icon"><Icon name="shield" size={20} /></span>
        <p><b>How payments are verified</b>Standard reservations are confirmed when payment is verified. Special rental periods are sent for administrator approval. If a payment stays pending, keep your transaction reference handy — you can copy it from the list above.</p>
      </aside>
    </div>
  )
}
