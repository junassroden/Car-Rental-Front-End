import { useEffect, useMemo, useRef, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import { FuelIcon, GearboxIcon, SeatsIcon } from '../Components/VehicleSpecIcons.jsx'
import './VehicleRecommendations.css'
import { carPhoto as fittedPhoto } from '../Components/carPhoto.js'

const DAY_MS = 86400000
// The API's largest page.
const FLEET_PAGE_SIZE = 48
// The same limits the reservation page and backend apply.
const MINIMUM_RENTAL_DAYS = 3
const STANDARD_MAXIMUM_DAYS = 7
const SPECIAL_MAXIMUM_DAYS = 21
const SKELETON_ROWS = [1, 2, 3]

const PURPOSES = ['Personal Travel', 'Business', 'Family Trip', 'Special Occasion']
const VEHICLE_PREFERENCES = { category: '', minBudget: '', maxBudget: '', transmission: '', fuel: '', feature: '' }
const INITIAL_PREFERENCES = { purpose: PURPOSES[0], passengers: '2', pickupDate: '', returnDate: '', ...VEHICLE_PREFERENCES }

function localDateString() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function addDays(day, count) {
  return new Date(Date.parse(day) + count * DAY_MS).toISOString().slice(0, 10)
}

function daysBetween(start, end) {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS)
}

function formatDay(day) {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${day}T00:00:00`))
}

function plural(count, word) {
  return `${count} ${word}${Number(count) === 1 ? '' : 's'}`
}

function carPhoto(car) {
  const path = car?.primary_image || car?.images?.[0]?.image_path
  return path ? imageUrl(path) : ''
}

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function budgetLabel({ minBudget, maxBudget }) {
  if (minBudget && maxBudget) return `${money(minBudget)} to ${money(maxBudget)} a day`
  if (maxBudget) return `Up to ${money(maxBudget)} a day`
  if (minBudget) return `From ${money(minBudget)} a day`
  return ''
}

function featuresFor(car) {
  let extras = car?.additional_features || []
  if (typeof extras === 'string') {
    try { extras = JSON.parse(extras) } catch { extras = extras.split(',').map((item) => item.trim()) }
  }
  const features = Array.isArray(extras) ? [...extras] : []
  if (Number(car?.air_conditioning)) features.unshift('Air conditioning')
  if (Number(car?.gps_navigation)) features.unshift('GPS navigation')
  return [...new Set(features.filter(Boolean))]
}

function suitsPurpose(car, purpose) {
  if (purpose === 'Family Trip') return Number(car.seating_capacity || 0) >= 5
  if (purpose === 'Business') return ['Sedan', 'SUV'].includes(car.category)
  return false
}

/** Only what this car actually offers against what the customer asked for, most specific first. */
function reasonsFor(car, preferences, { lowestPrice, fewestSeats }) {
  const reasons = []
  if (suitsPurpose(car, preferences.purpose)) reasons.push(preferences.purpose === 'Family Trip' ? 'Suits a family trip' : 'Suits business travel')
  if (preferences.category && car.category === preferences.category) reasons.push(`${preferences.category}, as you asked`)
  if (preferences.transmission && car.transmission === preferences.transmission) reasons.push(`${preferences.transmission} transmission`)
  if (preferences.fuel && car.fuel_type === preferences.fuel) reasons.push(`Runs on ${preferences.fuel.toLowerCase()}`)
  if (preferences.feature && featuresFor(car).includes(preferences.feature)) reasons.push(`Includes ${preferences.feature.toLowerCase()}`)
  if (preferences.minBudget || preferences.maxBudget) reasons.push('Within your budget')
  if (Number(car.daily_rental_price || 0) === lowestPrice) reasons.push('Lowest daily rate of your matches')
  if (Number(car.seating_capacity || 0) === fewestSeats) reasons.push('Closest in size to your group')
  reasons.push(`Room for ${plural(preferences.passengers, 'passenger')}`)
  return reasons
}

/** Best match: suits the trip's purpose, then has the fewest empty seats, then costs least. */
function compareCars(preferences) {
  return (left, right) => (
    Number(suitsPurpose(right, preferences.purpose)) - Number(suitsPurpose(left, preferences.purpose))
    || Number(left.seating_capacity || 0) - Number(right.seating_capacity || 0)
    || Number(left.daily_rental_price || 0) - Number(right.daily_rental_price || 0)
  )
}

function matchesPreferences(car, preferences, rentalDays) {
  const price = Number(car.daily_rental_price || 0)
  return Number(car.seating_capacity || 0) >= Number(preferences.passengers)
    && rentalDays >= Number(car.minimum_rental_duration || 1)
    && (!preferences.category || car.category === preferences.category)
    && (!preferences.minBudget || price >= Number(preferences.minBudget))
    && (!preferences.maxBudget || price <= Number(preferences.maxBudget))
    && (!preferences.transmission || car.transmission === preferences.transmission)
    && (!preferences.fuel || car.fuel_type === preferences.fuel)
    && (!preferences.feature || featuresFor(car).includes(preferences.feature))
}

function validate(preferences, today) {
  const errors = {}
  const { pickupDate, returnDate, minBudget, maxBudget } = preferences
  if (!pickupDate) errors.pickupDate = 'Choose a pickup date.'
  else if (pickupDate < today) errors.pickupDate = 'Choose today or a later date.'
  if (!returnDate) errors.returnDate = 'Choose a return date.'
  else if (pickupDate) {
    const days = daysBetween(pickupDate, returnDate)
    if (days < MINIMUM_RENTAL_DAYS) errors.returnDate = `Rentals are at least ${MINIMUM_RENTAL_DAYS} days.`
    else if (days > SPECIAL_MAXIMUM_DAYS) errors.returnDate = `Rentals can't be longer than ${SPECIAL_MAXIMUM_DAYS} days.`
  }
  if (minBudget && maxBudget && Number(minBudget) > Number(maxBudget)) errors.maxBudget = 'This must be at least your minimum.'
  return errors
}

function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500" /></svg>
}

function FinderSkeleton() {
  return (
    <div className="vr-card vr-form vr-skeleton" role="status" aria-label="Loading the vehicle finder">
      {SKELETON_ROWS.map((key) => <div className="vr-fields" key={key} aria-hidden="true"><span /><span /><span /></div>)}
    </div>
  )
}

function CarPhoto({ car, name, onClick }) {
  const photo = carPhoto(car)
  return (
    <button type="button" className="vr-photo" onClick={onClick} aria-label={`View ${name} details`}>
      <span className="vr-photo-empty" aria-hidden="true">
        <CarSilhouette category={car.category} />
        <small>Photo coming soon</small>
      </span>
      {photo && <img {...fittedPhoto(photo)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />}
    </button>
  )
}

function VehicleMatch({ car, preferences, rentalDays, standouts, featured, navigate }) {
  const name = `${car.make} ${car.model}`
  const meta = [car.category, car.year].filter(Boolean).join(' · ')
  const reasons = reasonsFor(car, preferences, standouts).slice(0, featured ? 4 : 2)
  const openDetails = () => navigate(`/users/vehicles/${car.id}`)
  const reserve = () => navigate(`/users/reservations/create?${new URLSearchParams({
    car_id: car.id,
    start_date: preferences.pickupDate,
    end_date: preferences.returnDate,
  })}`)

  return (
    <article className={`vr-card vr-match${featured ? ' vr-match-featured' : ''}`}>
      <CarPhoto car={car} name={name} onClick={openDetails} />
      <div className="vr-match-body">
        {featured && <span className="vr-best">Best match</span>}
        <div className="vr-match-head">
          <div>
            {featured ? <h3 className="vr-match-title-large">{name}</h3> : <h3>{name}</h3>}
            {meta && <p>{meta}</p>}
          </div>
          <div className="vr-price">
            <b>{money(car.daily_rental_price)}</b>
            <small>per day</small>
          </div>
        </div>
        <ul className="vr-specs" aria-label="Vehicle specifications">
          {car.transmission && <li><GearboxIcon />{car.transmission}</li>}
          {car.fuel_type && <li><FuelIcon />{car.fuel_type}</li>}
          {car.seating_capacity && <li><SeatsIcon />{plural(car.seating_capacity, 'seat')}</li>}
        </ul>
        <ul className="vr-reasons" aria-label="Why it fits">
          {reasons.map((reason) => <li key={reason}><CheckIcon />{reason}</li>)}
        </ul>
        <p className="vr-total">{money(Number(car.daily_rental_price || 0) * rentalDays)} for {plural(rentalDays, 'day')}</p>
        <div className="vr-actions">
          <button type="button" className="vr-details" onClick={openDetails} aria-label={`View ${name} details`}>View details</button>
          <button type="button" className="vr-btn vr-btn-primary" onClick={reserve} aria-label={`Reserve ${name}`}>Reserve</button>
        </div>
      </div>
    </article>
  )
}

export default function VehicleRecommendations({ navigate }) {
  const [fleet, setFleet] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [preferences, setPreferences] = useState(INITIAL_PREFERENCES)
  const [errors, setErrors] = useState({})
  const [searchError, setSearchError] = useState('')
  const [checking, setChecking] = useState(false)
  // The cars free on the searched dates are kept apart from the fleet, so the form's options never shrink.
  const [search, setSearch] = useState(null)
  const formRef = useRef(null)
  const resultsHeadingRef = useRef(null)
  const shouldFocusResults = useRef(false)
  const today = useMemo(() => localDateString(), [])

  useEffect(() => {
    let active = true
    api.get(`/api/cars/available?per_page=${FLEET_PAGE_SIZE}`)
      .then((response) => { if (active) setFleet(response?.data || []) })
      .catch((requestError) => { if (active) setLoadError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])

  useEffect(() => {
    if (!search || !shouldFocusResults.current) return
    shouldFocusResults.current = false
    resultsHeadingRef.current?.focus({ preventScroll: true })
    resultsHeadingRef.current?.scrollIntoView({ block: 'start' })
  }, [search])

  const categories = useMemo(() => [...new Set(fleet.map((car) => car.category).filter(Boolean))].sort(), [fleet])
  const transmissions = useMemo(() => [...new Set(fleet.map((car) => car.transmission).filter(Boolean))].sort(), [fleet])
  const fuels = useMemo(() => [...new Set(fleet.map((car) => car.fuel_type).filter(Boolean))].sort(), [fleet])
  const features = useMemo(() => [...new Set(fleet.flatMap(featuresFor))].sort(), [fleet])
  const maxSeats = useMemo(() => Math.max(1, ...fleet.map((car) => Number(car.seating_capacity || 0))), [fleet])

  const rentalDays = search ? daysBetween(search.preferences.pickupDate, search.preferences.returnDate) : 0
  const matches = useMemo(() => {
    if (!search) return []
    return search.cars
      .filter((car) => matchesPreferences(car, search.preferences, rentalDays))
      .sort(compareCars(search.preferences))
  }, [rentalDays, search])
  // Comparing against the other matches only means something when there are others.
  const standouts = matches.length > 1 ? {
    lowestPrice: Math.min(...matches.map((car) => Number(car.daily_rental_price || 0))),
    fewestSeats: Math.min(...matches.map((car) => Number(car.seating_capacity || 0))),
  } : {}
  const [best, ...alternatives] = matches

  const optionalCount = [preferences.transmission, preferences.fuel, preferences.feature].filter(Boolean).length
  const hasVehiclePreferences = Object.keys(VEHICLE_PREFERENCES).some((name) => preferences[name])
  const pickupDay = preferences.pickupDate
  const chosenDays = pickupDay && preferences.returnDate ? daysBetween(pickupDay, preferences.returnDate) : 0

  function updatePreference(event) {
    const { name, value } = event.target
    setPreferences((current) => ({ ...current, [name]: value }))
    setSearchError('')
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  function fieldProps(name) {
    return {
      name,
      value: preferences[name],
      onChange: updatePreference,
      'aria-invalid': errors[name] ? 'true' : undefined,
      'aria-describedby': errors[name] ? `vr-error-${name}` : undefined,
    }
  }

  const renderError = (name) => errors[name] && <small className="vr-error" id={`vr-error-${name}`}>{errors[name]}</small>

  async function submitPreferences(event) {
    event.preventDefault()
    setSearchError('')
    const problems = validate(preferences, today)
    setErrors(problems)
    const firstProblem = ['pickupDate', 'returnDate', 'maxBudget'].find((name) => problems[name])
    if (firstProblem) {
      formRef.current?.elements[firstProblem]?.focus()
      return
    }

    setChecking(true)
    try {
      const query = new URLSearchParams({
        per_page: String(FLEET_PAGE_SIZE),
        start_date: preferences.pickupDate,
        end_date: preferences.returnDate,
      })
      const response = await api.get(`/api/cars/available?${query}`)
      shouldFocusResults.current = true
      setSearch({ cars: response?.data || [], preferences: { ...preferences } })
    } catch (requestError) {
      setSearchError(requestError.message)
    } finally {
      setChecking(false)
    }
  }

  function changePreferences() {
    formRef.current?.scrollIntoView({ block: 'start' })
    formRef.current?.elements.pickupDate?.focus({ preventScroll: true })
  }

  /** Keeps the trip, and shows every car free on those dates. */
  function clearVehiclePreferences() {
    setPreferences((current) => ({ ...current, ...VEHICLE_PREFERENCES }))
    setErrors({})
    setSearch((current) => current && { ...current, preferences: { ...current.preferences, ...VEHICLE_PREFERENCES } })
  }

  function retry() {
    setLoadError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  const submitted = search?.preferences
  const summary = submitted && [
    `${formatDay(submitted.pickupDate)} to ${formatDay(submitted.returnDate)}`,
    submitted.purpose,
    plural(submitted.passengers, 'passenger'),
    submitted.category,
    budgetLabel(submitted),
    submitted.transmission,
    submitted.fuel,
    submitted.feature,
  ].filter(Boolean)

  return (
    <div className="public-page content-width vr">
      <header className="vr-header">
        <span className="vr-eyebrow">Vehicle finder</span>
        <h1>Find the right car for your trip</h1>
        <p>Tell us your dates and what you need. We'll check what's free and suggest the closest fit.</p>
      </header>

      {loading ? <FinderSkeleton /> : loadError ? (
        <div className="vr-card vr-state" role="alert">
          <h2>We couldn't load the vehicle finder</h2>
          <p>{loadError}</p>
          <button type="button" className="vr-btn vr-btn-primary" onClick={retry}>Try again</button>
        </div>
      ) : !fleet.length ? (
        <div className="vr-card vr-state">
          <h2>No vehicles available right now</h2>
          <p>Please check back soon to see vehicles as they become available.</p>
        </div>
      ) : (
        <>
          <form className="vr-card vr-form" ref={formRef} onSubmit={submitPreferences} noValidate>
            <fieldset className="vr-purpose">
              <legend>What's the trip for?</legend>
              <div>
                {PURPOSES.map((purpose) => (
                  <label key={purpose} className={preferences.purpose === purpose ? 'selected' : undefined}>
                    <input type="radio" name="purpose" value={purpose} checked={preferences.purpose === purpose} onChange={updatePreference} />
                    {purpose}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="vr-fields">
              <label className="vr-field">
                <span>Pickup date</span>
                <input {...fieldProps('pickupDate')} type="date" min={today} />
                {renderError('pickupDate')}
              </label>
              <label className="vr-field">
                <span>Return date</span>
                <input
                  {...fieldProps('returnDate')}
                  type="date"
                  min={pickupDay ? addDays(pickupDay, MINIMUM_RENTAL_DAYS) : today}
                  max={pickupDay ? addDays(pickupDay, SPECIAL_MAXIMUM_DAYS) : undefined}
                />
                {renderError('returnDate')}
                {!errors.returnDate && chosenDays > STANDARD_MAXIMUM_DAYS && chosenDays <= SPECIAL_MAXIMUM_DAYS && <small>Rentals over {STANDARD_MAXIMUM_DAYS} days need administrator approval.</small>}
              </label>
              <label className="vr-field">
                <span>Passengers</span>
                <select {...fieldProps('passengers')}>
                  {Array.from({ length: maxSeats }, (_, index) => String(index + 1)).map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              <label className="vr-field">
                <span>Category</span>
                <select {...fieldProps('category')}>
                  <option value="">Any</option>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="vr-field">
                <span>Lowest daily rate</span>
                <div className="vr-money"><b aria-hidden="true">₱</b><input {...fieldProps('minBudget')} type="number" min="0" step="100" placeholder="No minimum" /></div>
              </label>
              <label className="vr-field">
                <span>Highest daily rate</span>
                <div className="vr-money"><b aria-hidden="true">₱</b><input {...fieldProps('maxBudget')} type="number" min="0" step="100" placeholder="No maximum" /></div>
                {renderError('maxBudget')}
              </label>
            </div>

            <details className="vr-more">
              <summary>More preferences{optionalCount > 0 && ` (${optionalCount} selected)`}</summary>
              <div className="vr-fields">
                <label className="vr-field">
                  <span>Transmission</span>
                  <select {...fieldProps('transmission')}>
                    <option value="">Any</option>
                    {transmissions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="vr-field">
                  <span>Fuel type</span>
                  <select {...fieldProps('fuel')}>
                    <option value="">Any</option>
                    {fuels.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label className="vr-field">
                  <span>Feature</span>
                  <select {...fieldProps('feature')}>
                    <option value="">Any</option>
                    {features.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
              </div>
            </details>

            {searchError && <p className="vr-search-error" role="alert">{searchError}</p>}
            <div className="vr-form-foot">
              <p>Matches come from your preferences and live availability. They aren't AI-generated.</p>
              <div>
                {hasVehiclePreferences && <button type="button" className="vr-details" onClick={clearVehiclePreferences}>Clear preferences</button>}
                <button type="submit" className="vr-btn vr-btn-primary" disabled={checking}>{checking ? 'Checking availability…' : submitted ? 'Update results' : 'Find my car'}</button>
              </div>
            </div>
          </form>

          {search && (
            <section className="vr-results" aria-label="Your matches">
              <div className="vr-results-head">
                <div>
                  <h2 ref={resultsHeadingRef} tabIndex={-1}>{!matches.length ? 'No matches for your trip' : matches.length === 1 ? '1 match for your trip' : `${matches.length} matches for your trip`}</h2>
                  <ul className="vr-summary" aria-label="What you searched for">
                    {summary.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <button type="button" className="vr-btn vr-btn-outline" onClick={changePreferences}>Change preferences</button>
              </div>

              {best ? (
                <>
                  <VehicleMatch car={best} preferences={submitted} rentalDays={rentalDays} standouts={standouts} featured navigate={navigate} />
                  {alternatives.length > 0 && (
                    <>
                      <h2 className="vr-more-title">Other good options</h2>
                      <div className="vr-grid">
                        {alternatives.map((car) => <VehicleMatch key={car.id} car={car} preferences={submitted} rentalDays={rentalDays} standouts={standouts} navigate={navigate} />)}
                      </div>
                    </>
                  )}
                </>
              ) : search.cars.length ? (
                <div className="vr-card vr-state">
                  <h3>{plural(search.cars.length, 'vehicle')} {search.cars.length === 1 ? 'is' : 'are'} free on those dates, but none fit everything</h3>
                  <p>Clear your vehicle preferences to see them, or try fewer passengers.</p>
                  <button type="button" className="vr-btn vr-btn-primary" onClick={clearVehiclePreferences}>Clear preferences</button>
                </div>
              ) : (
                <div className="vr-card vr-state">
                  <h3>Nothing is free on those dates</h3>
                  <p>Try different pickup or return dates to see more of the fleet.</p>
                  <button type="button" className="vr-btn vr-btn-primary" onClick={changePreferences}>Change dates</button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
