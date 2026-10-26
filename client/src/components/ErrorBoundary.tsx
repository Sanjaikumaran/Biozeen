import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { ErrorState } from './ui'

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error) {
    console.error(error)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <ErrorState error={new Error('Something went wrong while showing this page.')} onRetry={() => this.setState({ error: null })} />
      </div>
    )
  }
}

/** Contains a render error to the page that threw it; navigating elsewhere resets it. */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <Boundary key={pathname}>{children}</Boundary>
}
