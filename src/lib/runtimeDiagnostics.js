const DIAGNOSTIC_STORAGE_KEY = 'iron-runtime-diagnostics-v1'
const MAX_EVENTS = 80
const BOOT_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function readDiagnostics() {
  if (!canUseStorage()) {
    return {
      events: [],
    }
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY) ?? '{}')
    return {
      events: Array.isArray(parsed.events) ? parsed.events : [],
    }
  } catch {
    return {
      events: [],
    }
  }
}

function getMemorySnapshot() {
  const memory = performance?.memory

  if (!memory) {
    return null
  }

  return {
    jsHeapLimit: memory.jsHeapSizeLimit ?? null,
    totalJsHeap: memory.totalJSHeapSize ?? null,
    usedJsHeap: memory.usedJSHeapSize ?? null,
  }
}

export function recordRuntimeEvent(type, payload = {}) {
  if (!canUseStorage()) {
    return null
  }

  const currentDiagnostics = readDiagnostics()
  const event = {
    bootId: BOOT_ID,
    memory: getMemorySnapshot(),
    page: payload.page ?? null,
    payload,
    timestamp: new Date().toISOString(),
    type,
    url: window.location.href,
  }
  const events = [...currentDiagnostics.events, event].slice(-MAX_EVENTS)

  window.localStorage.setItem(
    DIAGNOSTIC_STORAGE_KEY,
    JSON.stringify({
      events,
    }),
  )

  return event
}

export function readRuntimeDiagnostics() {
  return readDiagnostics()
}

export function initializeRuntimeDiagnostics() {
  if (typeof window === 'undefined') {
    return () => {}
  }

  recordRuntimeEvent('boot', {
    deviceMemory: navigator.deviceMemory ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    userAgent: navigator.userAgent,
  })

  const handleError = (event) => {
    recordRuntimeEvent('window-error', {
      colno: event.colno ?? null,
      filename: event.filename ?? null,
      lineno: event.lineno ?? null,
      message: event.message ?? 'Window error',
      stack: event.error?.stack ?? null,
    })
  }
  const handleUnhandledRejection = (event) => {
    recordRuntimeEvent('unhandled-rejection', {
      message: event.reason?.message ?? `${event.reason ?? 'Unhandled promise rejection'}`,
      stack: event.reason?.stack ?? null,
    })
  }
  const handleVisibilityChange = () => {
    recordRuntimeEvent('visibility-change', {
      visibilityState: document.visibilityState,
    })
  }
  const handlePageHide = (event) => {
    recordRuntimeEvent('page-hide', {
      persisted: Boolean(event.persisted),
    })
  }
  const handleBeforeUnload = () => {
    recordRuntimeEvent('before-unload')
  }
  const sampleIntervalId = window.setInterval(() => {
    recordRuntimeEvent('memory-sample', {
      visibilityState: document.visibilityState,
    })
  }, 30000)

  window.addEventListener('error', handleError)
  window.addEventListener('unhandledrejection', handleUnhandledRejection)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('beforeunload', handleBeforeUnload)

  return () => {
    window.clearInterval(sampleIntervalId)
    window.removeEventListener('error', handleError)
    window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('beforeunload', handleBeforeUnload)
  }
}

export function getRuntimeBootId() {
  return BOOT_ID
}
