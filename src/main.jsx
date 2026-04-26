import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './components/shared/AppErrorBoundary.jsx'
import { ToastProvider } from './components/shared/ToastProvider.jsx'
import { CommandRegistryProvider } from './hooks/useCommandRegistry.js'
import { initializeRuntimeDiagnostics } from './lib/runtimeDiagnostics.js'

initializeRuntimeDiagnostics()

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
