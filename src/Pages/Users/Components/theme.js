import { useSyncExternalStore } from 'react'

// Light/dark theme for the customer area. The choice is remembered per browser;
// until the customer picks one, the device setting decides.

const KEY = 'caren-customer-theme'
const listeners = new Set()

function stored() {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'dark' || value === 'light' ? value : null
  } catch {
    return null
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

let current = typeof window === 'undefined' ? 'light' : stored() || systemTheme()

function emit() {
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (stored()) return
    current = systemTheme()
    emit()
  })
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setTheme(theme) {
  current = theme
  try {
    window.localStorage.setItem(KEY, theme)
  } catch {
    // Storage unavailable (private mode): the choice lasts for this visit only.
  }
  emit()
}

export function useTheme() {
  return useSyncExternalStore(subscribe, () => current, () => 'light')
}
