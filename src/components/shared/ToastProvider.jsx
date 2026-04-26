/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

function formatTimestamp(createdAt) {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(createdAt))
}

function getAccentColor(type) {
  if (type === 'gold') {
    return 'var(--gold)'
  }

  if (type === 'green') {
    return 'var(--green)'
  }

  return 'var(--muted)'
}

export function ToastProvider({ children }) {
  const nextToastId = useRef(0)
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((toastId) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== toastId))
  }, [])

  const dismissToast = useCallback(
    (toastId) => {
      setToasts((currentToasts) =>
        currentToasts.map((toast) =>
          toast.id === toastId ? { ...toast, state: 'exit' } : toast,
        ),
      )

      window.setTimeout(() => {
        removeToast(toastId)
      }, 180)
    },
    [removeToast],
  )

  const showToast = useCallback(
    (message, type = 'default') => {
      const toastId = nextToastId.current + 1
      nextToastId.current = toastId

      const nextToast = {
        createdAt: Date.now(),
        id: toastId,
        message,
        state: 'enter',
        type,
      }

      setToasts((currentToasts) => [...currentToasts, nextToast].slice(-3))

      window.setTimeout(() => {
        setToasts((currentToasts) =>
          currentToasts.map((toast) =>
            toast.id === toastId ? { ...toast, state: 'visible' } : toast,
          ),
        )
      }, 12)

      window.setTimeout(() => {
        dismissToast(toastId)
      }, 3500)

      return toastId
    },
    [dismissToast],
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start justify-between gap-4 rounded-[22px] border bg-[rgba(14,14,16,0.92)] px-4 py-3 shadow-[0_22px_60px_rgba(0,0,0,0.42)] backdrop-blur-xl transition-all duration-150 ease-out ${
              toast.state === 'enter'
                ? 'translate-x-6 opacity-0'
                : toast.state === 'exit'
                  ? 'translate-x-4 opacity-0'
                  : 'translate-x-0 opacity-100'
            }`}
            style={{
              borderColor: 'var(--border)',
              borderLeftColor: getAccentColor(toast.type),
              borderLeftWidth: '3px',
            }}
          >
            <p className="text-[13px] leading-6 text-zinc-100">{toast.message}</p>
            <span className="shrink-0 font-mono text-[11px] text-[var(--muted-2)]">
              {formatTimestamp(toast.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider.')
  }

  return context
}
