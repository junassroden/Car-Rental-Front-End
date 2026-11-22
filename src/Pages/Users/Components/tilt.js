// Pointer handlers that tilt an element toward the cursor in 3D.
// The element reads --tilt-x, --tilt-y and --glare-x/--glare-y from CSS (see customer-3d.css).

const MAX_TILT = 7

function tiltTo(event) {
  if (event.pointerType !== 'mouse') return
  const element = event.currentTarget
  const box = element.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width
  const y = (event.clientY - box.top) / box.height
  element.style.setProperty('--tilt-x', `${((0.5 - y) * MAX_TILT).toFixed(2)}deg`)
  element.style.setProperty('--tilt-y', `${((x - 0.5) * MAX_TILT).toFixed(2)}deg`)
  element.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`)
  element.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`)
  element.classList.add('is-tilting')
}

function settle(event) {
  const element = event.currentTarget
  element.style.setProperty('--tilt-x', '0deg')
  element.style.setProperty('--tilt-y', '0deg')
  element.classList.remove('is-tilting')
}

export const tiltHandlers = { onPointerMove: tiltTo, onPointerLeave: settle }
