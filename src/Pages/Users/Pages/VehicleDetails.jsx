import { useEffect, useRef, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import './VehicleDetails.css'

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function photosOf(car) {
  const photos = [...(car?.images || [])]
  if (car?.primary_image && !photos.some((photo) => photo.image_path === car.primary_image)) {
    photos.unshift({ id: 'primary', image_path: car.primary_image, variant_id: null })
  }
  return photos
}

function swatchColor(name) {
  const value = String(name || '').trim().toLowerCase().replace(/\s+/g, '')
  return value && window.CSS?.supports?.('color', value) ? value : ''
}

function stockLabel(stock) {
  return Number(stock) > 0 ? `${stock} in stock` : 'Out of stock'
}

function ChevronIcon({ direction }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={direction === 'left' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} /></svg>
}

function CarIcon() {
  return <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" /><path d="M3 11h18v7H3zM6 18v2m12-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></svg>
}

export default function VehicleDetails({ carId, navigate }) {
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(Boolean(carId))
  const [error, setError] = useState('')
  const [selectedVariantId, setSelectedVariantId] = useState(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedPaths, setFailedPaths] = useState([])
  const thumbsRef = useRef(null)

  useEffect(() => {
    let active = true
    if (!carId) return undefined
    api.get(`/api/cars/${carId}`)
      .then((response) => {
        if (!active) return
        const loaded = response?.data || null
        setCar(loaded)
        const options = loaded?.variants || []
        const first = options.find((option) => Number(option.stock) > 0) || options[0]
        setSelectedVariantId(first ? first.id : null)
      })
      .catch((requestError) => {
        if (active) {
          setCar(null)
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [carId])

  const variants = car?.variants || []
  const selectedVariant = variants.find((option) => option.id === selectedVariantId) || null
  const usablePhotos = photosOf(car).filter((photo) => !failedPaths.includes(photo.image_path))
  // A colour shows its own photos first, then the photos that apply to every colour.
  const visiblePhotos = selectedVariant
    ? [
        ...usablePhotos.filter((photo) => photo.variant_id === selectedVariant.id),
        ...usablePhotos.filter((photo) => photo.variant_id === null),
      ]
    : usablePhotos
  const currentIndex = Math.min(activeIndex, Math.max(0, visiblePhotos.length - 1))
  const currentPhoto = visiblePhotos[currentIndex]
  const hasManyPhotos = visiblePhotos.length > 1
  // Arrows change the colour when there is a choice of colours. Thumbnails pick photos within it.
  const browsesColors = variants.length > 1
  const showArrows = browsesColors || hasManyPhotos
  const outOfStock = Boolean(selectedVariant) && Number(selectedVariant.stock) === 0
  const canReserve = car?.status === 'available' && !outOfStock
  const selectedPosition = variants.findIndex((option) => option.id === selectedVariantId) + 1
  // A car with no colours is a single unit, the same way the backend counts it.
  const stockText = car?.status !== 'available'
    ? 'Currently unavailable'
    : selectedVariant
      ? stockLabel(selectedVariant.stock)
      : stockLabel(1)
  const hasStock = car?.status === 'available' && !outOfStock

  useEffect(() => {
    const thumb = thumbsRef.current?.querySelector('[aria-current="true"]')
    if (thumb && thumb.scrollIntoView) thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentIndex, selectedVariantId])

  const showPhoto = (index) => {
    if (!visiblePhotos.length) return
    setActiveIndex((index + visiblePhotos.length) % visiblePhotos.length)
  }

  const chooseVariant = (variant) => {
    setSelectedVariantId(variant.id)
    setActiveIndex(0)
  }

  const step = (delta) => {
    if (browsesColors) {
      const index = variants.findIndex((option) => option.id === selectedVariantId)
      chooseVariant(variants[(index + delta + variants.length) % variants.length])
    } else {
      showPhoto(currentIndex + delta)
    }
  }

  const onGalleryKey = (event) => {
    if (!showArrows) return
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      step(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      step(1)
    }
  }

  const reserve = () => {
    const query = new URLSearchParams({ car_id: car.id })
    if (selectedVariant) query.set('variant_id', selectedVariant.id)
    navigate(`/users/reservations/create?${query}`)
  }

  if (loading) {
    return <div className="public-page content-width"><div className="loading-state"><span className="spinner" />Loading vehicle details…</div></div>
  }

  if (!car) {
    return <div className="public-page content-width"><div className="empty-state" role={error ? 'alert' : 'status'}><h3>{error ? 'Unable to load vehicle' : 'Vehicle not found'}</h3><p>{error || 'This vehicle may no longer be available.'}</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Back to fleet</button></div></div>
  }

  const carName = `${car.make} ${car.model}`
  const photoLabel = selectedVariant ? `${selectedVariant.color} ${carName}` : carName

  return (
    <div className="public-page content-width vd">
      <button className="vd-back" type="button" onClick={() => navigate('/users/vehicles')}><span aria-hidden="true">←</span> Back to vehicles</button>

      <div className="vd-grid">
        <section className="vd-gallery" aria-label={`${carName} photos`} onKeyDown={onGalleryKey}>
          <div className="vd-main-photo">
            {currentPhoto ? (
              <img
                key={currentPhoto.image_path}
                src={imageUrl(currentPhoto.image_path)}
                alt={`${photoLabel}, photo ${currentIndex + 1} of ${visiblePhotos.length}`}
                onError={() => setFailedPaths((paths) => [...paths, currentPhoto.image_path])}
              />
            ) : (
              <div className="vd-no-photo vehicle-placeholder">
                {/suv|crossover|utility|hatch|van|mpv|pick-?up|truck|sedan|coupe|compact|economy|luxury|sport/i.test(String(car.category || '')) ? <CarSilhouette category={car.category} /> : <CarIcon />}
                <small>{selectedVariant ? `No photos of ${selectedVariant.color} yet` : 'Photo coming soon'}</small>
              </div>
            )}
            {showArrows && (
              <>
                <button className="vd-nav vd-nav-prev" type="button" aria-label={browsesColors ? 'Previous colour' : 'Previous photo'} onClick={() => step(-1)}><ChevronIcon direction="left" /></button>
                <button className="vd-nav vd-nav-next" type="button" aria-label={browsesColors ? 'Next colour' : 'Next photo'} onClick={() => step(1)}><ChevronIcon direction="right" /></button>
              </>
            )}
            {selectedVariant && (
              <span className="vd-color-tag">{selectedVariant.color}</span>
            )}
            {hasManyPhotos && <span className="vd-counter" aria-hidden="true">{currentIndex + 1} / {visiblePhotos.length}</span>}
          </div>

          {hasManyPhotos && (
            <div className="vd-thumbs" ref={thumbsRef}>
              {visiblePhotos.map((photo, index) => (
                <button
                  className="vd-thumb"
                  type="button"
                  key={photo.image_path}
                  aria-label={`Show photo ${index + 1} of ${visiblePhotos.length}`}
                  aria-current={index === currentIndex ? 'true' : undefined}
                  onClick={() => showPhoto(index)}
                >
                  <img
                    src={imageUrl(photo.image_path)}
                    alt=""
                    loading="lazy"
                    onError={() => setFailedPaths((paths) => [...paths, photo.image_path])}
                  />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="vd-info">
          <span className="vd-kicker">{[car.category, car.year].filter(Boolean).join(' · ') || 'Vehicle'}</span>
          <h1>{carName}</h1>
          {car.year && <p className="vd-subtitle">{[car.year, car.category].filter(Boolean).join(' · ')}</p>}

          <div className="vd-price">
            <div className="vd-price-amount">
              <b>{money(car.daily_rental_price)}</b>
              <span>/ day</span>
            </div>
            <p className={`vd-stock${hasStock ? '' : ' is-out'}`} aria-live="polite">
              <i aria-hidden="true" />
              {stockText}{selectedVariant && car.status === 'available' ? ` · ${selectedVariant.color}` : ''}
            </p>
          </div>

          {variants.length > 0 && (
            <div className="vd-colors">
              <div className="vd-color-head">
                <div className="vd-row-label">
                  <span>Colour</span>
                  {selectedVariant && <b>{selectedVariant.color}</b>}
                  {browsesColors && <small>{selectedPosition} of {variants.length}</small>}
                </div>
              </div>
              <div className="vd-color-list" role="group" aria-label="Choose a colour">
                {variants.map((variant) => {
                  const photo = usablePhotos.find((item) => item.variant_id === variant.id)
                  const swatch = swatchColor(variant.color)
                  const unavailable = Number(variant.stock) === 0
                  return (
                    <button
                      className={`vd-color${unavailable ? ' is-out' : ''}`}
                      type="button"
                      key={variant.id}
                      aria-pressed={variant.id === selectedVariantId}
                      onClick={() => chooseVariant(variant)}
                    >
                      <span className="vd-color-media" style={!photo && swatch ? { background: swatch } : undefined}>
                        {photo && <img src={imageUrl(photo.image_path)} alt="" loading="lazy" />}
                      </span>
                      <span className="vd-color-text">
                        <b>{variant.color}</b>
                        <small>{stockLabel(variant.stock)}</small>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <p className="vd-description">{car.description || 'Comfortable and ready for the road.'}</p>

          <dl className="vd-specs">
            <div><dt>Transmission</dt><dd>{car.transmission || 'Automatic'}</dd></div>
            <div><dt>Fuel</dt><dd>{car.fuel_type || 'Gasoline'}</dd></div>
            <div><dt>Seats</dt><dd>{car.seating_capacity || 5}</dd></div>
          </dl>

          <button className="vd-reserve" type="button" disabled={!canReserve} onClick={reserve}>
            {car.status !== 'available'
              ? 'Currently unavailable'
              : outOfStock
                ? `${selectedVariant.color} is out of stock`
                : selectedVariant
                  ? `Reserve ${selectedVariant.color} ${car.model}`
                  : 'Reserve this vehicle'}
          </button>
        </aside>
      </div>
    </div>
  )
}
