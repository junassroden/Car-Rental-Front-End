import { useEffect, useRef, useState } from 'react'
import {
  deleteComponentSchedule,
  explainComponent,
  getComponentHistory,
  recordComponentInspection,
  saveComponentSchedule,
} from '../../../../Services/API/componentMaintenanceAPI.js'
import {
  CONDITION_LABELS,
  CONDITION_TONES,
  PREDICTION_LABELS,
  RECORDED_CONDITION_LABELS,
  SCHEDULE_LABELS,
  SCHEDULE_TONES,
  formatDate,
  formatKm,
  todayISO,
} from './status.js'

// Model risk categories are amber at most: a likely service need is not a confirmed fault.
const PREDICTION_TONES = { high: 'attention', medium: 'attention', low: 'good', not_assessed: 'unknown' }
const RISK_LABELS = { high: 'High service need', medium: 'Service likely due', low: 'Low service need', not_assessed: 'Not assessed' }

const BODY_TYPE_LABELS = { sedan: 'sedans', suv: 'SUVs', pickup: 'pickups', van: 'vans', minivan: 'minivans', motorcycle: 'motorcycles' }

function Badge({ tone, children }) {
  return <span className={`pm-badge tone-${tone}`}><i />{children}</span>
}

function StatusRow({ label, tone, value, children }) {
  return (
    <div className="pm-status-row">
      <span className="pm-status-label">{label}</span>
      <Badge tone={tone}>{value}</Badge>
      {children && <p>{children}</p>}
    </div>
  )
}

function Fact({ label, value }) {
  return <div className="pm-fact"><span>{label}</span><strong className={value ? '' : 'is-missing'}>{value || 'Not recorded'}</strong></div>
}

function joinParts(...parts) {
  return parts.filter(Boolean).join(' · ') || null
}

function Overview({ component, vehicle }) {
  const { condition, schedule, prediction, latest_record: latest, last_service: service, recommended_action: action } = component
  const evidence = condition.evidence
  const nextDue = joinParts(formatDate(schedule.due_date), formatKm(schedule.due_km))

  return (
    <>
      <div className="pm-status-list">
        <StatusRow label="Condition" tone={CONDITION_TONES[condition.status]} value={CONDITION_LABELS[condition.status]}>
          {condition.reason}
          {evidence && <small className="pm-evidence">Evidence: {joinParts(evidence.source, formatDate(evidence.date), evidence.technician && `technician ${evidence.technician}`, evidence.recorded_by && `recorded by ${evidence.recorded_by}`)}</small>}
        </StatusRow>
        <StatusRow label="Schedule" tone={SCHEDULE_TONES[schedule.status]} value={SCHEDULE_LABELS[schedule.status]}>
          {schedule.reason}
          {schedule.rule && <small className="pm-evidence">Interval: {joinParts(schedule.rule.interval_days && `every ${schedule.rule.interval_days} days`, schedule.rule.interval_km && `every ${formatKm(schedule.rule.interval_km)}`)} ({schedule.rule.scope === 'vehicle' ? 'this vehicle' : `all ${BODY_TYPE_LABELS[vehicle.body_type] || 'vehicles of this type'}`}) · source: {schedule.rule.basis}</small>}
        </StatusRow>
        <StatusRow label="Prediction" tone={prediction.status === 'available' ? PREDICTION_TONES[prediction.risk_category] || 'good' : 'unknown'} value={prediction.status === 'available' && prediction.risk_category ? RISK_LABELS[prediction.risk_category] : PREDICTION_LABELS[prediction.status]}>
          {prediction.status === 'available'
            ? <>Model score {(prediction.score * 100).toFixed(0)}%{prediction.threshold !== null && ` (threshold ${(prediction.threshold * 100).toFixed(0)}%)`}. {prediction.reason}</>
            : prediction.message}
          {prediction.status === 'available' && prediction.model_version && <small className="pm-evidence">Service-need model {prediction.model_version}{prediction.prediction_timestamp && ` · ${formatDate(prediction.prediction_timestamp.slice(0, 10))}`}. Likelihood that the item is done at a service visit at this odometer — not a detected fault.</small>}
        </StatusRow>
      </div>
      {prediction.status === 'available' && prediction.items?.length > 0 && (
        <ul className="pm-prediction-items">
          {prediction.items.map((item) => (
            <li key={item.target}>
              <Badge tone={PREDICTION_TONES[item.risk_category] || 'unknown'}>{item.label} · {(item.score * 100).toFixed(0)}%</Badge>
              {item.supporting_evidence && <small>{item.supporting_evidence}</small>}
              {item.recommended_action && <small>{item.recommended_action}</small>}
            </li>
          ))}
        </ul>
      )}
      {prediction.status !== 'available' && prediction.reason && (
        <details className="pm-details"><summary>Why is prediction unavailable?</summary><p>{prediction.reason}</p></details>
      )}

      <div className="pm-facts">
        <Fact label="Last inspection" value={latest && joinParts(formatDate(latest.inspected_on), formatKm(latest.odometer_km))} />
        <Fact label="Last service" value={service && joinParts(formatDate(service.date), formatKm(service.odometer_km))} />
        <Fact label="Next service due" value={nextDue} />
        <Fact label="Current odometer" value={formatKm(vehicle.current_mileage)} />
      </div>

      {!latest && <p className="pm-muted">No inspection record available.</p>}
      {latest && (latest.findings || latest.confirmed_fault || latest.work_performed || latest.reported_symptoms || latest.dtc_codes.length > 0) && (
        <div className="pm-notes">
          <span>Latest record · {RECORDED_CONDITION_LABELS[latest.condition_rating]}</span>
          {latest.confirmed_fault && <p><strong>Confirmed fault:</strong> {latest.confirmed_fault}</p>}
          {latest.findings && <p><strong>Inspection findings:</strong> {latest.findings}</p>}
          {latest.reported_symptoms && <p><strong>Reported symptoms (unverified):</strong> {latest.reported_symptoms}</p>}
          {latest.dtc_codes.length > 0 && <p><strong>Recorded trouble codes:</strong> {latest.dtc_codes.map((code) => <code key={code}>{code}</code>)}</p>}
          {latest.work_performed && <p><strong>Work performed:</strong> {latest.work_performed}{latest.parts_replaced && ` · Parts: ${latest.parts_replaced}`}</p>}
        </div>
      )}

      {action && (
        <div className="pm-action">
          <span>Recommended action <em>{action.source === 'inspection_record' ? 'from inspection record' : 'system rule'}</em></span>
          <p>{action.text}</p>
        </div>
      )}
    </>
  )
}

function InspectionForm({ vehicle, component, onSaved, onCancel }) {
  const [values, setValues] = useState({
    inspected_on: todayISO(),
    odometer_km: '',
    condition_rating: '',
    reported_symptoms: '',
    dtc_codes: '',
    findings: '',
    confirmed_fault: '',
    service_performed: false,
    service_date: '',
    work_performed: '',
    parts_replaced: '',
    recommended_action: '',
    next_due_date: '',
    next_due_km: '',
    technician: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (field) => (event) => setValues((current) => ({
    ...current,
    [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
  }))
  const problem = values.condition_rating === 'needs_attention' || values.condition_rating === 'critical'

  async function submit(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const payload = { ...values }
      if (!problem) payload.confirmed_fault = ''
      if (!values.service_performed) Object.assign(payload, { service_date: '', work_performed: '', parts_replaced: '' })
      await recordComponentInspection(vehicle.id, component.key, payload)
      await onSaved('Inspection saved.')
    } catch (requestError) {
      setError(requestError.message)
      setSaving(false)
    }
  }

  return (
    <form className="pm-form" onSubmit={submit}>
      <div className="pm-form-row">
        <label>Inspection date<input type="date" value={values.inspected_on} max={todayISO()} onChange={set('inspected_on')} required /></label>
        <label>Odometer (km)<input type="number" min="0" step="1" inputMode="numeric" value={values.odometer_km} onChange={set('odometer_km')} placeholder={vehicle.current_mileage ?? 'Optional'} /></label>
      </div>
      <fieldset className="pm-segmented">
        <legend>Observed condition</legend>
        {Object.entries(RECORDED_CONDITION_LABELS).map(([value, label]) => (
          <label key={value} className={values.condition_rating === value ? 'is-checked' : ''}>
            <input type="radio" name="condition_rating" value={value} checked={values.condition_rating === value} onChange={set('condition_rating')} required />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="pm-form-row">
        <label>Reported symptoms<input maxLength="2000" value={values.reported_symptoms} onChange={set('reported_symptoms')} placeholder="As reported by driver/customer" /></label>
        <label>Trouble codes<input maxLength="120" value={values.dtc_codes} onChange={set('dtc_codes')} placeholder="e.g. P0301, P0420" pattern="\s*([PCBUpcbu][0-3][0-9A-Fa-f]{3}[\s,;]*)*" title="OBD-II codes such as P0301, separated by commas" /></label>
      </div>
      <label>Inspection findings{problem && ' (required)'}<textarea rows="2" maxLength="2000" value={values.findings} onChange={set('findings')} required={problem} placeholder="What was actually observed" /></label>
      {problem && <label>Confirmed fault<input maxLength="255" value={values.confirmed_fault} onChange={set('confirmed_fault')} placeholder="Only if confirmed by inspection" /></label>}
      <label className="pm-check"><input type="checkbox" checked={values.service_performed} onChange={set('service_performed')} />Service or repair was performed</label>
      {values.service_performed && (
        <>
          <div className="pm-form-row">
            <label>Service date<input type="date" value={values.service_date} max={todayISO()} onChange={set('service_date')} placeholder="Same as inspection" /></label>
            <label>Parts replaced<input maxLength="1000" value={values.parts_replaced} onChange={set('parts_replaced')} /></label>
          </div>
          <label>Work performed (required)<textarea rows="2" maxLength="2000" value={values.work_performed} onChange={set('work_performed')} required /></label>
        </>
      )}
      <label>Recommended action<input maxLength="255" value={values.recommended_action} onChange={set('recommended_action')} /></label>
      <div className="pm-form-row">
        <label>Next service date<input type="date" min={values.inspected_on} value={values.next_due_date} onChange={set('next_due_date')} /></label>
        <label>Next service (km)<input type="number" min="1" step="1" inputMode="numeric" value={values.next_due_km} onChange={set('next_due_km')} /></label>
      </div>
      <label>Technician / staff<input maxLength="120" value={values.technician} onChange={set('technician')} /></label>
      {error && <p className="pm-error" role="alert">{error}</p>}
      <div className="pm-form-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Saving…' : 'Save inspection'}</button>
      </div>
    </form>
  )
}

function ScheduleForm({ vehicle, component, onSaved, onCancel }) {
  const rule = component.schedule.rule
  const [values, setValues] = useState({
    scope: rule?.scope || 'vehicle',
    interval_days: rule?.interval_days ?? '',
    interval_km: rule?.interval_km ?? '',
    due_soon_days: rule?.due_soon_days ?? 30,
    due_soon_km: rule?.due_soon_km ?? 1000,
    basis: rule?.basis || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  async function run(action, message) {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await action()
      await onSaved(message)
    } catch (requestError) {
      setError(requestError.message)
      setSaving(false)
    }
  }

  return (
    <form className="pm-form" onSubmit={(event) => { event.preventDefault(); run(() => saveComponentSchedule(vehicle.id, component.key, values), 'Schedule saved.') }}>
      <p className="pm-form-note">Enter the interval from the manufacturer schedule or your fleet policy. No interval is assumed by default.</p>
      <fieldset className="pm-segmented">
        <legend>Applies to</legend>
        <label className={values.scope === 'vehicle' ? 'is-checked' : ''}><input type="radio" name="scope" value="vehicle" checked={values.scope === 'vehicle'} onChange={set('scope')} />This vehicle</label>
        {vehicle.body_type && (
          <label className={values.scope === 'body_type' ? 'is-checked' : ''}><input type="radio" name="scope" value="body_type" checked={values.scope === 'body_type'} onChange={set('scope')} />All {BODY_TYPE_LABELS[vehicle.body_type]}</label>
        )}
      </fieldset>
      <div className="pm-form-row">
        <label>Every (days)<input type="number" min="1" max="3650" value={values.interval_days} onChange={set('interval_days')} /></label>
        <label>Every (km)<input type="number" min="1" max="1000000" value={values.interval_km} onChange={set('interval_km')} /></label>
      </div>
      <div className="pm-form-row">
        <label>Due-soon window (days)<input type="number" min="0" max="365" value={values.due_soon_days} onChange={set('due_soon_days')} /></label>
        <label>Due-soon window (km)<input type="number" min="0" max="100000" value={values.due_soon_km} onChange={set('due_soon_km')} /></label>
      </div>
      <label>Source of interval (required)<input maxLength="255" value={values.basis} onChange={set('basis')} required placeholder="e.g. Owner's manual, p. 214" /></label>
      {error && <p className="pm-error" role="alert">{error}</p>}
      <div className="pm-form-actions">
        {rule && (
          <button type="button" className="is-danger" disabled={saving} onClick={() => run(() => deleteComponentSchedule(vehicle.id, component.key, rule.scope), 'Schedule removed.')}>Remove</button>
        )}
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button>
      </div>
    </form>
  )
}

function History({ vehicle, component }) {
  const [state, setState] = useState({ loading: true, error: '', records: [] })

  useEffect(() => {
    const controller = new AbortController()
    getComponentHistory(vehicle.id, component.key, { signal: controller.signal })
      .then((records) => setState({ loading: false, error: '', records }))
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, error: error.message, records: [] }) })
    return () => controller.abort()
  }, [vehicle.id, component.key, component.history_count])

  if (state.loading) return <p className="pm-muted" role="status">Loading history…</p>
  if (state.error) return <p className="pm-error" role="alert">{state.error}</p>
  if (!state.records.length) return <p className="pm-muted">No inspection or service has been recorded for this component.</p>

  return (
    <ol className="pm-history">
      {state.records.map((record) => (
        <li key={record.id}>
          <div><strong>{formatDate(record.inspected_on)}</strong><Badge tone={CONDITION_TONES[record.condition_rating] || 'unknown'}>{RECORDED_CONDITION_LABELS[record.condition_rating]}</Badge></div>
          <small>{joinParts(formatKm(record.odometer_km), record.service_performed ? 'Service performed' : 'Inspection', record.technician, record.recorded_by_name && `by ${record.recorded_by_name}`)}</small>
          {record.confirmed_fault && <p><strong>Fault:</strong> {record.confirmed_fault}</p>}
          {record.findings && <p>{record.findings}</p>}
          {record.reported_symptoms && <p><strong>Reported:</strong> {record.reported_symptoms}</p>}
          {record.dtc_codes.length > 0 && <p><strong>Codes:</strong> {record.dtc_codes.join(', ')}</p>}
          {record.work_performed && <p><strong>Work:</strong> {record.work_performed}{record.parts_replaced && ` · Parts: ${record.parts_replaced}`}</p>}
        </li>
      ))}
    </ol>
  )
}

function Assistant({ vehicle, component }) {
  const [state, setState] = useState({ busy: false, error: '', message: '' })
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  async function ask() {
    if (state.busy) return
    setState({ busy: true, error: '', message: '' })
    try {
      const response = await explainComponent(vehicle.id, component)
      if (mounted.current) setState({ busy: false, error: '', message: response?.message || 'The AI service returned no explanation.' })
    } catch (error) {
      if (mounted.current) setState({ busy: false, error: error.message, message: '' })
    }
  }

  return (
    <div className="pm-assistant">
      <p className="pm-form-note">The AI assistant explains the recorded evidence for this component. Its answer is guidance, not an inspection result.</p>
      {state.message && <div className="pm-assistant-answer" role="status">{state.message}</div>}
      {state.error && <p className="pm-error" role="alert">{state.error}</p>}
      <button type="button" className="is-primary" onClick={ask} disabled={state.busy}>{state.busy ? 'Reviewing records…' : state.message ? 'Ask again' : 'Explain this component'}</button>
    </div>
  )
}

const TABS = [
  ['overview', 'Overview'],
  ['inspect', 'Record inspection'],
  ['schedule', 'Schedule'],
  ['history', 'History'],
  ['ai', 'AI'],
]

/** Callout content for one component. Remounted (keyed) per component, so no state leaks between parts. */
export default function ComponentInspector({ vehicle, component, components, refreshing, onClose, onSaved, onSwitch }) {
  const [tab, setTab] = useState('overview')
  const [notice, setNotice] = useState('')

  async function saved(message) {
    await onSaved()
    setNotice(message)
    setTab('overview')
  }

  return (
    <div className="pm-inspector">
      <header>
        <div>
          <span className="pm-kicker">{vehicle.make} {vehicle.model}{vehicle.plate_number ? ` · ${vehicle.plate_number}` : ''}</span>
          <h2>{component.name}</h2>
        </div>
        {components.length > 1 && (
          <label className="pm-switcher">
            <span className="sr-only">Switch component</span>
            <select value={component.key} onChange={(event) => onSwitch(event.target.value)}>
              {components.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="pm-close" onClick={onClose} aria-label="Close inspection">×</button>
      </header>
      <nav className="pm-tabs" aria-label="Component sections">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? 'is-active' : ''} onClick={() => { setTab(key); setNotice('') }} aria-current={tab === key}>
            {key === 'history' ? `${label} (${component.history_count})` : label}
          </button>
        ))}
      </nav>
      <div className="pm-inspector-body">
        {notice && <p className="pm-notice" role="status">{notice}</p>}
        {refreshing && <p className="pm-muted" role="status">Refreshing records…</p>}
        {tab === 'overview' && <Overview component={component} vehicle={vehicle} />}
        {tab === 'inspect' && <InspectionForm vehicle={vehicle} component={component} onSaved={saved} onCancel={() => setTab('overview')} />}
        {tab === 'schedule' && <ScheduleForm vehicle={vehicle} component={component} onSaved={saved} onCancel={() => setTab('overview')} />}
        {tab === 'history' && <History vehicle={vehicle} component={component} />}
        {tab === 'ai' && <Assistant vehicle={vehicle} component={component} />}
      </div>
    </div>
  )
}
