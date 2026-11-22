// Props for a car photo that should sit snugly in its box.
//
// 1. ImageKit photos are requested with `tr=t-true`, which trims the empty
//    border around the car, so every car fills its box to the same extent.
// 2. Once loaded, the photo's top corners are sampled. A white backdrop keeps the
//    whole car visible (object-fit: contain); a coloured or photographic
//    backdrop fills the box instead (object-fit: cover), so no grey slab shows.
//    CSS reads the result from data-backdrop (see customer-3d.css).

const IMAGEKIT = /^https:\/\/ik\.imagekit\.io\//i

function trimmed(url) {
  if (!IMAGEKIT.test(url) || /[?&]tr=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}tr=t-true`
}

function isLight([r, g, b]) {
  return r > 228 && g > 228 && b > 228
}

function markBackdrop(event) {
  const image = event.currentTarget
  try {
    const size = 24
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0, size, size)
    // Top corners only: once trimmed, the tyres and shadow reach the bottom corners,
    // while the roof rarely reaches the top ones.
    const corners = [[1, 1], [size - 2, 1]].map(([x, y]) => context.getImageData(x, y, 1, 1).data)
    image.dataset.backdrop = corners.every(isLight) ? 'light' : 'solid'
  } catch {
    // Pixels unreadable (no CORS): keep the safe default, the whole car visible.
    image.dataset.backdrop = 'light'
  }
}

/** Spread onto an <img>: `<img {...carPhoto(url)} alt="…" />`. */
export function carPhoto(url) {
  if (!url) return { src: url }
  const imageKit = IMAGEKIT.test(url)
  return {
    src: trimmed(url),
    // Reading pixels needs CORS; only ImageKit is known to allow it.
    ...(imageKit ? { crossOrigin: 'anonymous' } : {}),
    onLoad: markBackdrop,
  }
}
