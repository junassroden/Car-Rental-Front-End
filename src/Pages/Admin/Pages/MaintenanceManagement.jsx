import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getMaintenanceRecords, recordMaintenance, updateMaintenanceRecord, updateVehicleMileage } from '../../../Services/API/maintenanceAPI.js'
import './MaintenanceManagement.css'

const DAY_MS = 86400000
// The same service intervals the backend uses for its estimates.
const SERVICE_DAYS = 180
const SERVICE_KM = 5000
const WARNING_DAYS = 30
const WARNING_KM = 500
const LOG_PAGE_SIZE = 15
const SKELETON_TILES = [1, 2, 3, 4]

const TYPES = [
  ['oil-change', 'Oil change'],
  ['inspection', 'Inspection'],
  ['brake-service', 'Brake service'],
  ['tires', 'Tires'],
  ['battery', 'Battery'],
  ['general-inspection', 'General inspection'],
]
const STATUSES = [
  ['completed', 'Completed'],
  ['scheduled', 'Scheduled'],
  ['in progress', 'In progress'],
]
const HEALTH = {
  overdue: 'Overdue',
  soon: 'Due soon',
  good: 'Up to date',
  none: 'No service record',
}
const HEALTH_FILTERS = [
  { value: '', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'soon', label: 'Due soon' },
  { value: 'good', label: 'Up to date' },
  { value: 'none', label: 'No record' },
]

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function addDays(day, count) {
  return new Date(Date.parse(day) + count * DAY_MS).toISOString().slice(0, 10)
}

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : ''
}

function formatDate(value) {
  const day = dateOnly(value)
  if (!day) return ''
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${day}T00:00:00`))
}

function formatKm(value) {
  return `${Number(value).toLocaleString('en-PH')} km`
}

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function humanize(value) {
  const text = String(value || '').replace(/[-_]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

function typeLabel(value) {
  return TYPES.find(([key]) => key === value)?.[1] || humanize(value) || 'Service'
}

function vehicleName(vehicle) {
  return `${vehicle.make} ${vehicle.model}`
}

/** Service status for one car: whichever of its date or distance limit comes first. */
function serviceHealth(vehicle, today) {
  const lastDate = dateOnly(vehicle.last_maintenance_date)
  if (!lastDate) return { key: 'none', nextDate: dateOnly(vehicle.next_scheduled_date) }

  const nextDate = addDays(lastDate, SERVICE_DAYS)
  const hasKm = hasValue(vehicle.current_mileage) && hasValue(vehicle.last_maintenance_odometer)
  const kmLeft = hasKm ? Number(vehicle.last_maintenance_odometer) + SERVICE_KM - Number(vehicle.current_mileage) : null

  if (nextDate < today || (kmLeft !== null && kmLeft <= 0)) return { key: 'overdue', nextDate, kmLeft }
  if (nextDate <= addDays(today, WARNING_DAYS) || (kmLeft !== null && kmLeft <= WARNING_KM)) return { key: 'soon', nextDate, kmLeft }
  return { key: 'good', nextDate, kmLeft }
}

function emptyRecord(today, vehicleId = '') {
  return {
    vehicleID: vehicleId ? String(vehicleId) : '',
    maintenanceType: TYPES[0][0],
    maintenanceStatus: 'completed',
    maintenanceDate: today,
    odometerReading: '',
    cost: '',
    nextMaintenanceDate: '',
    description: '',
    serviceItems: [],
  }
}

function recordToForm(record, overrides = {}) {
  return {
    vehicleID: String(record.vehicleID),
    maintenanceType: record.maintenanceType || TYPES[0][0],
    maintenanceStatus: String(record.maintenanceStatus || 'completed').toLowerCase(),
    maintenanceDate: dateOnly(record.maintenanceDate),
    odometerReading: hasValue(record.odometerReading) ? String(record.odometerReading) : '',
    cost: Number(record.cost) ? String(Number(record.cost)) : '',
    nextMaintenanceDate: dateOnly(record.nextMaintenanceDate),
    description: record.description || '',
    serviceItems: Array.isArray(record.serviceItems) ? [...record.serviceItems].sort() : [],
    ...overrides,
  }
}

/** Ticked items are what the AI service-need model learns from, so they need the odometer they were done at. */
function needsOdometer(form) {
  return form.maintenanceStatus === 'completed' && form.serviceItems.length > 0
}

function validateRecord(form, today) {
  const errors = {}
  if (!form.vehicleID) errors.vehicleID = 'Choose a vehicle.'
  if (!form.maintenanceDate) errors.maintenanceDate = 'Choose a date.'
  else if (form.maintenanceStatus === 'completed' && form.maintenanceDate > today) errors.maintenanceDate = 'A completed service can\'t be in the future.'
  if (form.odometerReading !== '' && !(Number.isInteger(Number(form.odometerReading)) && Number(form.odometerReading) >= 0)) errors.odometerReading = 'Enter whole kilometres.'
  else if (form.odometerReading === '' && needsOdometer(form)) errors.odometerReading = 'Enter the odometer reading for the ticked service items.'
  if (form.cost !== '' && !(Number(form.cost) >= 0)) errors.cost = 'Enter an amount of 0 or more.'
  if (form.nextMaintenanceDate && form.maintenanceDate && form.nextMaintenanceDate <= form.maintenanceDate) errors.nextMaintenanceDate = 'This must be after the service date.'
  return errors
}

function Dialog({ title, busy, onClose, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
    dialog.querySelector('[data-autofocus]')?.focus()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="mm-dialog"
      aria-labelledby="mm-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <h2 id="mm-dialog-title">{title}</h2>
      {children}
    </dialog>
  )
}

function RecordDialog({ initial, record, vehicles, serviceItems, today, onSaved, onClose }) {
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const formRef = useRef(null)
  const editing = Boolean(record)
  const vehicle = vehicles.find((item) => String(item.id) === form.vehicleID)
  const scheduled = form.maintenanceStatus !== 'completed'
  const typeOptions = TYPES.some(([key]) => key === form.maintenanceType) ? TYPES : [...TYPES, [form.maintenanceType, typeLabel(form.maintenanceType)]]
  const statusOptions = STATUSES.some(([key]) => key === form.maintenanceStatus) ? STATUSES : [...STATUSES, [form.maintenanceStatus, humanize(form.maintenanceStatus)]]
  const lowersMileage = form.odometerReading !== '' && vehicle && hasValue(vehicle.current_mileage)
    && Number(form.odometerReading) < Number(vehicle.current_mileage)
    && form.odometerReading !== initial.odometerReading

  function update(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setSaveError('')
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function toggleItem(event) {
    const { value, checked } = event.target
    setForm((current) => ({
      ...current,
      serviceItems: checked ? [...current.serviceItems, value].sort() : current.serviceItems.filter((item) => item !== value),
    }))
    setSaveError('')
    setErrors((current) => {
      if (!current.odometerReading) return current
      const next = { ...current }
      delete next.odometerReading
      return next
    })
  }

  const fieldProps = (name) => ({
    name,
    value: form[name],
    onChange: update,
    'aria-invalid': errors[name] ? 'true' : undefined,
    'aria-describedby': errors[name] ? `mm-error-${name}` : undefined,
  })
  const renderError = (name) => errors[name] && <small className="mm-error" id={`mm-error-${name}`}>{errors[name]}</small>

  async function submit(event) {
    event.preventDefault()
    const problems = validateRecord(form, today)
    setErrors(problems)
    const first = Object.keys(problems)[0]
    if (first) {
      formRef.current?.elements[first]?.focus()
      return
    }

    const values = {
      maintenanceType: form.maintenanceType,
      maintenanceStatus: form.maintenanceStatus,
      maintenanceDate: form.maintenanceDate,
      odometerReading: form.odometerReading === '' ? null : Number(form.odometerReading),
      cost: form.cost === '' ? 0 : Number(form.cost),
      nextMaintenanceDate: form.nextMaintenanceDate || null,
      description: form.description.trim(),
      // Nothing ticked means "items not recorded", never "nothing was serviced".
      serviceItems: !scheduled && form.serviceItems.length ? form.serviceItems : null,
    }
    setBusy(true)
    setSaveError('')
    try {
      if (editing) {
        // Only what changed: re-sending an old odometer reading would wind back the car's mileage.
        const before = recordToForm(record)
        const changed = Object.fromEntries(Object.entries(values).filter(([key]) => String(before[key] ?? '') !== String(form[key] ?? '')))
        if (Object.keys(changed).length) await updateMaintenanceRecord(record.maintenanceID, changed)
        onSaved('Service record updated.')
      } else {
        await recordMaintenance({ vehicleID: Number(form.vehicleID), ...values })
        onSaved('Service record saved.')
      }
    } catch (requestError) {
      setSaveError(requestError.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title={editing ? 'Edit service record' : 'Add service record'} busy={busy} onClose={onClose}>
      <form ref={formRef} className="mm-form" onSubmit={submit} noValidate>
        <div className="mm-fields">
          <label className="mm-field mm-wide">
            <span>Vehicle</span>
            <select {...fieldProps('vehicleID')} disabled={editing} data-autofocus={!editing && !form.vehicleID ? true : undefined}>
              <option value="">Choose a vehicle</option>
              {vehicles.map((item) => <option key={item.id} value={item.id}>{vehicleName(item)}{item.plate_number ? ` · ${item.plate_number}` : ''}</option>)}
            </select>
            {renderError('vehicleID')}
          </label>
          <label className="mm-field">
            <span>Service type</span>
            <select {...fieldProps('maintenanceType')} data-autofocus={editing || form.vehicleID ? true : undefined}>
              {typeOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="mm-field">
            <span>Status</span>
            <select {...fieldProps('maintenanceStatus')}>
              {statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="mm-field">
            <span>{scheduled ? 'Planned date' : 'Service date'}</span>
            <input {...fieldProps('maintenanceDate')} type="date" />
            {renderError('maintenanceDate')}
          </label>
          <label className="mm-field">
            <span>Next service date <em>Optional</em></span>
            <input {...fieldProps('nextMaintenanceDate')} type="date" min={form.maintenanceDate ? addDays(form.maintenanceDate, 1) : undefined} />
            {renderError('nextMaintenanceDate')}
          </label>
          <label className="mm-field">
            <span>Odometer {!needsOdometer(form) && <em>Optional</em>}</span>
            <span className="mm-suffix"><input {...fieldProps('odometerReading')} type="number" min="0" step="1" /><b aria-hidden="true">km</b></span>
            {renderError('odometerReading')}
            {!errors.odometerReading && lowersMileage && <small className="mm-warning">Below the current {formatKm(vehicle.current_mileage)}. Saving sets the car's mileage to this reading.</small>}
          </label>
          <label className="mm-field">
            <span>Cost <em>Optional</em></span>
            <span className="mm-prefix"><b aria-hidden="true">₱</b><input {...fieldProps('cost')} type="number" min="0" step="0.01" /></span>
            {renderError('cost')}
          </label>
          <label className="mm-field mm-wide">
            <span>Notes <em>Optional</em></span>
            <textarea {...fieldProps('description')} rows="3" placeholder="Work done or issues found" />
          </label>
          {!scheduled && serviceItems.length > 0 && (
            <fieldset className="mm-items mm-wide">
              <legend>Service items done <em>Optional</em></legend>
              <small>Tick every item done at this visit; unticked items are recorded as not done. These real visits train the AI service-need model.</small>
              <div className="mm-item-grid">
                {serviceItems.map(([key, label]) => (
                  <label key={key} className="mm-item">
                    <input type="checkbox" value={key} checked={form.serviceItems.includes(key)} onChange={toggleItem} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        {saveError && <p className="mm-error mm-save-error" role="alert">{saveError}</p>}
        <div className="mm-dialog-actions">
          <button type="button" className="mm-btn mm-btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="mm-btn mm-btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save record'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function MileageDialog({ vehicle, onSaved, onClose }) {
  const [mileage, setMileage] = useState(hasValue(vehicle.current_mileage) ? String(vehicle.current_mileage) : '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const current = hasValue(vehicle.current_mileage) ? Number(vehicle.current_mileage) : null
  const lowers = mileage !== '' && current !== null && Number(mileage) < current

  async function submit(event) {
    event.preventDefault()
    if (mileage === '' || !Number.isInteger(Number(mileage)) || Number(mileage) < 0) {
      setError('Enter the odometer reading in whole kilometres.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await updateVehicleMileage({ vehicleID: Number(vehicle.id), current_mileage: Number(mileage) })
      onSaved(`${vehicleName(vehicle)} mileage updated to ${formatKm(mileage)}.`)
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Update mileage" busy={busy} onClose={onClose}>
      <form className="mm-form" onSubmit={submit} noValidate>
        <p className="mm-dialog-lede">{vehicleName(vehicle)}{vehicle.plate_number ? ` · ${vehicle.plate_number}` : ''}. Currently {current === null ? 'not recorded' : formatKm(current)}.</p>
        <label className="mm-field">
          <span>Current odometer</span>
          <span className="mm-suffix">
            <input
              data-autofocus
              type="number"
              min="0"
              step="1"
              value={mileage}
              aria-invalid={error ? 'true' : undefined}
              onChange={(event) => {
                setMileage(event.target.value)
                setError('')
              }}
            />
            <b aria-hidden="true">km</b>
          </span>
          {error && <small className="mm-error" role="alert">{error}</small>}
          {!error && lowers && <small className="mm-warning">This is lower than the current reading. Save only if you are correcting a mistake.</small>}
        </label>
        <div className="mm-dialog-actions">
          <button type="button" className="mm-btn mm-btn-outline" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="submit" className="mm-btn mm-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save mileage'}</button>
        </div>
      </form>
    </Dialog>
  )
}

function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading maintenance records">
      <div className="mm-tiles" aria-hidden="true">
        {SKELETON_TILES.map((key) => <div className="mm-card mm-tile" key={key}><span className="mm-shimmer mm-line-short" /><span className="mm-shimmer mm-line-value" /></div>)}
      </div>
      <div className="mm-card mm-panel" aria-hidden="true"><span className="mm-shimmer mm-line-short" /><span className="mm-shimmer mm-line-block" /></div>
    </div>
  )
}

export default function MaintenanceManagement({ navigate }) {
  const [data, setData] = useState({ vehicles: [], records: [], serviceItems: [], serviceItemsAvailable: true })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [healthFilter, setHealthFilter] = useState('')
  const [logVehicle, setLogVehicle] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [logLimit, setLogLimit] = useState(LOG_PAGE_SIZE)
  const [recordDialog, setRecordDialog] = useState(null)
  const [mileageVehicle, setMileageVehicle] = useState(null)
  const logRef = useRef(null)
  const today = useMemo(() => localToday(), [])

  useEffect(() => {
    let active = true
    getMaintenanceRecords()
      .then((result) => {
        if (!active) return
        setData({
          vehicles: result.vehicles || [],
          records: result.records || [],
          serviceItems: Object.entries(result.service_items || {}),
          serviceItemsAvailable: result.service_items_available !== false,
        })
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

  const { vehicles, records, serviceItems, serviceItemsAvailable } = data
  const rows = useMemo(() => vehicles.map((vehicle) => ({ vehicle, health: serviceHealth(vehicle, today) })), [today, vehicles])
  const counts = useMemo(() => rows.reduce((totals, row) => ({ ...totals, [row.health.key]: totals[row.health.key] + 1 }), { overdue: 0, soon: 0, good: 0, none: 0 }), [rows])
  const visibleRows = healthFilter ? rows.filter((row) => row.health.key === healthFilter) : rows

  const filteredRecords = useMemo(() => {
    const term = logSearch.trim().toLowerCase()
    return records.filter((record) => (
      (!logVehicle || String(record.vehicleID) === logVehicle)
      && (!term || `${record.make} ${record.model} ${record.plate_number || ''} ${typeLabel(record.maintenanceType)} ${record.description || ''}`.toLowerCase().includes(term))
    ))
  }, [logSearch, logVehicle, records])
  const visibleRecords = filteredRecords.slice(0, logLimit)
  const yearSpend = records
    .filter((record) => dateOnly(record.maintenanceDate).slice(0, 4) === today.slice(0, 4) && String(record.maintenanceStatus).toLowerCase() === 'completed')
    .reduce((sum, record) => sum + Number(record.cost || 0), 0)

  function saved(message) {
    setRecordDialog(null)
    setMileageVehicle(null)
    setNotice(message)
    setAttempt((value) => value + 1)
  }

  function openNewRecord(vehicleId = '') {
    setNotice('')
    setRecordDialog({ initial: emptyRecord(today, vehicleId), record: null })
  }

  function openEdit(record, overrides) {
    setNotice('')
    setRecordDialog({ initial: recordToForm(record, overrides), record })
  }

  function showVehicleLog(vehicleId) {
    setLogVehicle(String(vehicleId))
    setLogSearch('')
    setLogLimit(LOG_PAGE_SIZE)
    logRef.current?.scrollIntoView({ block: 'start' })
  }

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  const loadFailed = error && !vehicles.length && !records.length
  const logFiltered = Boolean(logVehicle || logSearch.trim())

  return (
    <div className="admin-content mm">
      <header className="mm-header">
        <div>
          <h1>Maintenance records</h1>
        </div>
        <div className="mm-header-actions">
          <button type="button" className="mm-btn mm-btn-outline" onClick={() => navigate('/admin/maintenance/predictions')}>View predictions</button>
          {!loading && !loadFailed && vehicles.length > 0 && <button type="button" className="mm-btn mm-btn-primary" onClick={() => openNewRecord()}>Add service record</button>}
        </div>
      </header>

      {loading ? <PageSkeleton /> : loadFailed ? (
        <div className="mm-card mm-state" role="alert">
          <h2>We couldn't load maintenance records</h2>
          <p>{error}</p>
          <button type="button" className="mm-btn mm-btn-primary" onClick={retry}>Try again</button>
        </div>
      ) : (
        <>
          <dl className="mm-tiles">
            <div className={`mm-card mm-tile${counts.overdue ? ' is-urgent' : ''}`}>
              <dt>Overdue</dt>
              <dd className="mm-value">{counts.overdue}</dd>
              <dd className="mm-detail">Past {SERVICE_DAYS} days or {formatKm(SERVICE_KM)}</dd>
            </div>
            <div className="mm-card mm-tile">
              <dt>Due soon</dt>
              <dd className="mm-value">{counts.soon}</dd>
              <dd className="mm-detail">Within {WARNING_DAYS} days or {formatKm(WARNING_KM)}</dd>
            </div>
            <div className="mm-card mm-tile">
              <dt>No service record</dt>
              <dd className="mm-value">{counts.none}</dd>
              <dd className="mm-detail">of {plural(vehicles.length, 'vehicle')}</dd>
            </div>
            <div className="mm-card mm-tile">
              <dt>Spent in {today.slice(0, 4)}</dt>
              <dd className="mm-value">{money(yearSpend)}</dd>
              <dd className="mm-detail">On completed services</dd>
            </div>
          </dl>

          {error && <p className="mm-banner mm-banner-bad" role="alert">{error}</p>}
          {!serviceItemsAvailable && <p className="mm-banner mm-banner-bad" role="status">Service-item tracking is unavailable in this database. Maintenance history can still be viewed and recorded, but service-item tracking needs a database upgrade.</p>}
          {notice && <p className="mm-banner mm-banner-good" role="status">{notice}</p>}

          <section className="mm-card mm-panel" aria-labelledby="mm-vehicles-title">
            <div className="mm-panel-head">
              <h2 id="mm-vehicles-title">Vehicle service status</h2>
              <div className="mm-chips" role="group" aria-label="Filter by service status">
                {HEALTH_FILTERS.map((item) => (
                  <button key={item.label} type="button" className={healthFilter === item.value ? 'selected' : undefined} aria-pressed={healthFilter === item.value} onClick={() => setHealthFilter(item.value)}>
                    {item.label} <span>{item.value ? counts[item.value] : vehicles.length}</span>
                  </button>
                ))}
              </div>
            </div>
            {visibleRows.length ? (
              <table className="mm-table mm-vehicles">
                <thead>
                  <tr>
                    <th scope="col">Vehicle</th>
                    <th scope="col">Mileage</th>
                    <th scope="col">Last service</th>
                    <th scope="col">Next due</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="mm-sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ vehicle, health }) => {
                    const count = Number(vehicle.maintenance_count || 0)
                    return (
                      <tr key={vehicle.id}>
                        <td className="mm-primary">
                          <b>{vehicleName(vehicle)}</b>
                          <small>{[vehicle.year, vehicle.plate_number].filter(Boolean).join(' · ')}</small>
                        </td>
                        <td data-label="Mileage" className="mm-num">{hasValue(vehicle.current_mileage) ? formatKm(vehicle.current_mileage) : <span className="mm-none">Not recorded</span>}</td>
                        <td data-label="Last service">
                          {vehicle.last_maintenance_date ? (
                            <>
                              {formatDate(vehicle.last_maintenance_date)}
                              <small>{typeLabel(vehicle.last_maintenance_type)}</small>
                            </>
                          ) : <span className="mm-none">None yet</span>}
                        </td>
                        <td data-label="Next due">
                          {health.nextDate ? formatDate(health.nextDate) : <span className="mm-none">Log a service to estimate</span>}
                          {hasValue(health.kmLeft) && <small>{health.kmLeft > 0 ? `${formatKm(health.kmLeft)} left` : `${formatKm(-health.kmLeft)} over`}</small>}
                        </td>
                        <td data-label="Status"><span className={`mm-status mm-status-${health.key}`}><i aria-hidden="true" />{HEALTH[health.key]}</span></td>
                        <td className="mm-actions">
                          {count > 0 && <button type="button" className="mm-link" onClick={() => showVehicleLog(vehicle.id)} aria-label={`View ${plural(count, 'record')} for ${vehicleName(vehicle)}`}>{plural(count, 'record')}</button>}
                          <button type="button" className="mm-link" onClick={() => { setNotice(''); setMileageVehicle(vehicle) }} aria-label={`Update mileage for ${vehicleName(vehicle)}`}>Mileage</button>
                          <button type="button" className="mm-btn mm-btn-outline" onClick={() => openNewRecord(vehicle.id)} aria-label={`Add service record for ${vehicleName(vehicle)}`}>Add record</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p className="mm-empty">{vehicles.length ? 'No vehicles have this status.' : 'No vehicles in the fleet yet. Add a vehicle to start tracking its service.'}</p>}
          </section>

          <section className="mm-card mm-panel" ref={logRef} aria-labelledby="mm-log-title">
            <div className="mm-panel-head">
              <div>
                <h2 id="mm-log-title">Service log</h2>
                <p aria-live="polite">{logFiltered ? `${filteredRecords.length} of ${plural(records.length, 'record')}` : plural(records.length, 'record')}</p>
              </div>
              {records.length > 0 && (
                <div className="mm-log-filters">
                  <label className="mm-search">
                    <span className="mm-sr">Search the service log</span>
                    <input type="search" value={logSearch} placeholder="Search type, vehicle, or notes" onChange={(event) => { setLogSearch(event.target.value); setLogLimit(LOG_PAGE_SIZE) }} />
                  </label>
                  <label className="mm-log-vehicle">
                    <span className="mm-sr">Filter by vehicle</span>
                    <select value={logVehicle} onChange={(event) => { setLogVehicle(event.target.value); setLogLimit(LOG_PAGE_SIZE) }}>
                      <option value="">All vehicles</option>
                      {vehicles.map((item) => <option key={item.id} value={item.id}>{vehicleName(item)}{item.plate_number ? ` · ${item.plate_number}` : ''}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>
            {visibleRecords.length ? (
              <>
                <table className="mm-table mm-log">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Vehicle</th>
                      <th scope="col">Service</th>
                      <th scope="col">Odometer</th>
                      <th scope="col">Cost</th>
                      <th scope="col">Status</th>
                      <th scope="col"><span className="mm-sr">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRecords.map((record) => {
                      const status = String(record.maintenanceStatus || 'scheduled').toLowerCase()
                      const open = status !== 'completed'
                      const name = `${record.make} ${record.model}`
                      return (
                        <tr key={record.maintenanceID}>
                          <td className="mm-primary mm-log-date">
                            <b>{formatDate(record.maintenanceDate) || 'No date'}</b>
                            {record.nextMaintenanceDate && <small>Next: {formatDate(record.nextMaintenanceDate)}</small>}
                          </td>
                          <td data-label="Vehicle">{name}{record.plate_number && <small>{record.plate_number}</small>}</td>
                          <td data-label="Service" className="mm-service">
                            {typeLabel(record.maintenanceType)}
                            {record.description && <small title={record.description}>{record.description}</small>}
                          </td>
                          <td data-label="Odometer" className="mm-num">{hasValue(record.odometerReading) ? formatKm(record.odometerReading) : <span className="mm-none">Not set</span>}</td>
                          <td data-label="Cost" className="mm-num">{Number(record.cost) ? money(record.cost) : <span className="mm-none">Not set</span>}</td>
                          <td data-label="Status"><span className={`mm-status mm-rec-${status.replace(/\s+/g, '-')}`}><i aria-hidden="true" />{humanize(status)}</span></td>
                          <td className="mm-actions">
                            <button type="button" className="mm-link" onClick={() => openEdit(record)} aria-label={`Edit ${typeLabel(record.maintenanceType)} record for ${name}`}>Edit</button>
                            {open && <button type="button" className="mm-btn mm-btn-outline" onClick={() => openEdit(record, { maintenanceStatus: 'completed', maintenanceDate: dateOnly(record.maintenanceDate) > today ? today : dateOnly(record.maintenanceDate) || today })} aria-label={`Mark ${typeLabel(record.maintenanceType)} done for ${name}`}>Mark done</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filteredRecords.length > visibleRecords.length && (
                  <div className="mm-more">
                    <button type="button" className="mm-btn mm-btn-outline" onClick={() => setLogLimit((value) => value + LOG_PAGE_SIZE)}>Show {Math.min(LOG_PAGE_SIZE, filteredRecords.length - visibleRecords.length)} more</button>
                  </div>
                )}
              </>
            ) : records.length ? (
              <p className="mm-empty">No records match. <button type="button" className="mm-link" onClick={() => { setLogVehicle(''); setLogSearch('') }}>Clear filters</button></p>
            ) : (
              <p className="mm-empty">No service records yet. Add the first one to start estimating when each car is next due.</p>
            )}
          </section>
        </>
      )}

      {recordDialog && <RecordDialog initial={recordDialog.initial} record={recordDialog.record} vehicles={vehicles} serviceItems={serviceItems} today={today} onSaved={saved} onClose={() => setRecordDialog(null)} />}
      {mileageVehicle && <MileageDialog vehicle={mileageVehicle} onSaved={saved} onClose={() => setMileageVehicle(null)} />}
    </div>
  )
}
