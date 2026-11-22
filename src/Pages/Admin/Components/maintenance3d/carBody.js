// Procedural car body: everything is derived from the side profile in rigs.js, so
// every body type gets the same shaping, and glass, lamps and trim sit exactly on
// the painted surface instead of floating near it.
// Coordinates match rigs.js: +x is the front, +y is up, z is across the car.
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { heightAt } from './rigs.js'

const { lerp, clamp, smoothstep } = THREE.MathUtils

// How far the plan view rounds in at each end of the car.
const FRONT_ROUND = { length: 0.68, depth: 0.27 }
const REAR_ROUND = { length: 0.56, depth: 0.2 }

/** Rounds a polyline's corners by repeatedly cutting them. An open line keeps its end points. */
export function chaikin(points, iterations = 3, closed = false) {
  let result = points
  for (let pass = 0; pass < iterations; pass += 1) {
    const next = closed ? [] : [result[0]]
    const count = closed ? result.length : result.length - 1
    for (let index = 0; index < count; index += 1) {
      const [x1, y1] = result[index]
      const [x2, y2] = result[(index + 1) % result.length]
      next.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25], [x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75])
    }
    if (!closed) next.push(result[result.length - 1])
    result = next
  }
  return result
}

/** The painted surface as functions, so anything can be placed on it. */
export function carSurface(spec) {
  const smooth = chaikin(spec.profile, 3)
  const frontX = Math.max(...smooth.map(([x]) => x))
  const rearX = Math.min(...smooth.map(([x]) => x))
  const hasTail = !spec.bed
  const belt = Math.min(...spec.windows.map(([, y]) => y)) - 0.03
  const archRadius = spec.wheelRadius + 0.07
  const axles = [spec.frontAxle, spec.rearAxle]
  const tipIndex = smooth.findIndex(([x]) => x === frontX)
  const tailIndex = smooth.findIndex(([x]) => x === rearX)

  // Clamped to the profile's length: a slice a rounding error past the nose or tail would
  // otherwise miss the outline, fall back to the belt line and stand up as a flat wall.
  const topAt = (x) => heightAt(smooth, clamp(x, rearX, frontX)) ?? belt

  const halfWidth = (x) => {
    let factor = 1 - 0.025 * (x / Math.max(frontX, -rearX)) ** 2
    const toFront = frontX - x
    if (toFront < FRONT_ROUND.length) {
      const e = clamp(1 - toFront / FRONT_ROUND.length, 0, 1)
      factor *= 1 - FRONT_ROUND.depth * (1 - Math.sqrt(1 - e * e))
    }
    const toRear = x - rearX
    if (hasTail && toRear < REAR_ROUND.length) {
      const e = clamp(1 - toRear / REAR_ROUND.length, 0, 1)
      factor *= 1 - REAR_ROUND.depth * (1 - Math.sqrt(1 - e * e))
    }
    return (spec.width / 2) * factor
  }

  const bottomAt = (x) => {
    const chin = clamp(1 - (frontX - x) / 0.34, 0, 1)
    const tail = hasTail ? clamp(1 - (x - rearX) / 0.3, 0, 1) : 0
    const floor = spec.clearance + 0.17 * chin * chin + 0.2 * tail * tail
    const ramp = 0.022
    return axles.reduce((bottom, axle) => {
      const dx = Math.abs(x - axle)
      if (dx < archRadius) return Math.max(bottom, spec.wheelRadius + Math.sqrt(archRadius ** 2 - dx ** 2))
      if (dx < archRadius + ramp) return Math.max(bottom, lerp(spec.wheelRadius, floor, (dx - archRadius) / ramp))
      return bottom
    }, floor)
  }

  // 1 beside a wheel, where the lower body stops tucking under and forms a fender lip.
  const archBlend = (x) => axles.reduce((blend, axle) => (
    Math.max(blend, 1 - smoothstep(Math.abs(x - axle), archRadius - 0.03, archRadius + 0.1))
  ), 0)

  /** One half of the cross-section at x, as [fraction of half width, height], from under the car up to the roof centre. */
  const section = (x) => {
    const top = Math.max(topAt(x), bottomAt(x) + 0.08)
    const bottom = Math.min(bottomAt(x), top - 0.08)
    const shoulder = Math.max(bottom + 0.04, Math.min(belt, top - 0.075))
    const lower = shoulder - bottom
    const upper = top - shoulder
    const cabin = smoothstep(upper, 0.1, 0.4)
    const roofU = lerp(0.8, 0.7, cabin)
    const lip = archBlend(x)
    const under = lerp(0.74, 0.975, lip)
    const points = [
      [0, bottom],
      [under, bottom],
      [Math.max(under, 0.9), bottom + Math.min(0.03, lower * 0.1)],
      [Math.max(under, 0.965), bottom + Math.min(0.075, lower * 0.22)],
      [0.993, bottom + lower * 0.36],
      [1, bottom + lower * 0.62],
      [0.992, bottom + lower * 0.82], // shoulder line
      [0.968, shoulder - lower * 0.04],
      [0.948, shoulder],
    ]
    ;[0.16, 0.4, 0.68, 0.86, 0.94].forEach((t) => {
      points.push([lerp(0.948, roofU + 0.025, t ** 1.1), shoulder + upper * t])
    })
    points.push([roofU * 0.97, top - upper * 0.018], [roofU * 0.82, top - upper * 0.005], [roofU * 0.48, top], [0, top])
    return points
  }

  /** Distance from the centre line to the side of the body at (x, y). */
  const sideZ = (x, y) => {
    const points = section(x)
    const width = halfWidth(x)
    if (y <= points[1][1]) return points[1][0] * width
    for (let index = 1; index < points.length - 1; index += 1) {
      const [u1, y1] = points[index]
      const [u2, y2] = points[index + 1]
      if (y >= y1 && y <= y2) return lerp(u1, u2, y2 === y1 ? 0 : (y - y1) / (y2 - y1)) * width
    }
    return 0
  }

  /** Height of the top of the body at (x, |z|). */
  const topY = (x, z) => {
    const points = section(x)
    const width = halfWidth(x)
    const u = Math.abs(z) / width
    for (let index = points.length - 1; index > 1; index -= 1) {
      const [u1, y1] = points[index]
      const [u2, y2] = points[index - 1]
      if (u >= u1 && u <= u2) return lerp(y1, y2, u2 === u1 ? 0 : (u - u1) / (u2 - u1))
    }
    return points[8][1]
  }

  // Where the nose or tail is at a given height, walking up from its furthest point.
  const edgeX = (y, end) => {
    const step = end > 0 ? 1 : -1
    let index = end > 0 ? tipIndex : tailIndex
    if (y <= smooth[index][1]) return smooth[index][0]
    while (smooth[index + step]) {
      const [x1, y1] = smooth[index]
      const [x2, y2] = smooth[index + step]
      if (y >= y1 && y <= y2) return lerp(x1, x2, y2 === y1 ? 0 : (y - y1) / (y2 - y1))
      index += step
    }
    return smooth[index][0]
  }

  // Where the plan outline reaches a given |z|, measured from one end of the car.
  const planEdgeX = (z, end) => {
    let inner = end > 0 ? frontX - FRONT_ROUND.length : rearX + REAR_ROUND.length
    let outer = end > 0 ? frontX : rearX
    if (halfWidth(outer) >= z) return outer
    for (let pass = 0; pass < 18; pass += 1) {
      const middle = (inner + outer) / 2
      if (halfWidth(middle) >= z) inner = middle
      else outer = middle
    }
    return inner
  }

  return { smooth, frontX, rearX, hasTail, belt, archRadius, topAt, halfWidth, bottomAt, section, sideZ, topY, edgeX, planEdgeX }
}

/** The painted shell, lofted through cross-sections along the length of the car. */
export function bodyGeometry(surface) {
  const { frontX, rearX, section, halfWidth } = surface
  const steps = 190
  const positions = []
  let perRing = 0
  for (let index = 0; index <= steps; index += 1) {
    // End slices sit exactly on the tips; cosine spacing alone can land a hair outside them.
    const x = index === 0 ? rearX : index === steps ? frontX : rearX + (frontX - rearX) * (0.5 - 0.5 * Math.cos(Math.PI * (index / steps)))
    const half = section(x)
    const width = halfWidth(x)
    const ring = [...half.map(([u, y]) => [-u, y]), ...half.slice(0, -1).reverse()]
    perRing = ring.length
    ring.forEach(([u, y]) => positions.push(x, y, u * width))
  }

  const indices = []
  for (let slice = 0; slice < steps; slice += 1) {
    for (let index = 0; index < perRing - 1; index += 1) {
      const a = slice * perRing + index
      const b = a + perRing
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  const vertexCount = positions.length / 3
  ;[[0, false], [steps, true]].forEach(([slice, flip], cap) => {
    let cx = 0; let cy = 0; let cz = 0
    for (let index = 0; index < perRing; index += 1) {
      const offset = (slice * perRing + index) * 3
      cx += positions[offset]; cy += positions[offset + 1]; cz += positions[offset + 2]
    }
    positions.push(cx / perRing, cy / perRing, cz / perRing)
    for (let index = 0; index < perRing - 1; index += 1) {
      const a = slice * perRing + index
      if (flip) indices.push(vertexCount + cap, a, a + 1)
      else indices.push(vertexCount + cap, a + 1, a)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** A grid mapped by fn(a, b) with a and b from 0 to 1. `round` above 0 rounds the corners (higher is squarer). */
function patch(fn, columns, rows, round = 0) {
  const positions = []
  const indices = []
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      let s = (column / columns) * 2 - 1
      let t = (row / rows) * 2 - 1
      if (round) {
        const largest = Math.max(Math.abs(s), Math.abs(t))
        const norm = (Math.abs(s) ** round + Math.abs(t) ** round) ** (1 / round)
        if (norm > 0) {
          s *= largest / norm
          t *= largest / norm
        }
      }
      positions.push(...fn((s + 1) / 2, (t + 1) / 2))
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column
        const b = a + columns + 1
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** A panel on the side of the body. */
export function sidePanel(surface, { x0, x1, y0, y1, side, offset = 0.006, round = 0, columns = 24, rows = 6 }) {
  return patch((a, b) => {
    const x = lerp(x0, x1, a)
    const y = lerp(y0, y1, b)
    return [x, y, side * (surface.sideZ(x, y) + offset)]
  }, columns, rows, round)
}

/** Height of the top edge of a window outline at x. */
export function windowTop(outline, x) {
  return heightAt([...outline, outline[0]], x)
}

/** A panel on the nose (end 1) or tail (end -1). */
export function endPanel(surface, { end, width, y0, y1, offset = 0.008, round = 0, center = 0, columns = 26, rows = 8 }) {
  const limit = end > 0 ? Math.min : Math.max
  return patch((a, b) => {
    const z = center + lerp(-width, width, a)
    const y = lerp(y0, y1, b)
    return [limit(surface.edgeX(y, end), surface.planEdgeX(Math.abs(z), end)) + end * offset, y, z]
  }, columns, rows, round)
}

/** A lamp wrapped around a corner of the body: along the side, then across the end. */
export function cornerLamp(surface, { end, side, y0, y1, reach, inner, offset = 0.008, round = 7, split = 0.58 }) {
  return patch((a, b) => {
    const wanted = lerp(y0, y1, b)
    const edge = surface.edgeX(wanted, end)
    if (a < split) {
      const x = lerp(edge - end * reach, edge, a / split)
      const y = Math.min(wanted, surface.topAt(x) - 0.006)
      const n = a / split
      return [x + end * offset * n * 0.6, y + offset * 0.2, side * (surface.sideZ(x, y) + offset * (1 - n * 0.4))]
    }
    const t = (a - split) / (1 - split)
    const y = Math.min(wanted, surface.topAt(edge) - 0.006)
    const z = lerp(Math.max(surface.sideZ(edge, y), inner), inner, t)
    return [Math.min(end * edge, end * surface.planEdgeX(z, end)) * end + end * offset, y + offset * 0.35, side * (z + offset * 0.3)]
  }, 34, 8, round)
}

/** Curved glass following the top of the body between two points on the profile. */
export function topGlass(surface, { segment, frontU, backU, offset = 0.007, inset = 0.03, grow = 0 }) {
  const [[xa, ya], [xb, yb]] = segment
  const length = Math.hypot(xb - xa, yb - ya)
  const along = (xb - xa) / length
  const nx = Math.abs((yb - ya) / length) * Math.sign(xa + xb)
  const ny = Math.abs(along)
  return patch((a, b) => {
    const x = lerp(xa - along * (inset - grow), xb + along * (inset - grow), a)
    const u = lerp(frontU, backU, a) + grow * 0.6
    const z = lerp(-u, u, b) * surface.halfWidth(x)
    return [x + nx * offset, surface.topY(x, z) + ny * offset, z]
  }, 26, 22, 9)
}

/**
 * Side window (or its dark surround) from the outline in rigs.js. Built as a fine grid
 * so it follows the curve of the body; a few long triangles would let the paint poke through.
 */
export function sideWindow(surface, outline, { side, grow = 0, offset = 0.009 }) {
  const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length
  const cy = outline.reduce((sum, [, y]) => sum + y, 0) / outline.length
  const rounded = chaikin(outline.map(([x, y]) => [x + Math.sign(x - cx) * grow, y + Math.sign(y - cy) * grow]), 2, true)
  const closed = [...rounded, rounded[0]]
  const xs = rounded.map(([x]) => x)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const lowerAt = (x) => {
    let lowest = Infinity
    for (let index = 0; index < closed.length - 1; index += 1) {
      const [x1, y1] = closed[index]
      const [x2, y2] = closed[index + 1]
      if ((x - x1) * (x - x2) <= 0 && x1 !== x2) lowest = Math.min(lowest, lerp(y1, y2, (x - x1) / (x2 - x1)))
    }
    return lowest
  }
  return patch((a, b) => {
    const x = lerp(minX + 0.0005, maxX - 0.0005, a)
    const low = lowerAt(x)
    // Stops short of the roof, where the outline can run past the rounded roof line.
    const high = Math.max(low, Math.min(heightAt(closed, x), surface.topAt(x) - 0.045))
    const y = lerp(low, high, b)
    return [x, y, side * (surface.sideZ(x, y) + offset)]
  }, 56, 10)
}

function thinTube(points, radius = 0.003) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), Math.max(6, points.length * 2), radius, 4, false)
}

/** Door, hood and boot shut lines, merged into one mesh. */
export function panelSeams(surface, spec) {
  const { sideZ, topY, belt, bottomAt, rearX, halfWidth, archRadius } = surface
  const lines = []
  const windowXs = spec.windows.map(([x]) => x)
  const windowFront = Math.max(...windowXs)
  const windowRear = Math.min(...windowXs)
  const doorRear = Math.max(windowRear + 0.06, spec.rearAxle + archRadius + 0.04)
  const doorEdges = spec.type === 'van' ? [windowFront + 0.04, Math.min(...windowXs)] : [windowFront + 0.04, (windowFront + doorRear) / 2 - 0.02, doorRear]

  ;[-1, 1].forEach((side) => {
    doorEdges.forEach((x) => {
      const points = []
      for (let step = 0; step <= 8; step += 1) {
        const y = lerp(bottomAt(x) + 0.04, belt - 0.018, step / 8)
        points.push([x, y, side * (sideZ(x, y) + 0.0028)])
      }
      lines.push(thinTube(points))
    })
    // Fender line from the windscreen base to the nose.
    const hoodRear = spec.windshield[0][0] + 0.05
    const hoodFront = surface.edgeX(spec.lamps.front + 0.08, 1) - 0.03
    const hoodPoints = []
    for (let step = 0; step <= 12; step += 1) {
      const x = lerp(hoodRear, hoodFront, step / 12)
      const z = halfWidth(x) * lerp(0.84, 0.74, step / 12)
      hoodPoints.push([x, topY(x, z) + 0.0028, side * z])
    }
    lines.push(thinTube(hoodPoints))
  })

  const across = (x, u) => {
    const points = []
    for (let step = 0; step <= 14; step += 1) {
      const z = lerp(-u, u, step / 14) * halfWidth(x)
      points.push([x, topY(x, z) + 0.0028, z])
    }
    lines.push(thinTube(points))
  }
  across(spec.windshield[0][0] + 0.05, 0.84)
  across(surface.edgeX(spec.lamps.front + 0.08, 1) - 0.03, 0.74)
  if (spec.rearWindow && spec.rearWindow[1][1] < belt + 0.12) {
    const deckFront = spec.rearWindow[1][0] - 0.02
    const deckRear = rearX + 0.14
    across(deckFront, 0.82)
    ;[-1, 1].forEach((side) => {
      const points = []
      for (let step = 0; step <= 8; step += 1) {
        const x = lerp(deckFront, deckRear, step / 8)
        const z = halfWidth(x) * 0.82
        points.push([x, topY(x, z) + 0.0028, side * z])
      }
      lines.push(thinTube(points))
    })
  }
  return mergeGeometries(lines)
}

/** Dark wheel-well lining: stops the wheel arch from being a hole through the car. */
export function archLiners(surface, spec) {
  const { archRadius } = surface
  const wall = spec.width / 2 - 0.34
  const segments = 28
  const parts = []
  ;[spec.frontAxle, spec.rearAxle].forEach((axle) => {
    ;[-1, 1].forEach((side) => {
      const positions = []
      const indices = []
      for (let index = 0; index <= segments; index += 1) {
        const angle = (index / segments) * Math.PI
        const x = axle + Math.cos(angle) * archRadius * 0.985
        const y = spec.wheelRadius + Math.sin(angle) * archRadius * 0.985
        positions.push(x, y, side * wall, x, y, side * (spec.width / 2 - 0.006))
        if (index < segments) {
          const a = index * 2
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
        }
      }
      // The inner wall, as a fan from the axle line.
      const centre = positions.length / 3
      positions.push(axle, spec.wheelRadius - 0.3, side * wall)
      for (let index = 0; index < segments; index += 1) indices.push(centre, index * 2, (index + 1) * 2)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      parts.push(geometry)
    })
  })
  return mergeGeometries(parts)
}

/** A slim black lip around one wheel arch, on the outside of the body. */
export function archLip(surface, spec, axle, side) {
  const { archRadius, sideZ } = surface
  const points = []
  for (let step = 0; step <= 24; step += 1) {
    const angle = Math.PI * 0.15 + (step / 24) * Math.PI * 0.7
    const x = axle + Math.cos(angle) * (archRadius + 0.004)
    const y = spec.wheelRadius + Math.sin(angle) * (archRadius + 0.004)
    points.push([x, y, side * (sideZ(x, y + 0.012) + 0.001)])
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point))), 48, 0.011, 6, false)
}

/** Tyre, rim and spoke geometry. Local +z is the outer face of the wheel. */
export function wheelGeometry(radius, width, spokes) {
  const half = width / 2
  const rim = radius * 0.68
  const shoulder = [
    [rim - 0.004, -half * 0.84], [rim + 0.018, -half * 0.96], [radius * 0.84, -half], [radius * 0.955, -half * 0.94], [radius * 0.992, -half * 0.8], [radius, -half * 0.62],
    [radius, -half * 0.36], [radius * 0.988, -half * 0.33], [radius * 0.988, -half * 0.2], [radius, -half * 0.17], [radius, half * 0.17], [radius * 0.988, half * 0.2], [radius * 0.988, half * 0.33], [radius, half * 0.36],
    [radius, half * 0.62], [radius * 0.992, half * 0.8], [radius * 0.955, half * 0.94], [radius * 0.84, half], [rim + 0.018, half * 0.96], [rim - 0.004, half * 0.84],
  ]
  const toAxle = (geometry) => geometry.rotateX(Math.PI / 2)
  const tire = toAxle(new THREE.LatheGeometry(shoulder.map(([r, y]) => new THREE.Vector2(r, y)), 64))

  const barrel = toAxle(new THREE.LatheGeometry([
    [rim + 0.012, half * 0.84], [rim + 0.012, half * 0.74], [rim - 0.012, half * 0.66], [rim - 0.012, -half * 0.74], [rim * 0.3, -half * 0.74],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 48))

  const hub = radius * 0.19
  const faceZ = half * 0.5
  const pieces = []
  const count = Math.max(4, spokes)
  for (let index = 0; index < count; index += 1) {
    const base = (index / count) * Math.PI * 2
    ;[-1, 1].forEach((splay) => {
      const outerAngle = splay * (0.085 + 0.055 * (5 / count))
      const innerAngle = splay * 0.12
      const point = (r, a) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)
      const thick = radius * 0.036
      const shape = new THREE.Shape([
        point(hub * 0.9, innerAngle - 0.16),
        point(rim * 0.99, outerAngle - thick / rim),
        point(rim * 0.99, outerAngle + thick / rim),
        point(hub * 0.9, innerAngle + 0.16),
      ])
      const spoke = new THREE.ExtrudeGeometry(shape, { depth: radius * 0.06, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 })
      spoke.rotateZ(base)
      spoke.translate(0, 0, faceZ - radius * 0.03)
      pieces.push(spoke)
    })
  }
  const hubCap = toAxle(new THREE.CylinderGeometry(hub, hub * 1.1, radius * 0.08, 24)).translate(0, 0, faceZ + radius * 0.015)
  const spokeSet = mergeGeometries([...pieces.map((piece) => piece.index ? piece.toNonIndexed() : piece), hubCap.toNonIndexed()])

  const lugs = []
  for (let index = 0; index < count; index += 1) {
    const angle = ((index + 0.5) / count) * Math.PI * 2
    const lug = toAxle(new THREE.CylinderGeometry(radius * 0.024, radius * 0.024, radius * 0.03, 8))
    lug.translate(Math.cos(angle) * hub * 0.68, Math.sin(angle) * hub * 0.68, faceZ + radius * 0.06)
    lugs.push(lug)
  }
  const centre = toAxle(new THREE.CylinderGeometry(hub * 0.36, hub * 0.4, radius * 0.03, 20)).translate(0, 0, faceZ + radius * 0.07)
  return { tire, barrel, spokes: spokeSet, lugs: mergeGeometries(lugs), centre, lipRadius: rim + 0.012, lipZ: half * 0.82 }
}
