import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import VehicleModel from '../../Admin/Components/maintenance3d/VehicleModel.jsx'
import { paintColor, rigFor } from '../../Admin/Components/maintenance3d/rigs.js'

// The showroom only looks; nothing on the model is selectable.
const NO_INTERACTION = {
  selectedKey: null,
  hoveredKey: null,
  ghosted: new Set(),
  available: new Set(),
  onHover: () => {},
  onSelect: () => {},
}

const BODY_TYPES = {
  sedan: 'sedan',
  hatchback: 'sedan',
  coupe: 'sedan',
  suv: 'suv',
  crossover: 'suv',
  mpv: 'minivan',
  minivan: 'minivan',
  van: 'van',
  pickup: 'pickup',
  truck: 'pickup',
}

function bodyTypeOf(category) {
  return BODY_TYPES[String(category || '').trim().toLowerCase()] || 'sedan'
}

function Lighting() {
  return (
    <>
      <hemisphereLight intensity={0.35} color="#f6f4ec" groundColor="#7d8a80" />
      <directionalLight position={[4, 7, -4]} intensity={1.4} />
      <directionalLight position={[-5, 3, 4]} intensity={0.45} color="#ffe6cc" />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.6} position={[0, 7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[11, 4.5, 1]} />
        <Lightformer form="rect" intensity={1.9} position={[0, 2.6, -8]} scale={[17, 1.5, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[0, 2.2, 8]} rotation={[0, Math.PI, 0]} scale={[17, 1.3, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#ffe2c4" position={[9, 2.4, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[7, 1.8, 1]} />
        <Lightformer form="rect" intensity={1} position={[-9, 2.4, 0]} rotation={[0, Math.PI / 2, 0]} scale={[7, 1.6, 1]} />
      </Environment>
    </>
  )
}

/**
 * A slowly turning 3D car on a transparent stage. Drag to spin it.
 * Shape follows the vehicle category; paint follows its colour.
 */
export default function Showroom3D({ make, model, category, color, label = 'Rotatable 3D model of the vehicle' }) {
  const rig = useMemo(() => {
    const found = rigFor(bodyTypeOf(category), { make, model })
    // Coded shell only; the optional .glb assets are not shipped with the app.
    return found ? { ...found, asset: null } : null
  }, [category, make, model])
  const paint = useMemo(() => paintColor(color || 'silver'), [color])
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (!rig) return null
  const length = rig.spec?.length || 4.6
  const distance = length * 1.4

  return (
    <div className="showroom3d" role="img" aria-label={label}>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ position: [distance * 0.82, distance * 0.36, -distance * 0.92], fov: 30, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <Lighting />
          <group position={[0, -0.55, 0]}>
            <VehicleModel rig={rig} paint={paint} xray={false} interaction={NO_INTERACTION} />
            <ContactShadows position={[0, 0.004, 0]} opacity={0.5} scale={10} blur={2.4} far={2.2} resolution={512} frames={1} color="#1d2c28" />
          </group>
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          autoRotate={!reducedMotion}
          autoRotateSpeed={1.1}
          minPolarAngle={0.9}
          maxPolarAngle={1.45}
          target={[0, 0.1, 0]}
        />
      </Canvas>
      <span className="showroom3d-hint" aria-hidden="true">Drag to rotate</span>
    </div>
  )
}
