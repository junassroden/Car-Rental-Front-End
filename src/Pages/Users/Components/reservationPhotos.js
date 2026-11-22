import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'

/**
 * Loads each reserved car's details once, so reservation cards can show a photo
 * even when the reservation itself carries no main photo (or that photo fails).
 * Returns { carId: car } as cars arrive.
 */
export function useReservationCars(reservations) {
  const [cars, setCars] = useState({})
  const carIds = useMemo(
    () => [...new Set((reservations || []).map((item) => item.car_id).filter(Boolean))].sort().join(','),
    [reservations],
  )

  useEffect(() => {
    if (!carIds) return undefined
    let active = true
    Promise.all(carIds.split(',').map((id) => api.get(`/api/cars/${id}`)
      .then((response) => [id, response?.data || null])
      .catch(() => [id, null])))
      .then((entries) => { if (active) setCars(Object.fromEntries(entries)) })
    return () => { active = false }
  }, [carIds])

  return cars
}

/**
 * Photos to try for a reservation, best first: the booked colour, the
 * reservation's main photo, the car's main photo, then its other photos.
 */
export function reservationPhotos(reservation, car) {
  const images = car?.images || []
  const variantId = reservation.variant_id == null ? null : Number(reservation.variant_id)
  const paths = [
    ...images.filter((image) => variantId !== null && Number(image.variant_id) === variantId).map((image) => image.image_path),
    reservation.primary_image,
    car?.primary_image,
    ...images.map((image) => image.image_path),
  ]
  return [...new Set(paths.filter(Boolean))].map(imageUrl)
}
