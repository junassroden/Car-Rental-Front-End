import FleetServiceNeeds from '../Components/maintenance3d/FleetServiceNeeds.jsx'
import ModelTrainingPanel from '../Components/maintenance3d/ModelTrainingPanel.jsx'
import { PmIcon } from '../Components/maintenance3d/AssessmentOverview.jsx'
import './MaintenancePredictions.css'
import './AssessmentWorkspace.css'

/** /admin/maintenance/model-management: technical model tooling, kept apart from the assessment workflow. */
export default function ModelManagement({ navigate }) {
  return (
    <div className="admin-content pm-page mm-page">
      <div className="am-overview">
        <button type="button" className="am-back" onClick={() => navigate('/admin/maintenance/predictions')}><PmIcon name="left" /> Predictive Maintenance</button>
        <header className="am-page-head mm-head">
          <h1>Model Management</h1>
        </header>
        <ModelTrainingPanel />
        <FleetServiceNeeds onSelect={(id) => navigate(`/admin/maintenance/predictions?vehicle=${id}&view=results`)} />
      </div>
    </div>
  )
}
