import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Page failed to render:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex h-full items-center justify-center px-5 py-12">
        <div className="w-full max-w-md rounded-2xl border border-red-500/30 bg-dark-800 p-6 text-center shadow-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
            <AlertTriangle className="h-6 w-6 text-red-400" />
          </div>
          <h2 className="mt-4 text-base font-bold text-slate-100">This section could not be displayed</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your records are safe. Reload this section to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-500"
          >
            <RefreshCw className="h-4 w-4" />
            Reload section
          </button>
        </div>
      </div>
    )
  }
}
