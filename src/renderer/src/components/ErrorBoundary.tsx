import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/design-system'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6 text-center text-white">
        <h1 className="text-2xl font-extrabold">Щось пішло не так</h1>
        <p className="text-sm text-grey">Ваші дані збережені на цьому пристрої.</p>
        <Button variant="paper" onClick={() => location.reload()}>
          Перезавантажити
        </Button>
      </div>
    )
  }
}
