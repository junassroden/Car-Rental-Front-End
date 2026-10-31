import { useEffect, useState } from 'react'
import { getMaintenancePredictions } from '../../../../Services/API/maintenanceAPI.js'

const RISK_TONES = { high: 'attention', medium: 'attention', low: 'good' }

/**
 * Fleet-wide output of the registered service-need model (model_predictions
 * from /api/maintenance/predictions). Shown separately from inspections and
 * schedules: a likely service item is not a confirmed fault.
 */
export default function FleetServiceNeeds({ onSelect }) {
  const [state, setState] = useState({ loading: true, error: '', data: null })

  useEffect(() => {
    let active = true
    getMaintenancePredictions()
      .then((result) => { if (active) setState({ loading: false, error: '', data: result?.model_predictions || null }) })
      .catch((error) => { if (active) setState({ loading: false, error: error.message, data: null }) })
    return () => { active = false }
  }, [])

  const { loading, error, data } = state
  if (loading) return <section className="pm-fleet-needs" role="status"><span className="pm-spinner" />Loading model predictions…</section>
  if (error) return <section className="pm-fleet-needs" role="alert"><h2>Model predictions</h2><p className="pm-muted">{error}</p></section>
  if (!data || data.status !== 'available') {
    return (
      <section className="pm-fleet-needs">
        <h2>Model predictions</h2>
        <p className="pm-muted">Unavailable: {data?.reason || 'no response from the AI service.'}</p>
      </section>
    )
  }

  const flagged = data.vehicles.filter((vehicle) => vehicle.recommendation_count > 0)
  return (
    <section className="pm-fleet-needs" aria-labelledby="pm-fleet-needs-title">
      <header>
        <h2 id="pm-fleet-needs-title">Likely service needs</h2>
        <small>
          Model {data.model_version} · {data.summary?.analyzed_vehicles ?? 0} of {data.summary?.submitted_vehicles ?? 0} vehicles scored
          {data.not_scored?.length ? ` · ${data.not_scored.length} outside the model's training data` : ''}
        </small>
      </header>
      <p className="pm-muted">{data.meaning}</p>
      {flagged.length ? (
        <ul>
          {flagged.map((vehicle) => (
            <li key={vehicle.vehicle_id}>
              <button type="button" onClick={() => onSelect(vehicle.vehicle_id)}>
                <strong>{vehicle.vehicle?.brand} {vehicle.vehicle?.model}</strong>
                <span>{Number(vehicle.vehicle?.mileage || 0).toLocaleString('en-PH')} km</span>
              </button>
              <div>
                {vehicle.recommendations.map((item) => (
                  <span key={item.component} className={`pm-badge tone-${RISK_TONES[item.risk_category] || 'unknown'}`}><i />{item.label} {(item.score * 100).toFixed(0)}%</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="pm-muted">No scored vehicle has a service item above its recommendation threshold.</p>}
      {data.not_scored?.length > 0 && (
        <details className="pm-details">
          <summary>Why some vehicles were not scored</summary>
          <ul>{data.not_scored.map((item) => <li key={item.vehicle_id}>Vehicle #{item.vehicle_id}: {item.error}</li>)}</ul>
        </details>
      )}
    </section>
  )
}
