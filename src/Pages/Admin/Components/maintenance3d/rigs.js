// Parametric 3D rig definitions, one per body type the backend reports.
// Coordinates: +x is the front of the vehicle, +y is up, -z is the driver's
// left (the side the default camera looks at). Units are roughly metres.
//
// Every selectable component key the backend can return for a body type has
// an anchor here (hotspot + bubble position) and a focus view (camera
// direction and distance). The meshes in VehicleModel.jsx are tagged with the
// same keys, so a hotspot always selects geometry that exists in the model.

const CAR_SPECS = {
  sedan: {
    length: 4.6, width: 1.8, wheelRadius: 0.32, tireWidth: 0.22, clearance: 0.16,
    frontAxle: 1.38, rearAxle: -1.32, engine: [1.55, 0.56], engineSize: [0.58, 0.42, 0.62],
    profile: [[2.3, 0.34], [2.35, 0.54], [2.24, 0.7], [1.04, 0.91], [0.2, 1.39], [-0.55, 1.43], [-1.62, 1.03], [-2.22, 0.99], [-2.35, 0.74], [-2.3, 0.36]],
    windows: [[0.94, 0.97], [0.22, 1.34], [-0.52, 1.375], [-1.42, 1.03]],
    windshield: [[1.04, 0.91], [0.2, 1.39]],
    rearWindow: [[-0.55, 1.43], [-1.62, 1.03]],
    lamps: { front: 0.66, rear: 0.82 },
  },
  suv: {
    length: 4.7, width: 1.9, wheelRadius: 0.38, tireWidth: 0.25, clearance: 0.26,
    frontAxle: 1.42, rearAxle: -1.4, engine: [1.62, 0.72], engineSize: [0.6, 0.46, 0.66],
    profile: [[2.35, 0.42], [2.39, 0.72], [2.26, 0.97], [1.25, 1.08], [0.55, 1.68], [-2.05, 1.72], [-2.3, 1.45], [-2.37, 0.9], [-2.35, 0.45]],
    windows: [[1.17, 1.12], [0.57, 1.62], [-2.0, 1.65], [-2.22, 1.42], [-2.25, 1.12]],
    windshield: [[1.25, 1.08], [0.55, 1.68]],
    rearWindow: [[-2.05, 1.72], [-2.3, 1.45]],
    lamps: { front: 0.86, rear: 1.2 },
  },
  pickup: {
    length: 5.3, width: 1.95, wheelRadius: 0.4, tireWidth: 0.27, clearance: 0.32,
    frontAxle: 1.75, rearAxle: -1.5, engine: [1.95, 0.78], engineSize: [0.64, 0.48, 0.68],
    profile: [[2.65, 0.46], [2.69, 0.8], [2.55, 1.06], [1.45, 1.16], [0.8, 1.84], [-0.4, 1.86], [-0.5, 1.16], [-0.5, 0.46]],
    windows: [[1.38, 1.2], [0.82, 1.78], [-0.36, 1.8], [-0.44, 1.2]],
    windshield: [[1.45, 1.16], [0.8, 1.84]],
    rearWindow: null,
    bed: { front: -0.54, rear: -2.65, top: 1.16, floor: 0.62 },
    lamps: { front: 0.92, rear: 1.0 },
  },
  van: {
    length: 5.2, width: 2.0, wheelRadius: 0.36, tireWidth: 0.24, clearance: 0.24,
    frontAxle: 1.75, rearAxle: -1.6, engine: [2.0, 0.66], engineSize: [0.52, 0.44, 0.62],
    profile: [[2.6, 0.4], [2.63, 0.76], [2.46, 1.06], [1.86, 1.2], [1.35, 2.15], [-2.55, 2.2], [-2.63, 2.0], [-2.63, 0.42]],
    windows: [[1.8, 1.25], [1.37, 2.04], [0.62, 2.05], [0.62, 1.25]],
    windshield: [[1.86, 1.2], [1.35, 2.15]],
    rearWindow: null,
    lamps: { front: 0.9, rear: 1.15 },
  },
  minivan: {
    length: 5.0, width: 1.95, wheelRadius: 0.35, tireWidth: 0.23, clearance: 0.19,
    frontAxle: 1.55, rearAxle: -1.45, engine: [1.82, 0.62], engineSize: [0.56, 0.44, 0.64],
    profile: [[2.5, 0.4], [2.54, 0.7], [2.39, 0.93], [1.66, 1.05], [0.85, 1.73], [-2.1, 1.77], [-2.45, 1.5], [-2.53, 0.9], [-2.5, 0.42]],
    windows: [[1.58, 1.09], [0.87, 1.67], [-2.05, 1.7], [-2.37, 1.47], [-2.4, 1.1]],
    windshield: [[1.66, 1.05], [0.85, 1.73]],
    rearWindow: [[-2.1, 1.77], [-2.45, 1.5]],
    lamps: { front: 0.78, rear: 1.15 },
  },
}

// Toyota Fortuner (2nd generation, Philippine market): 4,795 L x 1,855 W x 1,835 H mm,
// 2,750 mm wheelbase, 265/60 R18 tyres. Used for the fallback shell and to scale the 3D asset.
const FORTUNER_SPEC = {
  length: 4.795, width: 1.855, wheelRadius: 0.39, tireWidth: 0.265, clearance: 0.22,
  frontAxle: 1.5, rearAxle: -1.25, engine: [1.72, 0.74], engineSize: [0.6, 0.46, 0.66],
  profile: [[2.38, 0.44], [2.42, 0.7], [2.39, 0.98], [2.24, 1.06], [1.3, 1.12], [0.6, 1.7], [-2.1, 1.78], [-2.33, 1.5], [-2.4, 0.92], [-2.38, 0.47]],
  windows: [[1.22, 1.16], [0.62, 1.64], [-2.05, 1.71], [-2.26, 1.48], [-2.29, 1.16]],
  windshield: [[1.3, 1.12], [0.6, 1.7]],
  rearWindow: [[-2.1, 1.78], [-2.33, 1.5]],
  lamps: { front: 0.9, rear: 1.2 },
  // Fallback styling: black roof and pillars, gloss-black rims, side steps, door decals and the Leader front kit.
  styling: 'leader', roofColor: '#121417', rimColor: '#1a1d21', spokes: 6,
}

/**
 * Real 3D assets, matched on the vehicle's make and model. Drop the .glb into
 * Front-End/public/models/. The model is scaled to `spec.length`, centred and
 * set on the ground automatically; if it faces backwards, set `rotationY` to Math.PI.
 * Until the file exists the coded fallback shell is shown instead.
 */
const VEHICLE_ASSETS = [
  {
    matches: (vehicle) => /toyota/i.test(vehicle?.make || '') && /fortuner/i.test(vehicle?.model || ''),
    spec: FORTUNER_SPEC,
    asset: { url: `${import.meta.env.BASE_URL}models/toyota-fortuner.glb`, rotationY: 0 },
  },
]

// Toyota Vios (3rd generation, Philippine market): 4,425 L x 1,730 W x 1,475 H mm,
// 2,550 mm wheelbase, 185/60 R15 tyres, 133 mm ground clearance. A compact four-door sedan
// with a short boot and a fast rear window.
const VIOS_SPEC = {
  length: 4.425, width: 1.73, wheelRadius: 0.3, tireWidth: 0.185, clearance: 0.133,
  frontAxle: 1.3, rearAxle: -1.25, engine: [1.5, 0.54], engineSize: [0.55, 0.4, 0.6],
  profile: [[2.21, 0.33], [2.25, 0.53], [2.14, 0.68], [1.0, 0.9], [0.18, 1.43], [-0.6, 1.475], [-1.58, 1.06], [-2.12, 1.0], [-2.25, 0.76], [-2.21, 0.35]],
  windows: [[0.9, 0.98], [0.2, 1.38], [-0.57, 1.42], [-1.4, 1.06]],
  windshield: [[1.0, 0.9], [0.18, 1.43]],
  rearWindow: [[-0.6, 1.475], [-1.58, 1.06]],
  lamps: { front: 0.64, rear: 0.8 },
}

/**
 * Known models drawn with the coded shell, matched on make and model. These win over the
 * body type on the vehicle record, so a car filed under the wrong type still gets its real shape.
 */
const VEHICLE_SHAPES = [
  {
    matches: (vehicle) => /toyota/i.test(vehicle?.make || '') && /vios/i.test(vehicle?.model || ''),
    type: 'sedan',
    spec: VIOS_SPEC,
  },
]

export const MOTORCYCLE_SPEC = {
  length: 2.15, wheelRadius: 0.31, tireWidth: 0.12, frontAxle: 0.72, rearAxle: -0.7,
}

const v = (x, y, z) => [x, y, z]

/** y of a polyline at x (highest crossing), or null outside it. */
export function heightAt(points, x) {
  let best = null
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index]
    const [x2, y2] = points[index + 1]
    if ((x - x1) * (x - x2) <= 0 && x1 !== x2) {
      const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1)
      best = best === null ? y : Math.max(best, y)
    }
  }
  return best
}

function carRig(type, base = CAR_SPECS[type], asset = null) {
  // Keep the engine (including its cover) below the hood line at its position.
  const hood = heightAt(base.profile, base.engine[0]) ?? base.engine[1] + 1
  const s = { ...base, engine: [base.engine[0], Math.min(base.engine[1], hood - base.engineSize[1] / 2 - 0.2)] }
  const half = s.length / 2
  const R = s.wheelRadius
  const track = s.width / 2 - s.tireWidth / 2 - 0.03
  const outer = track + s.tireWidth / 2 + 0.03
  const [ex, ey] = s.engine
  const [ew, eh] = s.engineSize

  return {
    kind: 'car',
    type,
    asset,
    spec: { ...s, half, track },
    height: Math.max(...s.profile.map(([, y]) => y)),
    components: {
      engine: { anchor: v(ex, ey + eh / 2 + 0.12, 0), view: v(0.7, 1.0, -0.55), distance: 3.92, xray: true },
      battery: { anchor: v(ex - ew / 2 - 0.12, ey + 0.2, -s.width * 0.3), view: v(0.35, 1.0, -0.8), distance: 3.04, xray: true },
      cooling: { anchor: v(half - 0.3, ey + 0.12, 0.28), view: v(1, 0.5, -0.35), distance: 3.33, xray: true },
      'air-conditioning': { anchor: v(half - 0.24, ey - 0.2, -(s.width * 0.24)), view: v(1, 0.55, -0.7), distance: 3.2, xray: true },
      transmission: { anchor: v(ex - ew / 2 - 0.42, s.clearance + 0.2, 0), view: v(0.1, 0.35, -1), distance: 3.77, xray: true },
      'brakes-front': { anchor: v(s.frontAxle + 0.12, R * 1.3, -(track - 0.06)), view: v(0.35, 0.3, -1), distance: 2.46, xray: true, ghost: ['tire-front-left'] },
      'brakes-rear': { anchor: v(s.rearAxle - 0.12, R * 1.3, -(track - 0.06)), view: v(-0.35, 0.3, -1), distance: 2.46, xray: true, ghost: ['tire-rear-left'] },
      'tire-front-left': { anchor: v(s.frontAxle, R * 0.5, -outer), view: v(0.5, 0.35, -1), distance: 2.9 },
      'tire-front-right': { anchor: v(s.frontAxle, R * 0.5, outer), view: v(0.5, 0.35, 1), distance: 2.9 },
      'tire-rear-left': { anchor: v(s.rearAxle, R * 0.5, -outer), view: v(-0.5, 0.35, -1), distance: 2.9 },
      'tire-rear-right': { anchor: v(s.rearAxle, R * 0.5, outer), view: v(-0.5, 0.35, 1), distance: 2.9 },
      steering: { anchor: v(s.windshield[0][0] - 0.5, s.windshield[0][1] + 0.1, -s.width * 0.2), view: v(0.35, 0.6, -1), distance: 3.62, xray: true },
      suspension: { anchor: v(s.frontAxle - 0.04, R * 2 + 0.12, -(track - 0.3)), view: v(0.25, 0.55, -1), distance: 3.04, xray: true, ghost: ['tire-front-left'] },
      exhaust: { anchor: v(-half + 0.08, s.clearance + 0.04, -0.48), view: v(-0.85, 0.3, -0.75), distance: 3.48, xray: true },
      lighting: { anchor: v(half - 0.06, s.lamps.front, -(s.width / 2 - 0.3)), view: v(1, 0.3, -0.55), distance: 3.48 },
    },
  }
}

function motorcycleRig() {
  const s = MOTORCYCLE_SPEC
  const R = s.wheelRadius
  return {
    kind: 'motorcycle',
    type: 'motorcycle',
    spec: s,
    height: 1.15,
    components: {
      engine: { anchor: v(0.02, 0.62, -0.12), view: v(0.3, 0.45, -1), distance: 2.17 },
      battery: { anchor: v(-0.3, 0.72, -0.1), view: v(-0.2, 0.6, -1), distance: 1.89, xray: true },
      'final-drive': { anchor: v(-0.38, 0.33, -0.16), view: v(-0.1, 0.3, -1), distance: 2.03 },
      'brakes-front': { anchor: v(s.frontAxle - 0.1, R + 0.12, -0.1), view: v(0.35, 0.25, -1), distance: 1.74 },
      'brakes-rear': { anchor: v(s.rearAxle + 0.1, R + 0.1, 0.1), view: v(-0.35, 0.25, 1), distance: 1.74 },
      'tire-front': { anchor: v(s.frontAxle + R * 0.7, R * 0.45, 0), view: v(0.8, 0.3, -0.7), distance: 2.03 },
      'tire-rear': { anchor: v(s.rearAxle - R * 0.7, R * 0.45, 0), view: v(-0.8, 0.3, -0.7), distance: 2.03 },
      suspension: { anchor: v(0.58, 0.82, -0.1), view: v(0.5, 0.4, -1), distance: 2.03 },
      exhaust: { anchor: v(-0.82, 0.48, 0.17), view: v(-0.6, 0.35, 1), distance: 2.03 },
      lighting: { anchor: v(0.82, 0.96, 0), view: v(1, 0.35, -0.5), distance: 2.03 },
    },
  }
}

export function rigFor(bodyType, vehicle) {
  if (bodyType === 'motorcycle') return motorcycleRig()
  const known = VEHICLE_ASSETS.find((entry) => entry.matches(vehicle))
  if (known) return carRig('suv', known.spec, known.asset)
  const shape = VEHICLE_SHAPES.find((entry) => entry.matches(vehicle))
  if (shape) return carRig(shape.type, shape.spec)
  return CAR_SPECS[bodyType] ? carRig(bodyType) : null
}

// Paint colour from the free-text inventory colour; unknown values get a neutral grey.
export function paintColor(value) {
  const text = String(value || '').trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(text)) return text
  const colors = {
    black: '#22272e', blue: '#2a5d9f', navy: '#1f3556', gray: '#7d8791', grey: '#7d8791',
    green: '#3f6b4f', red: '#a8322d', maroon: '#6e2328', silver: '#b4bcc4', white: '#e4e7ea',
    yellow: '#d2a634', orange: '#c8692e', brown: '#6b4d36', beige: '#c9b99a', gold: '#b8974a',
  }
  return Object.entries(colors).find(([name]) => text.includes(name))?.[1] || '#99a2ab'
}
