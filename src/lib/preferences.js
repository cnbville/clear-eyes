export const PREFERENCES_STORAGE_KEY = 'iron-preferences'

export const DEFAULT_PREFERENCES = {
  units: 'kg',
  restSound: false,
  vibration: true,
  xpEnabled: true,
  smartRestEnabled: true,
  lowMemoryMode: true,
}

export function canUsePreferenceStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

export function readStoredPreferences() {
  if (!canUsePreferenceStorage()) {
    return {}
  }

  try {
    return JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getStoredPreferences() {
  return {
    ...DEFAULT_PREFERENCES,
    ...readStoredPreferences(),
  }
}

export function writeStoredPreferences(preferences) {
  if (!canUsePreferenceStorage()) {
    return
  }

  const nextPreferences = {
    ...DEFAULT_PREFERENCES,
    ...preferences,
  }

  window.localStorage.setItem(
    PREFERENCES_STORAGE_KEY,
    JSON.stringify(nextPreferences),
  )
  window.dispatchEvent(
    new CustomEvent('iron:preferences-changed', {
      detail: nextPreferences,
    }),
  )
}
