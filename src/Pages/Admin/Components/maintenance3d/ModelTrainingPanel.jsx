import { useCallback, useEffect, useState } from 'react'
import { acceptModel, getTrainingDataset, getTrainingOverview, revokeModel, startTraining } from '../../../../Services/API/assessmentAPI.js'
import { Chip } from './AssessmentOverview.jsx'
import { formatDate, formatKm } from './status.js'

const MODEL_STATUS = {
  evaluated_pending: { label: 'Needs review', tone: 'pending' },
  evaluated_accepted: { label: 'Accepted', tone: 'good' },
  evaluated_rejected: { label: 'Rejected', tone: 'failed' },
  superseded: { label: 'Superseded', tone: 'na' },
}

const EXCLUSIONS = {
  not_verified: 'Not verified',
  no_usable_label: 'No usable result',
  demo_vehicle: 'Demo vehicle',
  missing_vehicle_history: 'Missing vehicle history',
  missing_odometer: 'No odometer on the assessment',
  odometer_decrease: 'Odometer decreased',
  missing_outcome_date: 'No outcome date',
  category_not_rated: 'Category not rated',
  outcome_before_assessment: 'Outcome before the assessment',
  no_lead_time: 'Outcome on the assessment day',
  outside_horizon: 'Outside the prediction horizon',
  invalid_mileage: 'Invalid mileage',
  duplicate_outcome: 'Duplicate outcome',
  duplicate_event: 'Same event recorded twice',
  conflicting_outcomes: 'Conflicting results',
}

function Evaluation({ entry, active, onAccept, onRevoke, busy }) {
  const report = entry.report
  const metrics = report.metrics
  const status = MODEL_STATUS[entry.status] || { label: entry.status, tone: 'na' }
  const matrix = metrics?.confusion_matrix
  return (
    <details className="am-result" open={entry.status === 'evaluated_pending' || active}>
      <summary>
        <span>{entry.model_version}</span>
        <span className="am-result-chips">{active && <Chip tone="good">Serving</Chip>}<Chip tone={status.tone}>{status.label}</Chip></span>
      </summary>
      <div className="am-result-body">
        <dl className="am-status-grid">
          <div><dt>Trained</dt><dd>{formatDate(entry.trained_at)}</dd></div>
          <div title={report.methodology}><dt>Algorithm</dt><dd>{report.algorithm?.replaceAll('_', ' ') || 'None'}</dd></div>
          <div><dt>Data</dt><dd>{report.dataset.rows} rows · {report.dataset.vehicles} vehicles</dd></div>
          <div><dt>Faults / healthy</dt><dd>{report.dataset.faults} / {report.dataset.healthy}</dd></div>
          {report.periods.training && <div><dt>Trained on</dt><dd>{formatDate(report.periods.training[0])} – {formatDate(report.periods.training[1])}</dd></div>}
          {report.periods.test && <div><dt>Tested on</dt><dd>{formatDate(report.periods.test[0])} – {formatDate(report.periods.test[1])}</dd></div>}
        </dl>

        {metrics && (
          <>
            <h4>Test results <small>{metrics.records} records</small></h4>
            <dl className="am-status-grid">
              <div><dt>Recall</dt><dd>{metrics.recall}</dd></div>
              <div><dt>Recall (low)</dt><dd>{metrics.recall_lower_bound}</dd></div>
              <div><dt>Precision</dt><dd>{metrics.precision}</dd></div>
              <div><dt>F1</dt><dd>{metrics.f1}</dd></div>
              <div><dt>Accuracy</dt><dd>{metrics.accuracy}</dd></div>
            </dl>
            <table className="am-table am-matrix" aria-label="Confusion matrix">
              <thead><tr><th /><th>Predicted OK</th><th>Predicted fault</th></tr></thead>
              <tbody>
                <tr><th>Healthy</th><td>{matrix.true_negative}</td><td>{matrix.false_positive} <small>false alarms</small></td></tr>
                <tr><th>Fault</th><td className={matrix.false_negative ? 'am-missed' : ''}>{matrix.false_negative} <small>missed</small></td><td>{matrix.true_positive}</td></tr>
              </tbody>
            </table>
            {matrix.false_negative > 0 && (
              <p className="am-flag-critical">{matrix.false_negative} {matrix.false_negative === 1 ? 'fault' : 'faults'} missed{report.safety_critical ? ' (safety-critical)' : ''}</p>
            )}
            {report.unseen_vehicle_metrics
              ? <p className="am-note">New vehicles: recall {report.unseen_vehicle_metrics.recall} · precision {report.unseen_vehicle_metrics.precision}</p>
              : <p className="am-note">No new vehicles in the test set.</p>}
          </>
        )}

        {report.acceptance_criteria.length > 0 && (
          <>
            <h4>Criteria</h4>
            <table className="am-table">
              <thead><tr><th>Check</th><th>Need</th><th>Got</th><th /></tr></thead>
              <tbody>
                {report.acceptance_criteria.map((item) => (
                  <tr key={item.name}><td>{item.name}</td><td>{item.required}</td><td>{item.actual ?? 'n/a'}</td><td><Chip tone={item.passed ? 'good' : 'failed'}>{item.passed ? 'Pass' : 'Fail'}</Chip></td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <ul className="am-reasons">{report.decision_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {entry.revoked_reason && <p className="am-note" title={entry.revoked_reason}>Withdrawn</p>}

        <div className="am-outcome-actions">
          {entry.status === 'evaluated_pending' && <button type="button" className="is-primary" disabled={busy} onClick={() => onAccept(entry)}>Accept</button>}
          {active && <button type="button" disabled={busy} onClick={() => onRevoke(entry)}>Withdraw</button>}
        </div>
      </div>
    </details>
  )
}

function DatasetReview({ dataset }) {
  return (
    <div className="am-dataset">
      <h4>Dataset <small>{dataset.rows.length}</small></h4>
      {dataset.rows.length === 0 ? <p className="am-note">No records yet.</p> : (
        <div className="am-table-wrap">
          <table className="am-table">
            <thead><tr><th>Vehicle</th><th>Assessed</th><th>Odometer</th><th>Rating</th><th>Result</th><th>Outcome</th><th>Mileage</th></tr></thead>
            <tbody>
              {dataset.rows.slice(0, 100).map((row) => (
                <tr key={row.outcome_id}>
                  <td>{row.plate_number || `#${row.vehicle_id}`}</td>
                  <td>{formatDate(row.assessed_on)}</td>
                  <td>{formatKm(row.odometer_km)}</td>
                  <td>{row.rating}</td>
                  <td>{row.label === 'fault' ? 'Fault' : 'Healthy'}</td>
                  <td>{formatDate(row.outcome_date)}</td>
                  <td>{row.outcome_mileage_km === null ? '—' : formatKm(row.outcome_mileage_km)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dataset.rows.length > 100 && <p className="am-note">First 100 of {dataset.rows.length}</p>}
        </div>
      )}
    </div>
  )
}

/** Data sufficiency, training, evaluation and the model registry, per category. */
export default function ModelTrainingPanel() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [training, setTraining] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dataset, setDataset] = useState({ key: null, value: null })

  const load = useCallback(async () => {
    try {
      setData(await getTrainingOverview())
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  async function act(action) {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function train(key) {
    setTraining(key)
    await act(() => startTraining(key))
    setTraining(null)
  }

  async function review(key) {
    setError('')
    try {
      const value = await getTrainingDataset(key)
      setDataset({ key, value })
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function accept(category, entry) {
    if (window.confirm(`Accept ${entry.model_version}? It will start giving predictions for ${category.name}.`)) {
      void act(() => acceptModel(category.key, entry.model_version))
    }
  }

  function revoke(category, entry) {
    const reason = window.prompt(`Why withdraw ${entry.model_version}? ${category.name} will return to prediction unavailable.`)
    if (reason?.trim()) void act(() => revokeModel(category.key, reason.trim()))
  }

  /** Before real use: withdraws every model trained on simulated SAMPLE- vehicles in one step. */
  function revokeDemoModels(demoModels) {
    const names = demoModels.map((model) => model.key.replaceAll('_', ' ')).join(', ')
    if (!window.confirm(`Withdraw all ${demoModels.length} demonstration models (${names})? Those categories return to prediction unavailable until a model is trained on real outcomes.`)) return
    void act(async () => {
      for (const model of demoModels) {
        await revokeModel(model.key, 'Demonstration model trained on simulated SAMPLE- vehicles; withdrawn before real use.')
      }
    })
  }

  if (!data) {
    return error ? <p className="am-error" role="alert">{error}</p> : <p className="am-note" role="status">Loading…</p>
  }

  const { totals, categories } = data.sufficiency
  const { policy } = data
  const qualified = categories.filter((category) => category.status === 'sufficient').length
  const models = Object.fromEntries(data.models.map((model) => [model.key, model]))
  const demoModels = data.models.filter((model) => model.available && model.demonstration)

  return (
    <>
      <section className="am-section mm-section" aria-label="Training data">
        <div className="am-section-head">
          <h2>Training data</h2>
          <Chip tone={qualified ? 'good' : 'insufficient'}>{qualified}/{categories.length} ready</Chip>
        </div>
        <dl className="mm-stats">
          <div><dt>Verified</dt><dd>{totals.verified_outcomes}</dd></div>
          <div><dt>Eligible</dt><dd>{totals.eligible}</dd></div>
          <div><dt>Vehicles</dt><dd>{totals.vehicles}</dd></div>
          <div><dt>Faults</dt><dd>{totals.faults}</dd></div>
          <div><dt>Healthy</dt><dd>{totals.healthy}</dd></div>
        </dl>
        <ul className="mm-progress">
          {categories.map((category) => {
            const ready = category.status === 'sufficient'
            const why = [
              ...category.blockers,
              ...Object.entries(category.excluded_by_reason).map(([reason, count]) => `Excluded: ${EXCLUSIONS[reason] || reason} (${count})`),
            ].join('\n')
            return (
              <li key={category.key} className={ready ? 'is-ready' : ''} title={why || undefined}>
                <span className="mm-progress-name">{category.name}</span>
                <span className="mm-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (category.eligible / Math.max(category.minimum, 1)) * 100)}%` }} /></span>
                <span className="mm-progress-count">{category.eligible}/{category.minimum}</span>
                <span className="mm-progress-meta">{category.vehicles} veh · {category.faults} F · {category.healthy} H</span>
                <Chip tone={ready ? 'good' : 'insufficient'}>{ready ? 'Ready' : `${category.remaining} more`}</Chip>
              </li>
            )
          })}
        </ul>
        <details className="mm-rules">
          <summary>Rules</summary>
          <ul>
            <li>{policy.min_outcomes_per_category} eligible outcomes per category</li>
            <li>{policy.min_vehicles}+ vehicles, none above {Math.round(policy.max_vehicle_share * 100)}%</li>
            <li>{policy.min_failures}+ faults and {policy.min_healthy}+ healthy</li>
            <li>Verified, within {policy.horizon_days} days, no demo vehicles</li>
          </ul>
        </details>
      </section>

      <section className="am-section mm-section" aria-label="Models">
        <div className="am-section-head"><h2>Models</h2></div>
        {!data.service.reachable && <p className="am-banner">AI service offline.</p>}
        {error && <p className="am-error" role="alert">{error}</p>}
        {demoModels.length > 0 && (
          <div className="am-banner" role="note">
            <p><strong>{demoModels.length} demo {demoModels.length === 1 ? 'model' : 'models'} live</strong> · simulated data, not for real decisions</p>
            <button type="button" disabled={busy || !data.service.reachable} onClick={() => revokeDemoModels(demoModels)}>Withdraw demos</button>
          </div>
        )}
        <div className="am-models">
          {categories.map((category) => {
            const model = models[category.key]
            const ready = category.status === 'sufficient'
            const versions = model?.versions || []
            const open = dataset.key === category.key
            return (
              <article key={category.key} className="am-model-row">
                <header>
                  <strong>{category.name}{category.safety_critical && <small className="mm-safety">Safety</small>}</strong>
                  <Chip tone={model?.available ? 'good' : 'not-assessed'}>{model?.available ? 'Live' : 'Off'}</Chip>
                  {model?.available && model.demonstration && <Chip tone="unknown">Demo</Chip>}
                  <span className="am-model-actions">
                    <button type="button" onClick={() => (open ? setDataset({ key: null, value: null }) : review(category.key))}>{open ? 'Hide data' : 'Data'}</button>
                    <button type="button" className={ready ? 'is-primary' : ''} disabled={!ready || busy || !data.service.reachable} title={ready ? '' : 'Not enough data'} onClick={() => train(category.key)}>
                      {training === category.key ? 'Training…' : 'Train'}
                    </button>
                  </span>
                </header>
                {training === category.key && <p className="am-note" role="status">Training…</p>}
                {model && !model.available && versions.length > 0 && <p className="am-note">{model.reason}</p>}
                                {open && dataset.value && <DatasetReview dataset={dataset.value} />}
                {versions.map((entry) => (
                  <Evaluation key={entry.model_version} entry={entry} active={model.active_version === entry.model_version} busy={busy} onAccept={(item) => accept(category, item)} onRevoke={(item) => revoke(category, item)} />
                ))}
              </article>
            )
          })}
        </div>
        {data.runs.length > 0 && (
          <details className="am-runs">
            <summary>History <small>{data.runs.length}</small></summary>
            <table className="am-table">
              <thead><tr><th>Started</th><th>Category</th><th>Run</th><th>Records</th><th>Vehicles</th><th>Evaluation</th></tr></thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id}>
                    <td>{run.started_at}</td>
                    <td>{run.category_key}</td>
                    <td>{run.status}{run.error_message ? `: ${run.error_message}` : ''}</td>
                    <td>{run.dataset_rows}</td>
                    <td>{run.dataset_vehicles}</td>
                    <td>{MODEL_STATUS[run.evaluation_status]?.label || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>
    </>
  )
}
