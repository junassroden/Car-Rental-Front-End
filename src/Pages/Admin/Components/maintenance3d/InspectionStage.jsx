import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import VehicleModel from './VehicleModel.jsx'
import { paintColor } from './rigs.js'
import { markerTone, TONE_LABELS } from './status.js'

const OVERVIEW_DIRECTION = new THREE.Vector3(1, 0.42, -1.15).normalize()
const WORLD_UP = new THREE.Vector3(0, 1, 0)
const COMPACT_WIDTH = 760
const BACKDROP = '#ebebe7'

/** Camera position and orbit target that frame the whole vehicle in the current viewport. */
function rigRadius(rig) {
  const width = rig.kind === 'motorcycle' ? 0.8 : rig.spec.width
  return Math.hypot(rig.spec.length / 2, rig.height / 2, width / 2)
}

function overviewPose(rig, camera, size) {
  const radius = rigRadius(rig)
  const verticalFov = THREE.MathUtils.degToRad(camera.fov)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height))
  // The car is longer than it is tall, so it can sit closer when height is the limit.
  const fit = horizontalFov < verticalFov ? 0.95 : 0.82
  const distance = (radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) * fit
  const target = new THREE.Vector3(0, rig.height * 0.42, 0)
  return { target, position: target.clone().addScaledVector(OVERVIEW_DIRECTION, distance), distance }
}

/**
 * Frames a component and leaves room for the callout: on wide viewports the
 * component sits left of centre (callout on the right); on compact viewports
 * it sits in the upper half (callout as a bottom sheet).
 */
function focusPose(focus, camera, size) {
  const anchor = new THREE.Vector3(...focus.anchor)
  const direction = new THREE.Vector3(...focus.view).normalize()
  const forward = direction.clone().negate()
  const right = forward.clone().cross(WORLD_UP).normalize()
  const up = right.clone().cross(forward).normalize()
  const halfHeight = focus.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  const halfWidth = halfHeight * (size.width / size.height)
  const [ndcX, ndcY] = size.width < COMPACT_WIDTH ? [0, 0.42] : [-0.34, 0.05]
  const target = anchor.clone()
    .addScaledVector(right, -ndcX * halfWidth)
    .addScaledVector(up, -ndcY * halfHeight)
  return { target, position: target.clone().addScaledVector(direction, focus.distance) }
}

/** Smoothly moves camera and orbit target toward a goal; user input cancels the move. */
const CameraRig = forwardRef(function CameraRig({ rig, focus }, ref) {
  const { camera, size, controls, invalidate } = useThree()
  const goal = useRef(null)

  useImperativeHandle(ref, () => ({
    reset() {
      goal.current = overviewPose(rig, camera, size)
      invalidate()
    },
    zoom(factor) {
      if (!controls) return
      const offset = camera.position.clone().sub(controls.target).multiplyScalar(factor)
      const distance = THREE.MathUtils.clamp(offset.length(), controls.minDistance, controls.maxDistance)
      goal.current = { target: controls.target.clone(), position: controls.target.clone().add(offset.setLength(distance)) }
      invalidate()
    },
    orbit(angle) {
      if (!controls) return
      const offset = camera.position.clone().sub(controls.target).applyAxisAngle(WORLD_UP, angle)
      goal.current = { target: controls.target.clone(), position: controls.target.clone().add(offset) }
      invalidate()
    },
  }), [rig, camera, size, controls, invalidate])

  // Fly to the selected component, or back to the overview when it is closed.
  useEffect(() => {
    goal.current = focus ? focusPose(focus, camera, size) : overviewPose(rig, camera, size)
    invalidate()
    // Re-framing on resize is intentional; the overview should always fit.
  }, [focus, rig, camera, size, invalidate])

  useEffect(() => {
    if (!controls) return undefined
    const cancel = () => { goal.current = null }
    controls.addEventListener('start', cancel)
    return () => controls.removeEventListener('start', cancel)
  }, [controls])

  // Start already framed rather than flying in from the default camera (applied on the next frame).
  const snap = useRef(true)
  useEffect(() => { snap.current = true; invalidate() }, [rig, invalidate])

  // Panning is allowed but the orbit target stays within the vehicle's bounds.
  const bounds = useMemo(() => {
    const halfLength = rig.spec.length / 2
    const halfWidth = (rig.kind === 'motorcycle' ? 0.8 : rig.spec.width) / 2
    return new THREE.Box3(new THREE.Vector3(-halfLength, 0.05, -halfWidth), new THREE.Vector3(halfLength, rig.height, halfWidth))
  }, [rig])

  useFrame((_, delta) => {
    if (snap.current && controls) {
      const pose = overviewPose(rig, camera, size)
      camera.position.copy(pose.position)
      controls.target.copy(pose.target)
      controls.update()
      snap.current = false
      goal.current = null
    }
    if (controls && !bounds.containsPoint(controls.target)) {
      const clamped = bounds.clampPoint(controls.target, new THREE.Vector3())
      camera.position.add(clamped.clone().sub(controls.target))
      controls.target.copy(clamped)
    }
    if (!goal.current || !controls) return
    const blend = 1 - Math.exp(-delta * 4.2)
    camera.position.lerp(goal.current.position, blend)
    controls.target.lerp(goal.current.target, blend)
    controls.update()
    if (camera.position.distanceToSquared(goal.current.position) < 1e-5 && controls.target.distanceToSquared(goal.current.target) < 1e-5) {
      goal.current = null
    } else {
      invalidate() // on-demand rendering: keep frames coming until the move finishes
    }
  })

  return null
})

/**
 * Projects component anchors to screen space every frame and writes the
 * result straight to the overlay DOM nodes (markers, callout, leader line).
 */
// `layoutKey` changes when the callout resizes so on-demand rendering re-positions it.
// eslint-disable-next-line no-unused-vars
function OverlayProjector({ anchors, markerRefs, calloutRef, leaderRef, selectedKey, layoutKey }) {
  const { camera, size } = useThree()
  const point = useMemo(() => new THREE.Vector3(), [])
  const toCamera = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    anchors.forEach(({ key, position, side }) => {
      const element = markerRefs.current.get(key)
      if (!element) return
      point.set(...position).project(camera)
      const visible = point.z < 1 && Math.abs(point.x) < 1.15 && Math.abs(point.y) < 1.15
      const x = ((point.x + 1) / 2) * size.width
      const y = ((1 - point.y) / 2) * size.height
      element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      element.style.visibility = visible ? 'visible' : 'hidden'
      if (side) {
        toCamera.copy(camera.position).sub(point.set(...position)).normalize()
        element.dataset.behind = toCamera.z * side < -0.2 ? 'true' : 'false'
      }

      if (key === selectedKey && calloutRef.current) {
        positionCallout(calloutRef.current, leaderRef.current, x, y, size, visible)
      }
    })
  })

  return null
}

function positionCallout(callout, leader, x, y, size, visible) {
  if (size.width < COMPACT_WIDTH) {
    callout.style.transform = ''
    if (leader) leader.style.visibility = 'hidden'
    return
  }
  const margin = 16
  const gap = 56
  const { width, height } = callout.pmSize || { width: callout.offsetWidth, height: callout.offsetHeight }
  const placeRight = x + gap + width + margin <= size.width || x < size.width / 2
  const left = THREE.MathUtils.clamp(placeRight ? x + gap : x - gap - width, margin, size.width - width - margin)
  const top = THREE.MathUtils.clamp(y - Math.min(96, height / 2), margin + 48, Math.max(margin + 48, size.height - height - margin))
  callout.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0)`
  if (leader) {
    const edgeX = placeRight ? left : left + width
    const edgeY = THREE.MathUtils.clamp(y, top + 18, top + Math.min(height - 18, 140))
    leader.setAttribute('x1', x.toFixed(1))
    leader.setAttribute('y1', y.toFixed(1))
    leader.setAttribute('x2', edgeX.toFixed(1))
    leader.setAttribute('y2', edgeY.toFixed(1))
    leader.style.visibility = visible ? 'visible' : 'hidden'
  }
}

/**
 * A photo studio built from light panels. Car paint and glass look real because of
 * what they reflect, so this matters more than the direct lights. It is generated
 * here rather than downloaded, so the page has no extra file to fetch.
 */
function Studio({ quality }) {
  // A soft sky behind the panels, so glass and paint always have something to reflect.
  const dome = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 256
    const context = canvas.getContext('2d')
    const gradient = context.createLinearGradient(0, 0, 0, 256)
    gradient.addColorStop(0, '#f4f5f0')
    gradient.addColorStop(0.3, '#d9dcd3')
    gradient.addColorStop(0.47, '#9ea39a')
    gradient.addColorStop(0.53, '#6d726b')
    gradient.addColorStop(1, '#8a8f87')
    context.fillStyle = gradient
    context.fillRect(0, 0, 4, 256)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [])
  useEffect(() => () => dome.dispose(), [dome])
  return (
    <>
      <hemisphereLight intensity={0.28} color="#eef4ff" groundColor="#8a8f87" />
      <directionalLight position={[3.5, 7, -4]} intensity={1.35} />
      <directionalLight position={[-5, 3, 4]} intensity={0.35} color="#c8dcff" />
      <Environment resolution={quality === 'high' ? 256 : 96} frames={1}>
        <mesh scale={40}>
          <sphereGeometry args={[1, 32, 24]} />
          <meshBasicMaterial map={dome} side={THREE.BackSide} toneMapped={false} />
        </mesh>
        <Lightformer form="rect" intensity={2.8} position={[0, 7, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[11, 4.5, 1]} />
        <Lightformer form="rect" intensity={2.1} position={[0, 2.6, -8]} scale={[17, 1.5, 1]} />
        <Lightformer form="rect" intensity={1.5} position={[0, 2.2, 8]} rotation={[0, Math.PI, 0]} scale={[17, 1.3, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[9, 2.4, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[7, 1.8, 1]} />
        <Lightformer form="rect" intensity={1} position={[-9, 2.4, 0]} rotation={[0, Math.PI / 2, 0]} scale={[7, 1.6, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#bcd4ff" position={[-5, 5, -5]} scale={3} />
      </Environment>
    </>
  )
}

/** Studio floor: a pool of light that fades into the backdrop, so there is no horizon line. */
function StudioFloor({ radius, footprint }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 256)
    gradient.addColorStop(0, '#f7f8f4')
    gradient.addColorStop(0.32, '#f3f4ef')
    gradient.addColorStop(0.7, '#f0f2ec')
    gradient.addColorStop(1, BACKDROP)
    context.fillStyle = gradient
    context.fillRect(0, 0, 512, 512)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    return map
  }, [])
  const shadow = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 128)
    gradient.addColorStop(0, 'rgba(32, 42, 40, 0.42)')
    gradient.addColorStop(0.55, 'rgba(32, 42, 40, 0.26)')
    gradient.addColorStop(1, 'rgba(32, 42, 40, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 256, 256)
    return new THREE.CanvasTexture(canvas)
  }, [])
  useEffect(() => () => {
    texture.dispose()
    shadow.dispose()
  }, [texture, shadow])
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0015, 0]} raycast={() => null}>
        <planeGeometry args={footprint} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} raycast={() => null}>
        <circleGeometry args={[radius * 3.4, 72]} />
        <meshBasicMaterial map={texture} toneMapped={false} fog={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} raycast={() => null}>
        <ringGeometry args={[radius * 1.12, radius * 1.126, 128]} />
        <meshBasicMaterial color="#8f968c" transparent opacity={0.35} fog={false} />
      </mesh>
    </group>
  )
}

function Icon({ name }) {
  const paths = {
    left: 'M15 6l-6 6 6 6',
    right: 'M9 6l6 6-6 6',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
    xray: 'M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  )
}

/**
 * Full-bleed 3D inspection stage. `components` come from the API; only those
 * with an anchor in the rig get a hotspot. `children` is the callout content
 * for the selected component.
 */
const DEFAULT_LEGEND = ['good', 'attention', 'critical', 'unknown'].map((tone) => ({ tone, label: TONE_LABELS[tone] }))

export default function InspectionStage({ rig, vehicle, components, selectedKey, onSelect, legend = DEFAULT_LEGEND, children }) {
  const [hoveredKey, setHoveredKey] = useState(null)
  const [manualXray, setManualXray] = useState(false)
  const [webglError, setWebglError] = useState(false)
  // Starts sharp. If a graphics card can't cope, it retries with the lighter settings before giving up.
  const [quality, setQuality] = useState('high')
  const [calloutLayout, setCalloutLayout] = useState('')
  const cameraApi = useRef(null)
  const markerRefs = useRef(new Map())
  const calloutRef = useRef(null)
  const leaderRef = useRef(null)

  const selectable = useMemo(() => components.filter((component) => rig.components[component.key]), [components, rig])
  const available = useMemo(() => new Set(selectable.map((component) => component.key)), [selectable])
  const focus = selectedKey ? rig.components[selectedKey] || null : null
  const xray = manualXray || Boolean(focus?.xray)
  const ghosted = useMemo(() => new Set(focus?.ghost || []), [focus])
  const sideThreshold = rig.kind === 'motorcycle' ? 0.08 : 0.4
  const anchors = useMemo(() => selectable.map(({ key }) => {
    const position = rig.components[key].anchor
    return { key, position, side: Math.abs(position[2]) >= sideThreshold ? Math.sign(position[2]) : 0 }
  }), [selectable, rig, sideThreshold])

  // Cache the callout size so the per-frame projector never forces a layout.
  useEffect(() => {
    const callout = calloutRef.current
    if (!callout || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => {
      callout.pmSize = { width: callout.offsetWidth, height: callout.offsetHeight }
      setCalloutLayout(`${callout.pmSize.width}x${callout.pmSize.height}`)
    })
    observer.observe(callout)
    return () => observer.disconnect()
  }, [selectedKey])

  const hover = useCallback((key) => {
    setHoveredKey(key)
    document.body.style.cursor = key ? 'pointer' : ''
  }, [])
  useEffect(() => () => { document.body.style.cursor = '' }, [])

  const interaction = useMemo(() => ({
    selectedKey, hoveredKey, ghosted, available, onHover: hover, onSelect,
  }), [selectedKey, hoveredKey, ghosted, available, hover, onSelect])

  const setMarkerRef = (key) => (element) => {
    if (element) markerRefs.current.set(key, element)
    else markerRefs.current.delete(key)
  }

  if (webglError) {
    return (
      <div className="pm-stage pm-stage-error" role="alert">
        <p>3D rendering is unavailable in this browser. Use the component list to review records.</p>
      </div>
    )
  }

  return (
    <div className={`pm-stage${selectedKey ? ' has-selection' : ''}`}>
      <Canvas
        key={quality}
        className="pm-canvas"
        frameloop="demand"
        dpr={quality === 'high' ? [1, 2] : [1, 1.25]}
        camera={{ fov: 34, near: 0.05, far: 80, position: [6, 3, -6] }}
        gl={{ antialias: quality === 'high', powerPreference: 'default' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (event) => {
            event.preventDefault()
            if (quality === 'high') setQuality('low')
            else setWebglError(true)
          }, { once: true })
        }}
        onPointerMissed={() => hover(null)}
        fallback={<div className="pm-stage-error" role="alert">WebGL is unavailable in this browser.</div>}
      >
        <color attach="background" args={[BACKDROP]} />
        <Studio quality={quality} />
        <VehicleModel rig={rig} paint={paintColor(vehicle.color)} xray={xray} interaction={interaction} />
        <StudioFloor radius={rigRadius(rig)} footprint={[rig.spec.length * 1.38, (rig.kind === 'motorcycle' ? 0.5 : rig.spec.width) * 1.7]} />
        <ContactShadows position={[0, 0.003, 0]} opacity={0.55} scale={rig.kind === 'motorcycle' ? 4.5 : 10} blur={2.1} far={2.2} resolution={quality === 'high' ? 1024 : 512} frames={1} color="#161816" />
        <OrbitControls
          makeDefault
          enablePan
          screenSpacePanning
          panSpeed={0.6}
          enableDamping
          dampingFactor={0.07}
          minDistance={0.7}
          maxDistance={rigRadius(rig) * 6}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI * 0.49}
          rotateSpeed={0.7}
        />
        <CameraRig ref={cameraApi} rig={rig} focus={focus} />
        <OverlayProjector anchors={anchors} markerRefs={markerRefs} calloutRef={calloutRef} leaderRef={leaderRef} selectedKey={selectedKey} layoutKey={calloutLayout} />
      </Canvas>

      <div className="pm-overlay">
        <svg className="pm-leader" aria-hidden="true">
          {selectedKey && <line ref={leaderRef} />}
        </svg>
        {selectable.map((component) => {
          const tone = markerTone(component)
          const active = component.key === selectedKey
          return (
            <button
              key={component.key}
              ref={setMarkerRef(component.key)}
              type="button"
              className={`pm-hotspot tone-${tone}${active ? ' is-active' : ''}${hoveredKey === component.key ? ' is-hovered' : ''}`}
              onClick={() => onSelect(component.key)}
              onPointerEnter={() => setHoveredKey(component.key)}
              onPointerLeave={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(component.key)}
              onBlur={() => setHoveredKey(null)}
              aria-pressed={active}
              aria-label={`${component.name}: ${component.statusLabel || TONE_LABELS[tone]}`}
            >
              <span className="pm-hotspot-dot" />
              <span className="pm-hotspot-label">{component.name}<small>{component.statusLabel || TONE_LABELS[tone]}</small></span>
            </button>
          )
        })}
        {selectedKey && (
          <div ref={calloutRef} className="pm-callout" role="dialog" aria-label="Component inspection">
            {children}
          </div>
        )}
      </div>

      <p className="pm-stage-note">Schematic, not a scan</p>

      <div className="pm-legend" aria-label="Hotspot colours">
        {legend.map(({ tone, label }) => (
          <span key={tone}><i className={`tone-${tone}`} />{label}</span>
        ))}
      </div>

      {selectedKey && (
        <button type="button" className="pm-exterior" onClick={() => onSelect(null)}>
          <Icon name="left" />Exterior view
        </button>
      )}

      <div className="pm-controls" role="toolbar" aria-label="Camera controls">
        <button type="button" onClick={() => cameraApi.current?.orbit(-Math.PI / 6)} aria-label="Rotate left" title="Rotate left"><Icon name="left" /></button>
        <button type="button" onClick={() => cameraApi.current?.orbit(Math.PI / 6)} aria-label="Rotate right" title="Rotate right"><Icon name="right" /></button>
        <span className="pm-controls-divider" />
        <button type="button" onClick={() => cameraApi.current?.zoom(0.78)} aria-label="Zoom in" title="Zoom in"><Icon name="plus" /></button>
        <button type="button" onClick={() => cameraApi.current?.zoom(1.28)} aria-label="Zoom out" title="Zoom out"><Icon name="minus" /></button>
        <span className="pm-controls-divider" />
        <button type="button" onClick={() => (selectedKey ? onSelect(null) : cameraApi.current?.reset())} aria-label="Reset to default view" title="Reset to default view"><Icon name="reset" /></button>
        <button type="button" className={manualXray ? 'is-on' : ''} onClick={() => setManualXray((value) => !value)} aria-pressed={manualXray} aria-label="X-ray view" title="X-ray view: see internal components"><Icon name="xray" /></button>
      </div>
    </div>
  )
}
