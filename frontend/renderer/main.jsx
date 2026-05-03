import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { QueryProvider } from './app/QueryProvider'
import { ThemeProvider } from './features/settings/ThemeProvider'
import { Toaster } from './components/ui/sonner'
import './index.css'

class ErrorBoundary extends React.Component {
  /** @type {{ error: Error | null }} */
  state = { error: null }

  /** @param {Error} error */
  static getDerivedStateFromError(error) {
    return { error }
  }

  /** @param {Error} error */
  componentDidCatch(error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          padding: 32, background: '#0c1a30', color: '#e2e8f0',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
        }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            Error al iniciar la aplicación
          </h2>
          <p style={{ fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 420, margin: 0 }}>
            Es posible que la base de datos restaurada sea de una versión incompatible
            o esté dañada. Cierra y vuelve a abrir la app, o restaura un respaldo anterior
            desde la carpeta <code style={{ fontSize: 11 }}>userData/backups/</code>.
          </p>
          <details style={{ width: '100%', maxWidth: 480 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
              Ver detalle del error
            </summary>
            <pre style={{
              background: '#1e293b', padding: 12, borderRadius: 6,
              overflow: 'auto', maxHeight: 160, fontSize: 11, color: '#f87171',
            }}>
              {this.state.error.message}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8, padding: '8px 28px', borderRadius: 6,
              background: '#3b82f6', color: '#fff', border: 'none',
              cursor: 'pointer', fontSize: 14, fontWeight: 600,
            }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return /** @type {any} */ (this.props.children)
  }
}

const container = /** @type {HTMLElement} */ (document.getElementById('root'))

// Quitar splash de carga cuando React monta
const splash = document.getElementById('app-splash')
if (splash) splash.remove()

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <App />
          <Toaster />
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
