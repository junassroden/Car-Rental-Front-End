import { useEffect, useRef, useState } from 'react'
import { api } from '../../../Services/API/api.js'
import './DemandIntelligence.css'

/*
 * Demand Intelligence: rental demand from the reservations only (GET /api/reservations/demand, the same summary the
 * assistant's demand.summary retrieval uses). History is shown as recorded; a forecast appears only once there are
 * enough months of bookings, and it says what it is based on. Colours are the dashboard's validated pair
 * (DashboardCharts.jsx): green #2b8a63 for recorded demand, amber #e0913a for days already booked ahead.
 */
const COLORS = { past: '#2e8350', ahead: '#e0913a', grid: '#ebebe7', axis: '#8f918a', ink: '#161816' }
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const monthLabel = (month) => new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const longMonth = (month) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value || 0))
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useBarChart(canvasRef, config, deps) {
  useEffect(() => {
    let chart
    let cancelled = false
    import('chart.js').then(({ Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip }) => {
      if (cancelled || !canvasRef.current) return
      Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)
      Chart.defaults.font.family = "'Geist', 'Segoe UI', system-ui, sans-serif"
      Chart.defaults.color = COLORS.axis
      chart = new Chart(canvasRef.current, config())
    })
    return () => {
      cancelled = true
      chart?.destroy()
    }
    // The data dependencies decide when to redraw; config is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function barOptions(title) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reducedMotion() ? false : { duration: 500 },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: COLORS.ink, padding: 10, callbacks: { title: (items) => `${title} ${items[0]?.label || ''}` } } },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
      y: { stacked: true, beginAtZero: true, grid: { color: COLORS.grid }, ticks: { precision: 0 } },
    },
  }
}

const BAR = { borderColor: '#ffffff', borderWidth: { top: 2 }, borderSkipped: 'start', borderRadius: 4, maxBarThickness: 34, categoryPercentage: 0.7 }

function MonthlyChart({ months }) {
  const canvasRef = useRef(null)
  const [showTable, setShowTable] = useState(false)
  useBarChart(canvasRef, () => ({
    type: 'bar',
    data: {
      labels: months.map((m) => monthLabel(m.month)),
      datasets: [
        { label: 'Booked days', data: months.map((m) => (m.future ? 0 : m.booked_days)), backgroundColor: COLORS.past, ...BAR },
        { label: 'Already booked ahead', data: months.map((m) => (m.future ? m.booked_days : 0)), backgroundColor: COLORS.ahead, ...BAR },
      ],
    },
    options: barOptions(''),
  }), [months])

  return (
    <section className="maintenance-panel di-panel">
      <div className="di-panel-head">
        <div>
          <span className="eyebrow">BY MONTH</span>
          <h2>Booked days per month</h2>
          <p>Days with a pending, confirmed or completed rental. Coming months show only what is already booked.</p>
        </div>
        <button type="button" className="button button-outline button-compact" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <ul className="di-legend">
        <li><i style={{ background: COLORS.past }} aria-hidden="true" />Booked days</li>
        <li><i style={{ background: COLORS.ahead }} aria-hidden="true" />Already booked ahead</li>
      </ul>
      {showTable ? (
        <div className="di-table-wrap">
          <table className="reservation-table">
            <thead><tr><th>Month</th><th>Booked days</th><th>Bookings</th><th>Booked value</th><th>Cancelled</th><th>Expired</th></tr></thead>
            <tbody>{months.map((m) => (
              <tr key={m.month}>
                <td>{longMonth(m.month)}{m.future && <small>booked ahead so far</small>}</td>
                <td>{m.booked_days}</td><td>{m.bookings}</td><td>{money(m.booked_value)}</td><td>{m.cancelled}</td><td>{m.expired}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="di-chart"><canvas ref={canvasRef} role="img" aria-label="Booked days per month" /></div>}
    </section>
  )
}

function WeekdayChart({ counts }) {
  const canvasRef = useRef(null)
  const values = WEEKDAYS.map((day) => counts[day] || 0)
  useBarChart(canvasRef, () => ({
    type: 'bar',
    data: { labels: WEEKDAYS.map((d) => d.slice(0, 3)), datasets: [{ label: 'Pickups', data: values, backgroundColor: COLORS.past, ...BAR }] },
    options: barOptions('Pickups on'),
  }), [values.join(',')])
  const busiest = Math.max(...values) > 0 ? WEEKDAYS[values.indexOf(Math.max(...values))] : null
  return (
    <section className="maintenance-panel di-panel">
      <span className="eyebrow">BY WEEKDAY</span>
      <h2>Pickups per weekday</h2>
      <p>{busiest ? `${busiest} has the most pickups.` : 'No pickups recorded yet.'}</p>
      <div className="di-chart di-chart-small"><canvas ref={canvasRef} role="img" aria-label="Pickups per weekday" /></div>
    </section>
  )
}

function Tile({ label, value, note }) {
  return <div className="di-tile"><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>
}

export default function DemandPricingIntelligence() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [months, setMonths] = useState(12)

  useEffect(() => {
    let active = true
    api.get(`/api/reservations/demand?months=${months}`)
      .then((response) => { if (active) { setData(response?.data || null); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [months])

  const header = (
    <header className="maintenance-page-heading di-heading">
      <div>
        <span className="eyebrow">FLEET INTELLIGENCE</span>
        <h1>Demand Intelligence</h1>
        <p>Rental demand from your reservations: what was booked, when, and what is already booked ahead.</p>
      </div>
      <label className="form-field di-window">
        <span>History</span>
        <select value={months} onChange={(event) => { setData(null); setMonths(Number(event.target.value)) }}>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
          <option value={24}>Last 24 months</option>
        </select>
      </label>
    </header>
  )

  if (error) return <div className="admin-content maintenance-page">{header}<div className="global-error" role="alert">{error}</div></div>
  if (!data) return <div className="admin-content maintenance-page">{header}<div className="loading-state"><span className="spinner" />Loading demand…</div></div>

  const books = data.on_the_books || {}
  const hasBookings = data.by_month.some((m) => m.bookings || m.booked_days)
  return (
    <div className="admin-content maintenance-page">
      {header}
      <div className="di-tiles">
        <Tile label="Booked, next 30 days" value={`${books.next_30_days || 0} days`} note={`${books.next_60_days || 0} in 60 days, ${books.next_90_days || 0} in 90`} />
        <Tile label="Booked ahead (median)" value={data.lead_time_days ? `${data.lead_time_days.median} days` : '—'} note={data.lead_time_days ? `from ${data.lead_time_days.bookings} bookings` : 'no booking dates yet'} />
        <Tile label="Cancellation rate" value={data.cancellation_rate_percent == null ? '—' : `${data.cancellation_rate_percent}%`} note={data.expiry_rate_percent == null ? '' : `${data.expiry_rate_percent}% expired unpaid`} />
        <Tile label="Booking history" value={`${data.history_months} month${data.history_months === 1 ? '' : 's'}`} note={`fleet of ${data.fleet_size} vehicles`} />
      </div>

      {!hasBookings && (
        <div className="maintenance-empty" role="status">
          <h3>No bookings in this period yet</h3>
          <p>The charts fill in as customers make reservations. Nothing here is estimated.</p>
        </div>
      )}

      <MonthlyChart months={data.by_month} />

      <section className="maintenance-panel di-panel">
        <span className="eyebrow">NEXT 3 MONTHS</span>
        <h2>Forecast</h2>
        {data.forecast ? (
          <>
            <p>Expected booked days, from {data.forecast[0].basis}. The range is the lowest and highest of those months.</p>
            <div className="di-table-wrap">
              <table className="reservation-table">
                <thead><tr><th>Month</th><th>Expected booked days</th><th>Range</th><th>Already booked</th></tr></thead>
                <tbody>{data.forecast.map((f) => (
                  <tr key={f.month}><td>{longMonth(f.month)}</td><td>{f.expected_booked_days}</td><td>{f.low}–{f.high}</td><td>{f.already_booked}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="maintenance-empty" role="status">
            <h3>Not enough history for a forecast yet</h3>
            <p>A forecast needs at least {data.forecast_min_months} months of bookings; there {data.history_months === 1 ? 'is' : 'are'} {data.history_months} so far.
              Until then, use the days already booked ahead above.</p>
          </div>
        )}
      </section>

      <div className="di-grid">
        <WeekdayChart counts={data.pickups_by_weekday || {}} />
        <section className="maintenance-panel di-panel">
          <span className="eyebrow">BY CATEGORY</span>
          <h2>Utilisation, last 90 days</h2>
          <p>Booked days ÷ (vehicles × 90 days).</p>
          <div className="di-table-wrap">
            <table className="reservation-table">
              <thead><tr><th>Category</th><th>Vehicles</th><th>Booked days</th><th>Utilisation</th></tr></thead>
              <tbody>{(data.by_category || []).map((c) => (
                <tr key={c.category}><td>{c.category}</td><td>{c.vehicles}</td><td>{c.booked_days_last_90}</td><td>{c.utilization_percent == null ? '—' : `${c.utilization_percent}%`}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
