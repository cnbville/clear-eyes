import { Component } from 'react'
import { recordRuntimeEvent } from '../../lib/runtimeDiagnostics.js'

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    }
  }

  componentDidCatch(error, info) {
    recordRuntimeEvent('react-error', {
      componentStack: info?.componentStack ?? null,
      message: error?.message ?? 'React render error',
      stack: error?.stack ?? null,
    })
  }

  render() {
    if (this.state.error) {
      return (
        <section className="flex min-h-screen items-center justify-center bg-[#060606] px-5 text-zinc-50">
          <div className="w-full max-w-xl rounded-[28px] border border-coral/25 bg-coral/10 p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-coral">
              Runtime stopped
            </p>
            <h1 className="mt-4 text-[24px] font-bold text-zinc-50">
              The app caught an error before the browser could restart it.
            </h1>
            <p className="mt-3 text-[13px] leading-6 text-zinc-300">
              Diagnostics were saved locally. Refreshing is safe; the active workout recovery layer
              will still look for an in-progress session.
            </p>
            <button
              type="button"
              className="mt-5 rounded-xl bg-coral px-4 py-3 text-[12px] font-bold uppercase tracking-[0.16em] text-iron-950"
              onClick={() => window.location.reload()}
            >
              Reload App
            </button>
          </div>
        </section>
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
