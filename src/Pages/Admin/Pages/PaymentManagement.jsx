import { useEffect, useMemo, useState } from 'react'
import { getPaymentsNeedingReview, getReservations } from '../../../Services/API/reservationAPI.js'
import './PaymentManagement.css'

// Payments are verified by the gateway webhook. Special rental periods still need approval,
// so this page monitors payment records without changing reservation status.
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending', failed: 'Failed' }
const RESERVATION_TONES = { pending: 'amber', awaiting_approval: 'amber', confirmed: 'blue', active: 'teal', ongoing: 'teal', completed: 'green', cancelled: 'red', rejected: 'red' }
const RESERVATION_LABELS = { pending: 'Pending payment', awaiting_approval: 'Awaiting approval' }
const FILTERS = [
  ['all', 'All payments'],
  ['paid', 'Paid'],
  ['pending', 'Pending'],
  ['failed', 'Failed'],
  ['refund', 'Refund needed'],
]

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value) {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : (value || '—')
}

function formatTime(value) {
  const date = parseDate(value)
  return date ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(date) : ''
}

function capitalize(value) {
  const text = String(value || '').replace(/[-_]+/g, ' ')
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '—'
}

const amountOf = (payment) => Number(payment.payment_amount ?? payment.total_amount ?? 0)
const dateOf = (payment) => (payment.payment_status === 'paid' ? payment.payment_paid_at : payment.payment_created_at)
// A verified payment on a reservation that was later cancelled or rejected still has to be returned.
const needsRefund = (payment) => payment.payment_status === 'paid' && ['cancelled', 'rejected'].includes(payment.status)

function Icon({ name, size = 18 }) {
  const shapes = {
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18m-5 5h2" /><path d="M6 5V3h12v2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
    refund: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 8v8m-2.5-2.5c0 1 1 1.5 2.5 1.5s2.5-.6 2.5-1.6c0-2.2-5-1.2-5-3.4 0-.9 1-1.5 2.5-1.5s2.4.5 2.5 1.4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
    copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M11 18h2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

function CopyReference({ value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <span className="pmt-muted">No reference</span>
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <button type="button" className={`pmt-ref${copied ? ' is-copied' : ''}`} onClick={copy} title={value} aria-label={copied ? 'Reference copied' : `Copy transaction reference ${value}`}>
      <code>{value}</code>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
    </button>
  )
}

function Method({ value }) {
  if (!value) return <span className="pmt-muted">—</span>
  const online = /xendit|online|card/i.test(value)
  return <span className="pmt-method"><Icon name={online ? 'card' : 'phone'} size={14} />{value}</span>
}

export default function PaymentManagement() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  // Paid attempts an administrator must act on: paid after the reservation was cancelled or expired, or duplicates.
  const [review, setReview] = useState([])

  useEffect(() => {
    let active = true
    Promise.all([getReservations(), getPaymentsNeedingReview()])
      .then(([results, flagged]) => {
        // Each reservation shows its latest payment attempt. Newest first.
        if (!active) return
        const withPayments = results.filter((item) => item.payment_id)
        withPayments.sort((a, b) => (parseDate(dateOf(b))?.getTime() || 0) - (parseDate(dateOf(a))?.getTime() || 0))
        setPayments(withPayments)
        setReview(flagged || [])
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const summary = useMemo(() => {
    const counts = { all: payments.length, paid: 0, pending: 0, failed: 0, refund: 0 }
    let received = 0
    let pendingAmount = 0
    let refundAmount = 0
    payments.forEach((payment) => {
      if (payment.payment_status in counts) counts[payment.payment_status] += 1
      if (payment.payment_status === 'paid') received += amountOf(payment)
      if (payment.payment_status === 'pending') pendingAmount += amountOf(payment)
      if (needsRefund(payment)) { counts.refund += 1; refundAmount += amountOf(payment) }
    })
    return { counts, received, pendingAmount, refundAmount }
  }, [payments])

  const term = search.trim().toLowerCase()
  const visible = payments.filter((payment) => (
    (statusFilter === 'all' || (statusFilter === 'refund' ? needsRefund(payment) : payment.payment_status === statusFilter))
    && (!term || [payment.payment_reference, payment.id, payment.full_name, payment.username, payment.email, payment.make, payment.model, payment.plate_number]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  ))
  const visibleReceived = visible.filter((payment) => payment.payment_status === 'paid').reduce((total, payment) => total + amountOf(payment), 0)

  return (
    <div className="admin-content pmt-page">
      <header className="pmt-header">
        <span className="pmt-eyebrow">FINANCE</span>
        <h1>Payment History</h1>
      </header>

      <section className="pmt-stats" aria-label="Payment summary">
        <article className="pmt-stat pmt-stat--feature">
          <span className="pmt-stat-icon"><Icon name="wallet" size={20} /></span>
          <span className="pmt-stat-label">Total received</span>
          <strong>{loading ? '—' : money(summary.received)}</strong>
          <small>{summary.counts.paid} verified payment{summary.counts.paid === 1 ? '' : 's'}</small>
        </article>
        <article className="pmt-stat">
          <span className="pmt-stat-icon is-amber"><Icon name="clock" size={19} /></span>
          <span className="pmt-stat-label">Pending</span>
          <strong>{loading ? '—' : summary.counts.pending}</strong>
          <small>{summary.counts.pending ? `${money(summary.pendingAmount)} awaiting the provider` : 'Nothing waiting'}</small>
        </article>
        <article className="pmt-stat">
          <span className="pmt-stat-icon is-red"><Icon name="alert" size={19} /></span>
          <span className="pmt-stat-label">Failed</span>
          <strong>{loading ? '—' : summary.counts.failed}</strong>
          <small>{summary.counts.failed ? 'Checkout did not complete' : 'No failed attempts'}</small>
        </article>
        <button type="button" className={`pmt-stat pmt-stat--action${summary.counts.refund ? ' has-alert' : ''}`} onClick={() => setStatusFilter('refund')} disabled={!summary.counts.refund}>
          <span className="pmt-stat-icon is-red"><Icon name="refund" size={19} /></span>
          <span className="pmt-stat-label">Refunds needed</span>
          <strong>{loading ? '—' : summary.counts.refund}</strong>
          <small>{summary.counts.refund ? `${money(summary.refundAmount)} · paid, then cancelled` : 'All clear'}</small>
        </button>
      </section>

      <section className="pmt-panel" aria-labelledby="pmt-list-title">
        <div className="pmt-toolbar">
          <h2 id="pmt-list-title" className="pmt-sr">Transactions</h2>
          <div className="pmt-tabs" role="tablist" aria-label="Filter by payment status">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={statusFilter === value} className={`${statusFilter === value ? 'active' : ''}${value === 'refund' && summary.counts.refund ? ' is-alert' : ''}`} onClick={() => setStatusFilter(value)}>
                {label}<span>{summary.counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="pmt-search">
            <Icon name="search" size={17} />
            <span className="pmt-sr">Search payments</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Transaction, customer or vehicle" />
          </label>
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}
        {review.length > 0 && (
          <div className="review-queue" role="alert">
            <h2>{review.length} payment{review.length === 1 ? '' : 's'} need{review.length === 1 ? 's' : ''} review</h2>
            <p>Money was received for a reservation that can no longer use it. Contact the customer to refund or rebook.</p>
            <ul>{review.map((item) => (
              <li key={item.id}>
                <b>{money(item.paid_amount ?? item.amount)}</b> from {item.full_name} for reservation #{item.reservation_id} ({item.reservation_status}), paid {formatDate(item.paid_at)} {formatTime(item.paid_at)}.
                <small>{item.review_reason} Reference: {item.reference_number}</small>
              </li>
            ))}</ul>
          </div>
        )}
        {loading ? (
          <div className="pmt-loading" aria-busy="true" aria-label="Loading payment records">
            {[0, 1, 2, 3].map((key) => <span key={key} />)}
          </div>
        ) : visible.length ? (
          <>
            <div className="pmt-table-wrap">
              <table className="pmt-table">
                <thead>
                  <tr><th>Transaction</th><th>Customer</th><th>Reservation</th><th>Vehicle</th><th>Method</th><th>Date</th><th className="is-num">Amount</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {visible.map((payment) => {
                    const refund = needsRefund(payment)
                    const name = payment.full_name || payment.username || 'Customer'
                    return (
                      <tr key={payment.payment_id} className={refund ? 'is-refund' : ''}>
                        <td><CopyReference value={payment.payment_reference} /></td>
                        <td>
                          <div className="pmt-customer">
                            <span className="pmt-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                            <div><b>{name}</b><small>{payment.email}</small></div>
                          </div>
                        </td>
                        <td>
                          <b>#{payment.id}</b>
                          <span className={`pmt-tag tone-${RESERVATION_TONES[payment.status] || 'grey'}`}>{RESERVATION_LABELS[payment.status] || capitalize(payment.status)}</span>
                        </td>
                        <td><b>{payment.make} {payment.model}</b>{payment.plate_number && <small className="pmt-plate">{payment.plate_number}</small>}</td>
                        <td><Method value={payment.payment_method} /></td>
                        <td><b>{formatDate(dateOf(payment))}</b><small>{payment.payment_status === 'paid' ? 'Paid' : 'Started'} {formatTime(dateOf(payment))}</small></td>
                        <td className="is-num"><b className="pmt-amount">{money(amountOf(payment))}</b></td>
                        <td>
                          <span className={`pmt-status is-${payment.payment_status}`}><i />{PAYMENT_LABELS[payment.payment_status] || capitalize(payment.payment_status)}</span>
                          {refund && <small className="pmt-refund"><Icon name="refund" size={13} /> Reservation {payment.status}: refund needed</small>}
                          {payment.payment_review_reason && <small className="pmt-refund">Needs review</small>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <footer className="pmt-foot">
              <span>Showing <b>{visible.length}</b> of {payments.length} payment{payments.length === 1 ? '' : 's'}</span>
              <span>Received in this view <b>{money(visibleReceived)}</b></span>
            </footer>
          </>
        ) : !error && (
          <div className="pmt-empty" role="status">
            <span className="pmt-stat-icon"><Icon name="card" size={22} /></span>
            <h3>{payments.length ? 'No payments match these filters' : 'No payment records yet'}</h3>
            <p>{payments.length ? 'Change the status or search to see more.' : 'Payments appear here as soon as a customer starts checkout.'}</p>
            {payments.length > 0 && <button type="button" onClick={() => { setStatusFilter('all'); setSearch('') }}>Clear filters</button>}
          </div>
        )}
      </section>
    </div>
  )
}
