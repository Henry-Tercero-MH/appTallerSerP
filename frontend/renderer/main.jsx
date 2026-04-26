import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { QueryProvider } from './app/QueryProvider'
import { ThemeProvider } from './features/settings/ThemeProvider'
import { Toaster } from './components/ui/sonner'
import './index.css'

const container = /** @type {HTMLElement} */ (document.getElementById('root'))

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <App />
        <Toaster />
      </ThemeProvider>
    </QueryProvider>
  </React.StrictMode>
)
