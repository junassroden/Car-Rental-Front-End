import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import { FuelIcon, GearboxIcon, OutlineIcon, SeatsIcon } from '../Components/VehicleSpecIcons.jsx'
import './VehicleListing.css'

// The API's largest page. Filtering happens here in the browser, so the whole fleet has to be loaded.
const FLEET_PAGE_SIZE = 48
const SKELETON_CARDS = [1, 2, 3]

function vehicleImage(car) {
  const path = car.primary_image || car.images?.[0]?.image_path
  return path ? imageUrl(path) : ''
}

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

const SearchIcon = ({ size }) => <OutlineIcon size={size}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.800-3.800" /></OutlineIcon>

function VehicleSkeletons() {
  return (
    <div className="fleet-grid" role="status" aria-label="Finding available vehicles">
      {SKELETON_CARDS.map((key) => <div className="fleet-skeleton" key={key} aria-hidden="true"><span /><i /><i /><i /></div>)}
    </div>
  )
}

const ArrowIcon = () => <OutlineIcon size={14}><path d="M5 12h14m-6-6 6 6-6 6" /></OutlineIcon>

function VehicleCard({ car, navigate }) {
  const name = `${car.make} ${car.model}`
  const photo = vehicleImage(car)
  const meta = [car.category, car.year].filter(Boolean).join(' · ')
  const openDetails = () => navigate(`/users/vehicles/${car.id}`)

  return (
    <article className="fleet-card">
      <button className="fleet-card-media" type="button" onClick={openDetails} aria-label={`View ${name} details`}>
        <span className="vehicle-placeholder" aria-hidden="true">
          <CarSilhouette category={car.category} />
          <small>Photo coming soon</small>
        </span>
        {photo && <img
          src={photo}
          alt={name}
          loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true }}
        />}
        <span className="status-pill status-available"><i />Available</span>
      </button>
      <div className="fleet-card-body">
        <div className="fleet-card-title">
          {meta && <span className="fleet-card-kicker">{meta}</span>}
          <h3>{name}</h3>
          {car.color && <span className="fleet-card-colour">{car.color}</span>}
        </div>
        <ul className="fleet-card-specs vl-specs" aria-label="Vehicle specifications">
          {car.transmission && <li><GearboxIcon />{car.transmission}</li>}
          {car.fuel_type && <li><FuelIcon />{car.fuel_type}</li>}
          {car.seating_capacity && <li><SeatsIcon />{car.seating_capacity} seats</li>}
        </ul>
        <div className="fleet-card-foot">
          <span className="fleet-card-price"><b>{money(car.daily_rental_price)}</b><small>per day</small></span>
          <div className="fleet-card-actions">
            <button type="button" className="fleet-card-details" onClick={openDetails} aria-label={`View ${name} details`}>Details</button>
            <button type="button" className="fleet-card-book" onClick={() => navigate(`/users/reservations/create?car_id=${car.id}`)} aria-label={`Reserve ${name}`}>Reserve<span className="button-icon"><ArrowIcon /></span></button>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function VehicleListing({ navigate }) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '')
  const [category, setCategory] = useState('')
  const [transmission, setTransmission] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('recommended')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.get(`/api/cars/available?per_page=${FLEET_PAGE_SIZE}`)
      .then((response) => {
        if (active) setCars(response?.data || [])
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt])

  const categories = useMemo(
    () => [...new Set(cars.map((car) => car.category).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [cars],
  )
  const transmissions = useMemo(
    () => [...new Set(cars.map((car) => car.transmission).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [cars],
  )
  const filteredCars = useMemo(() => {
    const term = search.trim().toLowerCase()
    const results = cars.filter((car) => {
      const searchable = `${car.make || ''} ${car.model || ''} ${car.category || ''} ${car.year || ''}`.toLowerCase()
      return (!term || searchable.includes(term))
        && (!category || car.category === category)
        && (!transmission || car.transmission === transmission)
        && (!maxPrice || Number(car.daily_rental_price || 0) <= Number(maxPrice))
    })
    return results.sort((left, right) => {
      if (sort === 'price-low') return Number(left.daily_rental_price || 0) - Number(right.daily_rental_price || 0)
      if (sort === 'price-high') return Number(right.daily_rental_price || 0) - Number(left.daily_rental_price || 0)
      if (sort === 'newest') return Number(right.year || 0) - Number(left.year || 0)
      if (sort === 'name') return `${left.make || ''} ${left.model || ''}`.localeCompare(`${right.make || ''} ${right.model || ''}`)
      return 0
    })
  }, [cars, category, maxPrice, search, sort, transmission])

  const hasFilters = Boolean(search || category || transmission || maxPrice)
  const showControls = !error && (loading || cars.length > 0)

  function clearFilters() {
    setSearch('')
    setCategory('')
    setTransmission('')
    setMaxPrice('')
    setSort('recommended')
  }

  function retry() {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

  return (
    <div className="public-page content-width vl">
      <header className="vl-header">
        <span className="vl-eyebrow">The available fleet</span>
        <h1>Choose your vehicle</h1>
        <p>Compare what's ready to rent, then reserve the one that fits your trip.</p>
      </header>

      {showControls && (
        <section className="vl-controls" aria-label="Filter vehicles">
          <div className="vl-filters">
            <label className="vl-field vl-field-search">
              <span>Search</span>
              <div className="vl-input">
                <SearchIcon />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Make, model, or year"
                />
              </div>
            </label>
            <label className="vl-field">
              <span>Transmission</span>
              <select value={transmission} onChange={(event) => setTransmission(event.target.value)}>
                <option value="">Any</option>
                {transmissions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="vl-field">
              <span>Max daily rate</span>
              <div className="vl-input">
                <b aria-hidden="true">₱</b>
                <input
                  type="number"
                  min="0"
                  step="100"
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(event) => setMaxPrice(event.target.value)}
                  placeholder="No limit"
                />
              </div>
            </label>
          </div>

          {loading && (
            <div className="vl-chips" aria-hidden="true">
              {SKELETON_CARDS.map((key) => <span className="vl-shimmer vl-chip-placeholder" key={key} />)}
            </div>
          )}
          {categories.length > 0 && (
            <div className="vl-chips" role="group" aria-label="Filter by vehicle category">
              <button type="button" className={!category ? 'selected' : ''} aria-pressed={!category} onClick={() => setCategory('')}>All <span>{cars.length}</span></button>
              {categories.map((value) => {
                const count = cars.filter((car) => car.category === value).length
                return <button type="button" key={value} className={category === value ? 'selected' : ''} aria-pressed={category === value} onClick={() => setCategory(category === value ? '' : value)}>{value} <span>{count}</span></button>
              })}
            </div>
          )}
        </section>
      )}

      {error ? (
        <div className="vl-state" role="alert">
          <h2>We couldn't load the fleet</h2>
          <p>{error}</p>
          <button type="button" className="vl-reserve" onClick={retry}>Try again</button>
        </div>
      ) : loading ? (
        <VehicleSkeletons />
      ) : filteredCars.length ? (
        <section aria-label="Available vehicles">
          <div className="vl-results-bar">
            <p aria-live="polite">
              {hasFilters ? <>Showing <b>{filteredCars.length}</b> of <b>{cars.length}</b> vehicles</> : <><b>{cars.length}</b> {cars.length === 1 ? 'vehicle' : 'vehicles'} ready to rent</>}
              {hasFilters && <button type="button" className="vl-clear" onClick={clearFilters}>Clear filters</button>}
            </p>
            <label className="vl-sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="recommended">Recommended</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
                <option value="newest">Newest year</option>
                <option value="name">Vehicle name</option>
              </select>
            </label>
          </div>
          <div className="fleet-grid">
            {filteredCars.map((car) => <VehicleCard key={car.id} car={car} navigate={navigate} />)}
          </div>
        </section>
      ) : (
        <div className="vl-state">
          <span className="vl-state-icon"><SearchIcon size={22} /></span>
          <h2>{cars.length ? 'No vehicles match those filters' : 'No vehicles available right now'}</h2>
          <p>{cars.length ? 'Try another search or clear a filter to see more of the fleet.' : 'Please check back soon to see vehicles as they become available.'}</p>
          {cars.length > 0 && <button type="button" className="vl-reserve" onClick={clearFilters}>Clear filters</button>}
        </div>
      )}
    </div>
  )
}
