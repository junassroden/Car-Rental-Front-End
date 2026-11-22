import { useMemo, useState } from 'react'
import { imageUrl } from '../../../../Services/API/api.js'
import { assessmentStatus, loadDraft, SCREENING } from './assessmentStatus.js'
import { formatDate, formatKm } from './status.js'

export function Chip({ tone, children, title }) {
  return <span className={`am-chip am-tone-${tone}`} title={title}>{children}</span>
}

const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.8-3.8',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  alert: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.01',
  left: 'M19 12H5M11 6l-6 6 6 6',
  right: 'M5 12h14M13 6l6 6-6 6',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  clipboard: 'M9 4h6v3H9zM9 5.5H6V20h12V5.5h-3M9 12h6M9 16h6',
  car: 'M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M5 11h14M8 13.5v.01M16 13.5v.01',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 5v4h4V5zM6 15v4h4v-4z',
  plus: 'M12 5v14M5 12h14',
  chevron: 'M9 6l6 6-6 6',
}

export function PmIcon({ name, size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICONS[name]} />
    </svg>
  )
}

function VehiclePanel({ vehicle, status, onOpen }) {
  const screening = SCREENING[vehicle.overall_screening]
  const hasAssessment = Boolean(vehicle.assessment_id)
  const assessLabel = status.key === 'in_progress' ? 'Continue assessment' : hasAssessment ? 'New assessment' : 'Start assessment'
  const assessFirst = status.key !== 'completed' || !hasAssessment

  return (
    <li className="am-panel">
      <div className="am-panel-media">
        {vehicle.primary_image
          ? <img src={imageUrl(vehicle.primary_image)} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />
          : <span className="am-panel-noimage"><PmIcon name="car" size={30} /></span>}
      </div>
      <div className="am-panel-body">
        <Chip tone={status.tone}>{status.label}</Chip>
        <h2>{vehicle.make} {vehicle.model} <span>{vehicle.year}</span></h2>
        <dl className="am-panel-facts">
          <div><dt>Plate</dt><dd>{vehicle.plate_number || <em>Not recorded</em>}</dd></div>
          <div><dt>Fleet ID</dt><dd>#{vehicle.id}</dd></div>
          <div><dt>Mileage</dt><dd>{formatKm(vehicle.current_mileage) || <em>Not recorded</em>}</dd></div>
          <div><dt>Acquired</dt><dd>{formatDate(vehicle.acquisition_date) || <em>Not recorded</em>}</dd></div>
          <div><dt>Last assessment</dt><dd>{formatDate(vehicle.assessed_on) || <em>None yet</em>}</dd></div>
          {vehicle.reassessment.due_on && <div><dt>Next due</dt><dd>{formatDate(vehicle.reassessment.due_on)}</dd></div>}
        </dl>
        {vehicle.safety_warning_count > 0 && <p className="am-flag-critical"><PmIcon name="alert" size={14} /> {vehicle.safety_warning_count} safety {vehicle.safety_warning_count === 1 ? 'warning' : 'warnings'}</p>}
        {!vehicle.safety_warning_count && screening && hasAssessment && <p className="am-panel-result">Latest screening: {screening.label}</p>}
        {vehicle.data_flags.length > 0 && <p className="am-flag" title={vehicle.data_flags.join(' ')}>{vehicle.data_flags.length} vehicle record {vehicle.data_flags.length === 1 ? 'issue' : 'issues'} to review</p>}
      </div>
      <div className="am-panel-actions">
        <button type="button" className={assessFirst ? 'is-primary' : ''} onClick={() => onOpen(vehicle.id, 'assess')}>{assessLabel}</button>
        {hasAssessment && <button type="button" className={assessFirst ? '' : 'is-primary'} onClick={() => onOpen(vehicle.id, 'results')}>View results</button>}
      </div>
    </li>
  )
}

/** Step 1 of the workflow. Status only; nothing on this page is a prediction. */
export default function AssessmentOverview({ fleet, onOpen, onManageModels }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const rows = useMemo(() => fleet.vehicles.map((vehicle) => ({
    vehicle,
    status: assessmentStatus(vehicle.reassessment.status, Boolean(loadDraft(vehicle.id))),
  })), [fleet.vehicles])

  const counts = useMemo(() => {
    const result = { required: 0, due: 0, in_progress: 0, completed: 0, safety: 0 }
    rows.forEach(({ vehicle, status }) => {
      result[status.key] += 1
      if (vehicle.safety_warning_count > 0) result.safety += 1
    })
    return result
  }, [rows])

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    return rows.filter(({ vehicle, status }) => (filter === 'all' || status.key === filter)
      && (!text || [vehicle.make, vehicle.model, vehicle.year, vehicle.category, vehicle.plate_number, `#${vehicle.id}`]
        .some((value) => String(value ?? '').toLowerCase().includes(text))))
  }, [rows, query, filter])

  return (
    <div className="am-overview">
      <header className="am-page-head">
        <div>
          <span className="am-eyebrow">Fleet maintenance</span>
          <h1>Predictive Maintenance</h1>
        </div>
      </header>

      <dl className="am-tally">
        <div className={counts.safety ? 'is-critical' : ''}><dt>Safety warnings</dt><dd>{counts.safety}</dd></div>
        <div><dt>Assessment required</dt><dd>{counts.required}</dd></div>
        <div><dt>Assessment due</dt><dd>{counts.due}</dd></div>
        <div><dt>In progress</dt><dd>{counts.in_progress}</dd></div>
        <div><dt>Completed</dt><dd>{counts.completed}</dd></div>
      </dl>

      <div className="am-toolbar">
        <label className="am-search">
          <PmIcon name="search" />
          <input type="search" placeholder="Search make, model, plate or ID" aria-label="Search vehicles" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <select aria-label="Filter by assessment status" value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="required">Assessment Required</option>
          <option value="due">Assessment Due</option>
          <option value="in_progress">Assessment In Progress</option>
          <option value="completed">Assessment Completed</option>
        </select>
      </div>

      {visible.length > 0 ? (
        <ul className="am-panel-grid">
          {visible.map(({ vehicle, status }) => <VehiclePanel key={vehicle.id} vehicle={vehicle} status={status} onOpen={onOpen} />)}
        </ul>
      ) : <p className="am-empty">No vehicles match your search.</p>}

      <footer className="am-page-foot">
        <span>Assessment status is worked out when this page loads. No background reminders are sent.</span>
        <button type="button" className="am-link" onClick={onManageModels}><PmIcon name="settings" size={14} /> Model management</button>
      </footer>
    </div>
  )
}
