import { useEffect, useMemo, useRef, useState } from 'react'

/*
 * Two Chart.js charts for the admin dashboard, built only from data the dashboard already loads.
 * Colours were checked with the data-viz palette validator (light surface #ffffff):
 * green #2b8a63 and amber #e0913a pass lightness, chroma, colour-blind (ΔE 11.0) and normal-vision
 * (ΔE 24.1) checks. Amber is below 3:1 against white, so each chart has a legend and a table view.
 */
const COLORS = {
  paid: '#2e8350',
  unpaid: '#e0913a',
  booked: '#2e8350',
  surface: '#ffffff',
  grid: '#ebebe7',
  axis: '#8f918a',
  ink: '#161816',
}
const DAY_MS = 86400000
const WEEKS = 8
const FORECAST_DAYS = 14
const COUNTED = ['pending', 'awaiting_approval', 'confirmed', 'completed']

const dateOnly = (value) => String(value || '').slice(0, 10)
const addDays = (day, count) => new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10)
const label = (day, options = { month: 'short', day: 'numeric' }) => new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', ...options }).format(new Date(`${day}T00:00:00Z`))
const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value || 0))
const compactMoney = (value) => `₱${new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0))}`

/** Monday of the week containing an ISO day. */
function weekStart(day) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

/** Booking value per booking week (created date), split into paid and not yet paid. Same reservations as the Booking value tile. */
function weeklyValue(reservations, today) {
  const firstWeek = addDays(weekStart(today), -7 * (WEEKS - 1))
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({ start: addDays(firstWeek, index * 7), paid: 0, unpaid: 0, count: 0 }))
  reservations.forEach((item) => {
    if (!COUNTED.includes(String(item.status || '').toLowerCase())) return
    const booked = dateOnly(item.created_at || item.start_date)
    if (!booked || booked < firstWeek) return
    const week = weeks.find((entry) => entry.start === weekStart(booked))
    if (!week) return
    const amount = Number(item.total_amount || 0)
    if (item.payment_status === 'paid') week.paid += amount
    else week.unpaid += amount
    week.count += 1
  })
  return weeks
}

/** Confirmed reservations holding a vehicle on each of the next days (pickup day up to, not including, the return day). */
function dailyBooked(reservations, today) {
  return Array.from({ length: FORECAST_DAYS }, (_, index) => {
    const day = addDays(today, index)
    const count = reservations.filter((item) => (
      String(item.status || '').toLowerCase() === 'confirmed'
      && !item.returned_at
      && dateOnly(item.start_date) <= day
      && dateOnly(item.end_date) > day
    )).length
    return { day, count }
  })
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const tooltipStyle = {
  backgroundColor: '#161816',
  titleColor: '#ffffff',
  bodyColor: '#ebebe7',
  footerColor: '#ffffff',
  padding: 12,
  cornerRadius: 10,
  boxPadding: 5,
  usePointStyle: true,
  titleFont: { weight: '600', size: 13 },
  bodyFont: { size: 12.5 },
  footerFont: { weight: '600', size: 12.5 },
}

function useChart(canvasRef, buildConfig, deps) {
  useEffect(() => {
    let chart
    let cancelled = false
    // Chart.js is loaded only when the dashboard needs it.
    import('chart.js').then(({ Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip }) => {
      if (cancelled || !canvasRef.current) return
      Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)
      Chart.defaults.font.family = "'Geist', 'Segoe UI', system-ui, sans-serif"
      Chart.defaults.color = COLORS.axis
      chart = new Chart(canvasRef.current, buildConfig())
    })
    return () => {
      cancelled = true
      chart?.destroy()
    }
    // buildConfig is rebuilt each render; the data dependencies decide when to redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function Legend({ items }) {
  return (
    <ul className="ad-legend">
      {items.map((item) => <li key={item.label}><i style={{ background: item.color }} aria-hidden="true" />{item.label}</li>)}
    </ul>
  )
}

function BookingValueChart({ reservations, today }) {
  const canvasRef = useRef(null)
  const weeks = useMemo(() => weeklyValue(reservations, today), [reservations, today])
  const total = weeks.reduce((sum, week) => sum + week.paid + week.unpaid, 0)
  const thisWeek = weeks[weeks.length - 1]
  const labels = weeks.map((week) => label(week.start))

  useChart(canvasRef, () => ({
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Paid', data: weeks.map((week) => week.paid), backgroundColor: COLORS.paid },
        { label: 'Not paid yet', data: weeks.map((week) => week.unpaid), backgroundColor: COLORS.unpaid },
      ].map((dataset) => ({
        ...dataset,
        // A 2px surface-coloured edge separates stacked segments; rounded ends only on the outer edge.
        borderColor: COLORS.surface,
        borderWidth: { top: 2 },
        borderSkipped: 'start',
        borderRadius: 4,
        maxBarThickness: 34,
        categoryPercentage: 0.7,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { font: { size: 11.5 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 10 } },
        y: {
          stacked: true,
          beginAtZero: true,
          border: { display: false },
          grid: { color: COLORS.grid },
          ticks: { font: { size: 11.5 }, maxTicksLimit: 5, callback: (value) => compactMoney(value) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle,
          callbacks: {
            title: (items) => `Week of ${label(weeks[items[0].dataIndex].start, { month: 'short', day: 'numeric', year: 'numeric' })}`,
            label: (item) => ` ${item.dataset.label}: ${money(item.raw)}`,
            footer: (items) => {
              const week = weeks[items[0].dataIndex]
              return `Total ${money(week.paid + week.unpaid)} · ${week.count} booking${week.count === 1 ? '' : 's'}`
            },
          },
        },
      },
    },
  }), [weeks])

  return (
    <section className="ad-card ad-chart" aria-labelledby="ad-chart-value-title">
      <div className="ad-chart-head">
        <div>
          <h2 id="ad-chart-value-title">Booking value by week</h2>
          <p>Last {WEEKS} weeks, by the date each booking was made</p>
        </div>
        <div className="ad-chart-figure">
          <strong>{money(total)}</strong>
          <small>{money(thisWeek.paid + thisWeek.unpaid)} this week</small>
        </div>
      </div>
      <Legend items={[{ label: 'Paid', color: COLORS.paid }, { label: 'Not paid yet', color: COLORS.unpaid }]} />
      <div className="ad-chart-canvas">
        <canvas ref={canvasRef} role="img" aria-label={`Stacked bar chart of booking value for the last ${WEEKS} weeks. Total ${money(total)}.`} />
      </div>
      <details className="ad-chart-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Week of</th><th>Paid</th><th>Not paid yet</th><th>Bookings</th></tr></thead>
          <tbody>{weeks.map((week) => <tr key={week.start}><td>{label(week.start, { month: 'short', day: 'numeric', year: 'numeric' })}</td><td>{money(week.paid)}</td><td>{money(week.unpaid)}</td><td>{week.count}</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  )
}

function UtilisationChart({ reservations, today, fleetTotal }) {
  const canvasRef = useRef(null)
  const days = useMemo(() => dailyBooked(reservations, today), [reservations, today])
  const peak = days.reduce((best, entry) => (entry.count > best.count ? entry : best), days[0])
  const average = days.reduce((sum, entry) => sum + entry.count, 0) / days.length
  const share = (count) => (fleetTotal ? Math.round((count / fleetTotal) * 100) : 0)

  useChart(canvasRef, () => ({
    type: 'bar',
    data: {
      labels: days.map((entry, index) => (index === 0 ? 'Today' : label(entry.day, { weekday: 'short', day: 'numeric' }))),
      datasets: [{
        label: 'Vehicles booked',
        data: days.map((entry) => entry.count),
        backgroundColor: days.map((entry) => (entry.day === today ? COLORS.booked : `${COLORS.booked}b3`)),
        borderRadius: 4,
        borderSkipped: 'start',
        maxBarThickness: 22,
        categoryPercentage: 0.75,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 500 },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
        y: {
          beginAtZero: true,
          suggestedMax: Math.max(4, Math.ceil(peak.count * 1.25)),
          border: { display: false },
          grid: { color: COLORS.grid },
          ticks: { precision: 0, maxTicksLimit: 5, font: { size: 11.5 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle,
          displayColors: false,
          callbacks: {
            title: (items) => label(days[items[0].dataIndex].day, { weekday: 'long', month: 'short', day: 'numeric' }),
            label: (item) => `${item.raw} of ${fleetTotal} vehicles booked (${share(item.raw)}%)`,
          },
        },
      },
    },
  }), [days, fleetTotal])

  return (
    <section className="ad-card ad-chart" aria-labelledby="ad-chart-use-title">
      <div className="ad-chart-head">
        <div>
          <h2 id="ad-chart-use-title">Vehicles booked per day</h2>
          <p>Confirmed reservations, next {FORECAST_DAYS} days</p>
        </div>
        <div className="ad-chart-figure">
          <strong>{peak.count}<span> of {fleetTotal}</span></strong>
          <small>{peak.count ? `Busiest: ${label(peak.day, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'No bookings yet'}</small>
        </div>
      </div>
      <p className="ad-chart-note">Average {average.toFixed(1)} vehicles a day · {share(average)}% of the fleet</p>
      <div className="ad-chart-canvas">
        <canvas ref={canvasRef} role="img" aria-label={`Bar chart of vehicles booked for each of the next ${FORECAST_DAYS} days. Busiest day has ${peak.count} of ${fleetTotal} vehicles.`} />
      </div>
      <details className="ad-chart-table">
        <summary>View as table</summary>
        <table>
          <thead><tr><th>Day</th><th>Vehicles booked</th><th>Share of fleet</th></tr></thead>
          <tbody>{days.map((entry) => <tr key={entry.day}><td>{label(entry.day, { weekday: 'short', month: 'short', day: 'numeric' })}</td><td>{entry.count}</td><td>{share(entry.count)}%</td></tr>)}</tbody>
        </table>
      </details>
    </section>
  )
}

export default function DashboardCharts({ reservations, today, fleetTotal }) {
  const [ready, setReady] = useState(false)
  // Defer one frame so the canvases have their final size before Chart.js measures them.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])
  if (!ready) return <div className="ad-charts" aria-hidden="true" />
  return (
    <div className="ad-charts">
      <BookingValueChart reservations={reservations} today={today} />
      <UtilisationChart reservations={reservations} today={today} fleetTotal={fleetTotal} />
    </div>
  )
}
