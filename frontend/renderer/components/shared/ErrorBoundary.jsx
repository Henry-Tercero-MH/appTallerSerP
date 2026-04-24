import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Captura errores de render en el subarbol y muestra un fallback accionable.
 * No atrapa errores de effects asincronos ni de mutations (esos los maneja
 * TanStack Query + toasts). Uso principal: evitar pantalla en blanco por
 * bug en un feature.
 *
 * @extends {React.Component<{ children: React.ReactNode, fallback?: React.ReactNode }, { error: Error | null }>}
 */
export class ErrorBoundary extends React.Component {
  /** @param {{ children: React.ReactNode, fallback?: React.ReactNode }} props */
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  /** @param {Error} error */
  static getDerivedStateFromError(error) {
    return { error }
  }

  /**
   * @param {Error} error
   * @param {React.ErrorInfo} info
   */
  componentDidCatch(error, info) {
    // En Electron dev esto aparece en la DevTools. En prod se puede enganchar
    // a un sink de logs local cuando exista.
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <div>
            <p className="font-semibold text-foreground">Algo fallo al renderizar esta vista</p>
            <p className="mt-1 text-sm text-muted-foreground">{this.state.error.message}</p>
          </div>
          <Button variant="outline" size="sm" onClick={this.reset}>Reintentar</Button>
        </div>
      )
    }
    return this.props.children
  }
}
