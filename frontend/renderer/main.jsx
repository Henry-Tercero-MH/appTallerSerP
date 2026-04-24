import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { QueryProvider } from './app/QueryProvider'
import { Toaster } from './components/ui/sonner'
import './index.css'

const container = /** @type {HTMLElement} */ (document.getElementById('root'))

/**
 * Orden intencional:
 *   QueryProvider por fuera para que Auth (y futuros features) puedan
 *   consumir queries. Toaster a nivel raiz para que cualquier rama lo alcance.
 */
ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <QueryProvider>
      <App />
      <Toaster />
    </QueryProvider>
  </React.StrictMode>
)
