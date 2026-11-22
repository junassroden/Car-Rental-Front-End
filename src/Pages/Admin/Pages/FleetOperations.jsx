import { useEffect, useMemo, useState } from 'react'
import { imageUrl } from '../../../Services/API/api.js'
import { getReservations, updateVehicleUse } from '../../../Services/API/reservationAPI.js'
import { getAllVehicles } from '../../../Services/API/vehicleAPI.js'
import CarSilhouette from '../../Users/Components/CarSilhouette.jsx'
import './FleetOperations.css'

const DAY_MS = 86400000
const UPCOMING_DAYS = 7
const SKELETON_TILES = [1, 2, 3, 4]
const FLEET_FILTERS = [
  { value: '', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'rented', label: 'Rented' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'unavailable', label: 'Unavailable' },
]
const ACTION_LABELS = { checkout: 'Check out', return: 'Record return' }

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

function formatDay(day) {
  return new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00`))
}

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function customerName(item) {
  return item.full_name || item.username || `Customer #${item.user_id}`
}

function isPaidUp(item) {
  return Number(item.payment_required) !== 1 || item.payment_status === 'paid'
}

function vehicleLabel(item) {
  return `${item.make} ${item.model}${item.variant_color ? ` · ${item.variant_color}` : ''}`
}

/** What can be done with a pickup right now, using the same rules the backend enforces at checkout. */
function pickupState(item, car, today) {
  const start = dateOnly(item.start_date)
  const end = dateOnly(item.end_date)
  if (item.status === 'pending') return { note: 'Awaiting payment', link: { label: 'View', href: '/admin/reservations?status=pending' } }
  if (end <= today) return { note: 'Pickup window has passed', tone: 'bad', link: { label: 'Review', href: '/admin/reservations?status=confirmed' } }
  if (item.payment_status === 'pending') return { note: 'Payment being verified', link: { label: 'Verify payment', href: '/admin/payments' } }
  if (!isPaidUp(item)) return { note: 'Not paid yet', tone: 'wait', hint: 'Check-out opens after payment' }
  if (start > today) return { note: 'Paid', tone: 'good', hint: `Check-out opens ${formatDay(start)}` }
  if (car && car.status !== 'available') return { note: `Vehicle is marked ${car.status}` }
  return { note: 'Paid', tone: 'good', action: 'checkout' }
}

/** Sorts everything awaiting a handover into what is late, what is due today, and what is coming up. */
function buildHandovers(reservations, carsById, today) {
  const lastDay = addDays(today, UPCOMING_DAYS)
  const rows = []
  for (const item of reservations) {
    const start = dateOnly(item.start_date)
    const end = dateOnly(item.end_date)
    const car = carsById.get(Number(item.car_id))
    const checkedOut = Boolean(item.checked_out_at) && !item.returned_at
    // A colour can have several units, so the listing's plate may not be the one handed over.
    const plate = item.variant_color ? '' : car?.plate_number || item.plate_number || ''

    if (item.status === 'confirmed' && checkedOut && end <= lastDay) {
      rows.push({
        key: `${item.id}-return`,
        type: 'Return',
        day: end,
        group: end < today ? 'late' : end === today ? 'today' : 'upcoming',
        item,
        plate,
        note: end < today ? `${plural(Math.round((Date.parse(today) - Date.parse(end)) / DAY_MS), 'day')} late` : 'With customer',
        tone: end < today ? 'bad' : undefined,
        action: 'return',
      })
    }
    if (['pending', 'confirmed'].includes(item.status) && !item.checked_out_at && start <= lastDay) {
      const state = pickupState(item, car, today)
      rows.push({
        key: `${item.id}-pickup`,
        type: 'Pickup',
        day: start,
        group: start < today ? 'late' : start === today ? 'today' : 'upcoming',
        item,
        plate,
        ...state,
      })
    }
  }
  return rows.sort((left, right) => left.day.localeCompare(right.day) || left.type.localeCompare(right.type))
}

/** Who has this vehicle, or who gets it next. */
function vehicleUse(car, reservations, today) {
  const own = reservations.filter((item) => Number(item.car_id) === Number(car.id))
  const current = own.find((item) => item.status === 'confirmed' && item.checked_out_at && !item.returned_at)
  if (current) {
    const end = dateOnly(current.end_date)
    return { text: `With ${customerName(current)}`, detail: `${end < today ? 'Was due back' : 'Due back'} ${formatDay(end)}`, tone: end < today ? 'bad' : undefined }
  }
  const next = own
    .filter((item) => ['pending', 'confirmed'].includes(item.status) && !item.checked_out_at && dateOnly(item.end_date) > today)
    .sort((left, right) => dateOnly(left.start_date).localeCompare(dateOnly(right.start_date)))[0]
  if (car.status === 'rented') return { text: 'Marked rented', detail: 'No rental on record', tone: 'bad' }
  if (!next) return { text: 'No upcoming bookings' }
  const start = dateOnly(next.start_date)
  return start < today
    ? { text: `Waiting: ${customerName(next)}`, detail: `Pickup was due ${formatDay(start)}`, tone: 'bad' }
    : { text: `Next: ${customerName(next)}`, detail: `Pickup ${formatDay(start)}` }
}

function carPhoto(car) {
  const path = car.primary_image || car.images?.[0]?.image_path
  return path ? imageUrl(path) : ''
}

function relativeDay(day, today) {
  const days = Math.round((Date.parse(day) - Date.parse(today)) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  return days > 0 ? `In ${days} days` : `${-days} days ago`
}

function rentalPeriod(item) {
  const start = dateOnly(item.start_date)
  const end = dateOnly(item.end_date)
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS)
  const short = (day) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(new Date(`${day}T00:00:00`))
  return `${short(start)} to ${short(end)}, ${plural(days, 'day')}`
}

function DateTile({ day, group }) {
  const date = new Date(`${day}T00:00:00`)
  return (
    <span className={`fo-date fo-date-${group}`} aria-hidden="true">
      <small>{new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(date)}</small>
      <b>{date.getDate()}</b>
    </span>
  )
}

function HandoverRow({ row, today, confirming, busy, onAsk, onCancel, onConfirm, navigate }) {
  const { item, type, day, group, note, tone, action, link, hint, plate } = row
  return (
    <li className="fo-row">
      <DateTile day={day} group={group} />
      <span className="fo-row-main">
        <b>{vehicleLabel(item)}</b>
        <small>{customerName(item)}{plate ? ` · Plate ${plate}` : ''}</small>
      </span>
      <span className="fo-when">
        <b><span className={`fo-type fo-type-${type.toLowerCase()}`}>{type}</span>{relativeDay(day, today)}</b>
        <small>{rentalPeriod(item)}</small>
      </span>
      <span className={`fo-note${tone ? ` fo-note-${tone}` : ''}`}><i aria-hidden="true" />{note}</span>
      <span className="fo-row-action">
        {confirming ? (
          <>
            <button type="button" className="fo-link" disabled={busy} onClick={onCancel}>Cancel</button>
            <button type="button" className="fo-btn fo-btn-primary" disabled={busy} onClick={onConfirm}>{busy ? 'Saving…' : `Confirm ${ACTION_LABELS[action].toLowerCase()}`}</button>
          </>
        ) : action ? (
          <button type="button" className="fo-btn fo-btn-outline" onClick={onAsk} aria-label={`${ACTION_LABELS[action]}: ${vehicleLabel(item)}, ${customerName(item)}`}>{ACTION_LABELS[action]}</button>
        ) : link ? (
          <button type="button" className="fo-link" onClick={() => navigate(link.href)}>{link.label}</button>
        ) : hint ? (
          <span className="fo-hint">{hint}</span>
        ) : null}
      </span>
    </li>
  )
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading fleet operations">
      <div className="fo-tiles" aria-hidden="true">
        {SKELETON_TILES.map((key) => <div className="fo-card fo-tile" key={key}><span className="fo-shimmer fo-line-short" /><span className="fo-shimmer fo-line-value" /></div>)}
      </div>
      <div className="fo-card fo-panel" aria-hidden="true"><span className="fo-shimmer fo-line-short" /><span className="fo-shimmer fo-line-block" /></div>
    </div>
  )
}

export default function FleetOperations({ navigate }) {
  const [cars, setCars] = useState([])
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [filter, setFilter] = useState('')
  const [confirmKey, setConfirmKey] = useState(null)
  const [busyKey, setBusyKey] = useState(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const today = useMemo(() => localToday(), [])

  useEffect(() => {
    let active = true
    Promise.all([getAllVehicles(), getReservations()])
      .then(([vehicles, bookings]) => {
        if (!active) return
        setCars(vehicles)
        setReservations(bookings)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt])

  const carsById = useMemo(() => new Map(cars.map((car) => [Number(car.id), car])), [cars])
  const handovers = useMemo(() => buildHandovers(reservations, carsById, today), [carsById, reservations, today])
  const late = handovers.filter((row) => row.group === 'late')
  const dueToday = handovers.filter((row) => row.group === 'today')
  const upcoming = handovers.filter((row) => row.group === 'upcoming')
  const groups = [
    { key: 'late', title: 'Late', rows: late, urgent: true },
    { key: 'today', title: `Today · ${formatDay(today)}`, rows: dueToday },
    { key: 'upcoming', title: `Next ${UPCOMING_DAYS} days`, rows: upcoming },
  ].filter((group) => group.rows.length)
  const pickupCount = handovers.filter((row) => row.type === 'Pickup').length
  const returnCount = handovers.filter((row) => row.type === 'Return').length

  const outNow = reservations.filter((item) => item.status === 'confirmed' && item.checked_out_at && !item.returned_at).length
  const pickupsToday = dueToday.filter((row) => row.type === 'Pickup').length
  const returnsToday = dueToday.filter((row) => row.type === 'Return').length
  const visibleCars = filter ? cars.filter((car) => car.status === filter) : cars

  function askConfirm(key) {
    setConfirmKey(key)
    setNotice('')
    setActionError('')
  }

  async function confirmAction(row) {
    setBusyKey(row.key)
    setActionError('')
    try {
      await updateVehicleUse(row.item.id, row.action)
      setNotice(`${vehicleLabel(row.item)} ${row.action === 'checkout' ? `checked out to ${customerName(row.item)}` : `returned by ${customerName(row.item)}`}.`)
      setConfirmKey(null)
      setAttempt((value) => value + 1)
      window.dispatchEvent(new Event('reservations:changed'))
    } catch (requestError) {
      setActionError(requestError.message)
    } finally {
      setBusyKey(null)
    }
  }

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  const loadFailed = error && !cars.length && !reservations.length

  return (
    <div className="admin-content fo">
      <header className="fo-header">
        <div>
          <span className="fo-eyebrow">Daily handovers</span>
          <h1>Fleet operations</h1>
        </div>
        <div className="fo-header-actions">
          <button type="button" className="fo-btn fo-btn-outline" onClick={() => navigate('/admin/maintenance/records')}>Maintenance records</button>
          <button type="button" className="fo-btn fo-btn-primary" onClick={() => navigate('/admin/reservations')}>Manage reservations</button>
        </div>
      </header>

      {loading ? <PageSkeleton /> : loadFailed ? (
        <div className="fo-card fo-state" role="alert">
          <h2>We couldn't load fleet operations</h2>
          <p>{error}</p>
          <button type="button" className="fo-btn fo-btn-primary" onClick={retry}>Try again</button>
        </div>
      ) : (
        <>
          <dl className="fo-tiles">
            <div className={`fo-card fo-tile${late.length ? ' is-urgent' : ''}`}>
              <dt>Late</dt>
              <dd className="fo-value">{late.length}</dd>
              <dd className="fo-detail">{late.length ? 'Past their pickup or return date' : 'Nothing overdue'}</dd>
            </div>
            <div className="fo-card fo-tile">
              <dt>Pickups today</dt>
              <dd className="fo-value">{pickupsToday}</dd>
              <dd className="fo-detail">Due to leave today</dd>
            </div>
            <div className="fo-card fo-tile">
              <dt>Returns today</dt>
              <dd className="fo-value">{returnsToday}</dd>
              <dd className="fo-detail">Due back today</dd>
            </div>
            <div className="fo-card fo-tile">
              <dt>Out now</dt>
              <dd className="fo-value">{outNow}</dd>
              <dd className="fo-detail">With customers</dd>
            </div>
          </dl>

          {error && <p className="fo-banner fo-banner-bad" role="alert">{error}</p>}
          {notice && <p className="fo-banner fo-banner-good" role="status">{notice}</p>}
          {actionError && <p className="fo-banner fo-banner-bad" role="alert">{actionError}</p>}

          <section className="fo-card fo-panel" aria-labelledby="fo-handovers-title">
            <div className="fo-panel-head fo-handovers-head">
              <h2 id="fo-handovers-title">Handovers</h2>
              {groups.length > 0 && <p>{plural(pickupCount, 'pickup')} · {plural(returnCount, 'return')}</p>}
            </div>
            {groups.length ? groups.map((group) => (
              <div className="fo-group" key={group.key}>
                <h3 className={group.urgent ? 'is-urgent' : undefined}>{group.title}</h3>
                <ul>
                  {group.rows.map((row) => (
                    <HandoverRow
                      key={row.key}
                      row={row}
                      today={today}
                      confirming={confirmKey === row.key}
                      busy={busyKey === row.key}
                      onAsk={() => askConfirm(row.key)}
                      onCancel={() => setConfirmKey(null)}
                      onConfirm={() => confirmAction(row)}
                      navigate={navigate}
                    />
                  ))}
                </ul>
              </div>
            )) : <p className="fo-empty">No pickups or returns due in the next {UPCOMING_DAYS} days.</p>}
          </section>

          <section className="fo-card fo-panel" aria-labelledby="fo-fleet-title">
            <div className="fo-panel-head">
              <h2 id="fo-fleet-title">Vehicle status</h2>
              <div className="fo-chips" role="group" aria-label="Filter by vehicle status">
                {FLEET_FILTERS.map((item) => {
                  const count = item.value ? cars.filter((car) => car.status === item.value).length : cars.length
                  return <button key={item.label} type="button" className={filter === item.value ? 'selected' : undefined} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label} <span>{count}</span></button>
                })}
              </div>
            </div>
            {visibleCars.length ? (
              <table className="fo-table">
                <thead>
                  <tr>
                    <th scope="col">Vehicle</th>
                    <th scope="col">Plate</th>
                    <th scope="col">Daily rate</th>
                    <th scope="col">Status</th>
                    <th scope="col">Now and next</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCars.map((car) => {
                    const use = vehicleUse(car, reservations, today)
                    const photo = carPhoto(car)
                    return (
                      <tr key={car.id}>
                        <td className="fo-vehicle">
                          <button type="button" className="fo-vehicle-link" onClick={() => navigate(`/admin/vehicles/${car.id}`)}>
                            <span className="fo-thumb">
                              <span className="fo-thumb-empty"><CarSilhouette category={car.category} /></span>
                              {photo && <img src={photo} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />}
                            </span>
                            <span className="fo-name">
                              <b>{car.make} {car.model}</b>
                              <small>{[car.year, car.category].filter(Boolean).join(' · ')}</small>
                            </span>
                          </button>
                        </td>
                        <td data-label="Plate">{car.plate_number || <span className="fo-none">Not set</span>}</td>
                        <td data-label="Daily rate" className="fo-rate">{money(car.daily_rental_price)}</td>
                        <td data-label="Status"><span className={`fo-status fo-status-${car.status}`}><i aria-hidden="true" />{car.status}</span></td>
                        <td data-label="Now and next" className="fo-use">
                          <span className={use.tone === 'bad' ? 'fo-note-bad' : undefined}>{use.text}</span>
                          {use.detail && <small>{use.detail}</small>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p className="fo-empty">{cars.length ? 'No vehicles have this status.' : 'No vehicles in the fleet yet.'}</p>}
          </section>
        </>
      )}
    </div>
  )
}
