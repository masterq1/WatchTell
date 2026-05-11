import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WatchTell] Uncaught error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-charcoal-900 p-8">
          <div className="max-w-lg w-full rounded-xl border border-red-700 bg-red-900/20 p-6 space-y-3">
            <h1 className="text-red-400 font-semibold text-sm uppercase tracking-wider">
              Something went wrong
            </h1>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap break-all font-mono">
              {error.message}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
