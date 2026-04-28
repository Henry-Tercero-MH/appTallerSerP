import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Package, Users, ReceiptText, X } from 'lucide-react'
import { useSearchProducts } from '@/hooks/useProducts'
import { useSearchCustomers } from '@/hooks/useCustomers'
import { useSales } from '@/hooks/useSales'
import { ROUTES } from '@/lib/constants'

const fmtMoney = (n) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

export function GlobalSearch() {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(/** @type {HTMLInputElement|null} */ (null))
  const navigate = useNavigate()

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [open])

  const enabled = open && query.trim().length >= 2

  const { data: products  = [] } = useSearchProducts(enabled ? query : '')
  const { data: customers = [] } = useSearchCustomers(query, { enabled })
  const { data: salesData }      = useSales({ page: 1, pageSize: 5, search: enabled ? query : undefined })
  const sales = salesData?.data ?? []

  const hasResults = products.length > 0 || customers.length > 0 || sales.length > 0

  const go = useCallback((path) => {
    setOpen(false)
    navigate(path)
  }, [navigate])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="gs-trigger"
        title="Búsqueda global (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="gs-trigger-text">Buscar...</span>
        <kbd className="gs-kbd">Ctrl K</kbd>
      </button>
    )
  }

  return (
    <div className="gs-overlay" onClick={() => setOpen(false)}>
      <div className="gs-panel" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="gs-input-row">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar productos, clientes o ventas..."
            className="gs-input"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Results */}
        {query.trim().length < 2 && (
          <p className="gs-hint">Escribe al menos 2 caracteres para buscar.</p>
        )}

        {query.trim().length >= 2 && !hasResults && (
          <p className="gs-hint">Sin resultados para «{query}».</p>
        )}

        {products.length > 0 && (
          <div className="gs-group">
            <p className="gs-group-label"><Package className="h-3 w-3" /> Productos</p>
            {products.slice(0, 5).map(p => (
              <button
                key={p.id}
                className="gs-item"
                onClick={() => go(ROUTES.INVENTORY)}
              >
                <span className="gs-item-main">{p.name}</span>
                <span className="gs-item-sub">{p.code} · Stock: {p.stock} · {fmtMoney(p.price)}</span>
              </button>
            ))}
          </div>
        )}

        {customers.length > 0 && (
          <div className="gs-group">
            <p className="gs-group-label"><Users className="h-3 w-3" /> Clientes</p>
            {customers.slice(0, 5).map(c => (
              <button
                key={c.id}
                className="gs-item"
                onClick={() => go(ROUTES.CLIENTS)}
              >
                <span className="gs-item-main">{c.name}</span>
                <span className="gs-item-sub">{c.nit ?? 'Sin NIT'}{c.phone ? ` · ${c.phone}` : ''}</span>
              </button>
            ))}
          </div>
        )}

        {sales.length > 0 && (
          <div className="gs-group">
            <p className="gs-group-label"><ReceiptText className="h-3 w-3" /> Ventas</p>
            {sales.map(s => (
              <button
                key={s.id}
                className="gs-item"
                onClick={() => go(ROUTES.HISTORY)}
              >
                <span className="gs-item-main">Venta #{String(s.id).padStart(6, '0')}</span>
                <span className="gs-item-sub">
                  {s.customer_name_snapshot ?? 'C/F'} · {fmtMoney(s.total)}
                </span>
              </button>
            ))}
          </div>
        )}

        <p className="gs-footer">↵ navegar · Esc cerrar</p>
      </div>
    </div>
  )
}
