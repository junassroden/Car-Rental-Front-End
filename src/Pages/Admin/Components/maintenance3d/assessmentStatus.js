// Display vocabulary for assessments. Physical rating, rule-based screening, AI
// processing and predictive capability are separate statuses and stay separate.

export const RATINGS = {
  excellent: { label: 'Excellent', short: '5', tone: 'excellent' },
  good: { label: 'Good', short: '4', tone: 'good' },
  fair: { label: 'Fair', short: '3', tone: 'fair' },
  poor: { label: 'Poor', short: '2', tone: 'poor' },
  critical: { label: 'Critical', short: '1', tone: 'critical' },
  not_applicable: { label: 'N/A', long: 'Not Applicable', short: 'N/A', tone: 'na' },
  unknown: { label: 'Unknown', short: '?', tone: 'unknown' },
  not_assessed: { label: 'Not Assessed', short: '–', tone: 'not-assessed' },
}

export const SCREENING = {
  critical: { label: 'Critical finding', tone: 'critical' },
  attention: { label: 'Maintenance recommended', tone: 'poor' },
  monitor: { label: 'Needs attention', tone: 'fair' },
  no_concerns_recorded: { label: 'No concerns recorded', tone: 'good' },
  insufficient_data: { label: 'Insufficient Data', tone: 'insufficient' },
  not_assessed: { label: 'Not Assessed', tone: 'not-assessed' },
  not_applicable: { label: 'N/A', tone: 'na' },
}

export const AI_STATUS = {
  pending: { label: 'Pending', tone: 'pending' },
  processing: { label: 'Processing', tone: 'pending' },
  completed: { label: 'Completed', tone: 'good' },
  failed: { label: 'Failed', tone: 'failed' },
}

export const SEVERITY = {
  critical: { label: 'Critical', tone: 'critical' },
  warning: { label: 'Warning', tone: 'poor' },
  advisory: { label: 'Advisory', tone: 'fair' },
}

export const REASSESSMENT = {
  never_assessed: { label: 'Never assessed', tone: 'not-assessed' },
  current: { label: 'Current', tone: 'good' },
  due_soon: { label: 'Due soon', tone: 'fair' },
  overdue: { label: 'Overdue', tone: 'poor' },
}

export const SUFFICIENCY = {
  sufficient: 'Sufficient',
  partial: 'Partial',
  insufficient: 'Insufficient Data',
  not_assessed: 'Not Assessed',
  not_applicable: 'N/A',
}

export const USAGE = {
  daily: 'Daily',
  several_per_week: 'Several times a week',
  weekly: 'Weekly',
  occasional: 'Occasional',
}

export const ANSWERS = { yes: 'Yes', no: 'No', unknown: 'Unknown', not_applicable: 'N/A' }

export const DECISIONS = { completed: 'Completed', deferred: 'Deferred', rejected: 'Rejected' }
export const CONFIRMATIONS = { not_checked: 'Not checked', confirmed: 'Confirmed', not_confirmed: 'Not confirmed' }
export const RESULTS = { pending: 'Pending', confirmed_failure: 'Failed', successful_repair: 'Repaired', no_fault_found: 'No fault' }
export const VERIFICATION = { unverified: 'Unverified', verified: 'Verified', rejected: 'Rejected' }

export const CHANGE = {
  improved: { label: 'Improved', tone: 'good' },
  worsened: { label: 'Worsened', tone: 'poor' },
  unchanged: { label: 'Unchanged', tone: 'na' },
  not_comparable: { label: 'Not comparable', tone: 'not-assessed' },
}

const STAGE_TONES = { critical: 'critical', attention: 'attention', monitor: 'attention', no_concerns_recorded: 'good' }

/** Hotspot colour for a 3D part, from rule-based screening only. */
export function stageTone(screeningStatus) {
  return STAGE_TONES[screeningStatus] || 'unknown'
}

export const STAGE_LEGEND = [
  { tone: 'good', label: 'OK' },
  { tone: 'attention', label: 'Attention' },
  { tone: 'critical', label: 'Critical' },
  { tone: 'unknown', label: 'No data' },
]

export function newUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/* Assessment drafts are kept on this device until the assessment is submitted. */

function draftKey(vehicleId) {
  return `assessment-draft-${vehicleId}`
}

export function loadDraft(vehicleId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(draftKey(vehicleId)) || 'null')
    return stored?.components ? stored : null
  } catch {
    return null
  }
}

export function storeDraft(vehicleId, form) {
  try {
    if (form) window.localStorage.setItem(draftKey(vehicleId), JSON.stringify(form))
    else window.localStorage.removeItem(draftKey(vehicleId))
  } catch {
    // A draft is only a convenience; the form still works without storage.
  }
}

/** The status shown on a vehicle panel: a local draft, otherwise the backend's reassessment state. */
export function assessmentStatus(reassessmentStatus, hasDraft) {
  if (hasDraft) return { key: 'in_progress', label: 'Assessment In Progress', tone: 'pending' }
  if (reassessmentStatus === 'never_assessed') return { key: 'required', label: 'Assessment Required', tone: 'poor' }
  if (reassessmentStatus === 'current') return { key: 'completed', label: 'Assessment Completed', tone: 'good' }
  return { key: 'due', label: 'Assessment Due', tone: reassessmentStatus === 'overdue' ? 'poor' : 'fair' }
}

// Each label restates the backend's worst screening severity. Nothing here is a score.
const CONDITIONS = {
  critical: { label: 'Critical Condition', tone: 'critical', priority: 'Urgent' },
  attention: { label: 'Maintenance Recommended', tone: 'poor', priority: 'High' },
  monitor: { label: 'Needs Attention', tone: 'fair', priority: 'Moderate' },
  no_concerns_recorded: { label: 'Good Condition', tone: 'good', priority: 'Routine' },
  limited: { label: 'Limited Information', tone: 'insufficient', priority: 'Not determined' },
}

/**
 * Overall condition from stored screening. The backend's overall status is the
 * worst one present, so a single clean category outranks categories with no usable
 * data. Good Condition therefore also requires that every category was evaluated.
 */
export function overallCondition(assessment, categories) {
  const statuses = categories.map((category) => assessment.components[category.key]?.screening_status)
  const unevaluated = statuses.filter((status) => !status || ['insufficient_data', 'not_assessed'].includes(status)).length
  const flagged = statuses.filter((status) => ['critical', 'attention', 'monitor'].includes(status)).length
  const overall = assessment.overall_screening
  if (CONDITIONS[overall] && overall !== 'no_concerns_recorded') {
    const extra = unevaluated ? ` ${unevaluated} unchecked.` : ''
    return { ...CONDITIONS[overall], summary: `${flagged} of ${categories.length} flagged.${extra}` }
  }
  if (overall === 'no_concerns_recorded' && unevaluated === 0) {
    // Questions are optional, so a clean screening can rest on very few answers.
    const limited = categories.filter((category) => ['partial', 'insufficient'].includes(assessment.components[category.key]?.data_sufficiency)).length
    if (limited) {
      return {
        label: 'No Concerns Recorded', tone: 'good', priority: 'Routine',
        summary: `Nothing flagged. ${limited} of ${categories.length} had few answers.`,
      }
    }
    return { ...CONDITIONS.no_concerns_recorded, summary: 'Nothing flagged.' }
  }
  return { ...CONDITIONS.limited, summary: `${unevaluated} of ${categories.length} unchecked.` }
}

/* Survey examples. These are placeholder hints only: they are never pre-filled or submitted. */

export const RATING_EXAMPLES = {
  excellent: 'Example: looks and works like new, with no wear seen.',
  good: 'Example: normal wear for its age, and no defect seen.',
  fair: 'Example: wear or a defect was seen, but it does not need immediate work yet.',
  poor: 'Example: a defect was found that needs repair.',
  critical: 'Example: the component is unsafe or unfit for use.',
  not_applicable: 'Example: this vehicle does not have this component.',
  unknown: 'Example: you could not inspect it this time.',
  not_assessed: 'Example: choose Fair if wear is visible but no immediate work is needed.',
}

export const MEASUREMENT_EXAMPLES = {
  oil_pressure_kpa: '250',
  engine_hours: '3200',
  battery_rest_voltage_v: '12.6',
  charging_voltage_v: '14.2',
  cranking_voltage_v: '10.5',
  battery_age_months: '24',
  front_pad_mm: '8',
  rear_pad_mm: '6',
  front_rotor_mm: '26',
  fluid_temperature_c: '85',
  steering_free_play_mm: '10',
  tread_depth_min_mm: '6',
  tire_pressure_min_psi: '32',
  tire_age_months: '36',
  coolant_temperature_c: '90',
  vent_temperature_c: '8',
  ambient_temperature_c: '32',
}

export const FAULT_CODE_EXAMPLES = {
  engine: 'P0301',
  battery_electrical: 'P0562',
  brakes: 'C0035',
  transmission: 'P0700',
  suspension_steering: 'C0460',
  cooling: 'P0118',
  air_conditioning: 'P0530',
}

export const NOTE_EXAMPLES = {
  engine: 'e.g. Slight oil seepage near the valve cover; no drips on the ground.',
  battery_electrical: 'e.g. Light corrosion on the positive terminal; cleaned during inspection.',
  brakes: 'e.g. Front pads about half worn; pedal felt firm on the test drive.',
  transmission: 'e.g. Slight delay shifting into reverse when cold.',
  suspension_steering: 'e.g. Faint knock from the front left over speed bumps.',
  tires_wheels: 'e.g. Rear right tire has a small sidewall scuff; no bulge.',
  cooling: 'e.g. Coolant at the minimum line; topped up during inspection.',
  air_conditioning: 'e.g. Cools well at idle; slight musty smell at start-up.',
}

/* Survey answers. HEALTHY_ANSWERS is derived from the screening rules in
   assessment_catalog.json: for each question with an answer rule, the normal answer
   is the one that does not trigger it. Questions without a rule have no entry and are
   never filled in. Regenerate this map if the catalog rules change. */
export const HEALTHY_ANSWERS = {
  engine: { oil_level_ok: 'yes', visible_oil_leak: 'no', warning_light_on: 'no' },
  battery_electrical: { lights_work: 'yes', battery_warning_on: 'no' },
  brakes: { pedal_firm: 'yes', fluid_level_ok: 'yes', parking_brake_holds: 'yes', abs_warning_on: 'no' },
  transmission: { fluid_level_ok: 'yes', visible_fluid_leak: 'no', warning_light_on: 'no' },
  suspension_steering: { steering_free_play_ok: 'yes', tracks_straight: 'yes', visible_shock_leak: 'no', power_steering_warning_on: 'no' },
  tires_wheels: { wheel_nuts_tight: 'yes' },
  cooling: { coolant_level_ok: 'yes', visible_coolant_leak: 'no', fan_operates: 'yes', temperature_warning_on: 'no' },
  air_conditioning: { cools_cabin: 'yes', compressor_engages: 'yes', airflow_normal: 'yes', cabin_filter_clean: 'yes' },
}

// Not asked on screen because a symptom with the same screening rule records it.
// Any stored answer is still submitted and shown in results.
export const HIDDEN_QUESTIONS = {
  engine: ['starts_normally'],
  air_conditioning: ['cools_cabin'],
}

export function visibleQuestions(category) {
  const hidden = HIDDEN_QUESTIONS[category.key] || []
  return category.questions.filter((question) => !hidden.includes(question.key))
}

export function hiddenQuestionTexts(category) {
  const hidden = HIDDEN_QUESTIONS[category.key] || []
  return category.questions.filter((question) => hidden.includes(question.key)).map((question) => question.text)
}

const RATED = ['excellent', 'good', 'fair', 'poor', 'critical']
export const LOW_RATINGS = ['fair', 'poor', 'critical']

/** Details that live under Add details. */
export function hasDetails(component) {
  return component.symptoms.length > 0 || Object.keys(component.measurements).length > 0
    || Object.values(component.measurementModes).some((mode) => mode !== 'value')
    || component.fault_codes.trim() !== '' || Boolean(component.last_maintenance_date) || component.notes.trim() !== ''
}

/**
 * The backend's data sufficiency rule (ComponentMaintenanceRules::screen_component):
 * a rated category is sufficient when answers other than Unknown cover at least half
 * of all its catalog questions, including any not shown here.
 */
export function answerSufficiency(category, component) {
  const total = category.questions.length
  const known = Object.values(component.answers).filter((answer) => answer && answer !== 'unknown').length
  const needed = Math.max(0, Math.ceil(total / 2) - known)
  const observed = Object.keys(component.answers).length > 0 || hasDetails(component)
  if (component.rating === 'not_applicable') return { status: 'not_applicable', known, total, needed: 0 }
  if (component.rating === 'not_assessed' && !observed) return { status: 'not_assessed', known, total, needed }
  if (!RATED.includes(component.rating)) return { status: 'needs_more', known, total, needed }
  return { status: known * 2 >= total ? 'sufficient' : 'needs_more', known, total, needed }
}

export const SUFFICIENCY_STATES = {
  sufficient: { label: 'Sufficient information', short: 'Sufficient', tone: 'good' },
  needs_more: { label: 'Needs more information', short: 'Needs more info', tone: 'fair' },
  not_assessed: { label: 'Not assessed', short: 'Not rated', tone: 'not-assessed' },
  not_applicable: { label: 'Not applicable', short: 'N/A', tone: 'na' },
}

// Display order only: safety-critical categories first, the rest in catalog order.
// Category keys, payloads and saved data are unchanged.
const SAFETY_FIRST = ['brakes', 'tires_wheels', 'suspension_steering', 'cooling']

export function safetyFirst(catalog) {
  const rank = (key) => (SAFETY_FIRST.includes(key) ? SAFETY_FIRST.indexOf(key) : SAFETY_FIRST.length)
  const categories = catalog.categories.map((category, index) => ({ category, index }))
    .sort((a, b) => rank(a.category.key) - rank(b.category.key) || a.index - b.index)
    .map(({ category }) => category)
  return { ...catalog, categories }
}

/**
 * The most recent recorded rating for a category on this vehicle: from the latest
 * assessment, or from the one before it when the latest did not rate the category.
 */
export function previousRating(latest, categoryKey) {
  if (!latest) return null
  const own = latest.components?.[categoryKey]?.rating
  if (own && own !== 'not_assessed') return { rating: own, date: latest.assessed_on || null }
  const earlier = latest.comparison?.categories?.[categoryKey]?.previous_rating
  if (earlier && earlier !== 'not_assessed') return { rating: earlier, date: latest.comparison.previous_assessed_on || null }
  return null
}
