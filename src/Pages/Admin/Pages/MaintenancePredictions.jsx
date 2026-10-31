import { useCallback, useEffect, useState } from 'react'
import { getFleetVehicles } from '../../../Services/API/maintenanceAPI.js'
import VehicleSelector from '../Components/maintenance3d/VehicleSelector.jsx'
import VehicleInspection from '../Components/maintenance3d/VehicleInspection.jsx'
import FleetServiceNeeds from '../Components/maintenance3d/FleetServiceNeeds.jsx'
import './MaintenancePredictions.css'

function vehicleFromUrl() {
  const value = Number(new URLSearchParams(window.location.search).get('vehicle'))
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * /admin/maintenance/predictions: pick a fleet vehicle, then inspect its
 * components in 3D. The selected vehicle lives in ?vehicle= so refresh and the
 * browser back button behave as expected.
 */
export default function MaintenancePredictions({ navigate }) {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehicleId, setVehicleId] = useState(vehicleFromUrl)

  const loadFleet = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setVehicles(await getFleetVehicles())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadFleet)
  }, [loadFleet])

  useEffect(() => {
    const onPopState = () => setVehicleId(vehicleFromUrl())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openVehicle(id) {
    window.history.pushState({ pmVehicle: id }, '', `${window.location.pathname}?vehicle=${id}`)
    setVehicleId(id)
  }

  function backToFleet() {
    if (window.history.state?.pmVehicle) window.history.back()
    else {
      window.history.replaceState({}, '', window.location.pathname)
      setVehicleId(null)
    }
  }

  return (
    <div className="admin-content pm-page">
      {vehicleId ? (
        <VehicleInspection key={vehicleId} vehicleId={vehicleId} onBack={backToFleet} />
      ) : loading ? (
        <div className="pm-page-state" role="status"><span className="pm-spinner" />Loading fleet…</div>
      ) : error ? (
        <div className="pm-page-state" role="alert">
          <h2>Could not load the fleet</h2>
          <p>{error}</p>
          <button type="button" className="is-primary" onClick={loadFleet}>Retry</button>
        </div>
      ) : vehicles.length ? (
        <>
          <FleetServiceNeeds onSelect={openVehicle} />
          <VehicleSelector vehicles={vehicles} onSelect={openVehicle} />
        </>
      ) : (
        <div className="pm-page-state" role="status">
          <h2>No vehicles in the fleet</h2>
          <p>Add a vehicle to the inventory before inspecting it.</p>
          <button type="button" className="is-primary" onClick={() => navigate('/admin/vehicles')}>Open vehicle inventory</button>
        </div>
      )}
    </div>
  )
}
