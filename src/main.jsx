import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './components/shared/AppErrorBoundary.jsx'
import { ToastProvider } from './components/shared/ToastProvider.jsx'
import { CommandRegistryProvider } from './hooks/useCommandRegistry.js'
import { getStoredPreferences } from './lib/preferences.js'
import { initializeRuntimeDiagnostics } from './lib/runtimeDiagnostics.js'

function applyRenderingPreferences(preferences = getStoredPreferences()) {
  if (typeof document === 'undefined') {
    return
  }

  document.documentElement.dataset.ironLowMemory =
    preferences.lowMemoryMode === false ? 'false' : 'true'
}

applyRenderingPreferences()
initializeRuntimeDiagnostics()

if (typeof window !== 'undefined') {
  window.addEventListener('iron:preferences-changed', (event) => {
    applyRenderingPreferences(event.detail)
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <ToastProvider>
        <CommandRegistryProvider>
          <App />
        </CommandRegistryProvider>
      </ToastProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
