import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ToastProvider } from './components/shared/ToastProvider.jsx'
import { CommandRegistryProvider } from './hooks/useCommandRegistry.js'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <CommandRegistryProvider>
        <App />
      </CommandRegistryProvider>
    </ToastProvider>
  </StrictMode>,
)
