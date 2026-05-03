import { useState, useEffect } from 'react'
import {
  ChevronLeft, ChevronRight, Eye,
  TrendingUp, ShoppingBag, RefreshCw, Ban, Undo2,
  Search, X, Calendar,
} from 'lucide-react'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'

import { PageHeader }     from '@/components/shared/PageHeader'
import { EmptyState }     from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay }   from '@/components/shared/MoneyDisplay'

import { useSales } from '@/hooks/useSales'
import { useTaxSettings } from '@/hooks/useSettings'
import { useAuthContext } from '@/features/auth/AuthContext'
import { SaleDetailDialog } from './SaleDetailDialog'
import { VoidSaleDialog }   from './VoidSaleDialog'
import { ReturnDialog }     from './ReturnDialog'

const PAGE_SIZE = 25

const dateFmt = new Intl.DateTimeFormat('es-GT', {
  year:   'numeric',
  month:  '2-digit',
  day:    '2-digit',
  hour:   '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** @type {Record<string, { label: string, cls: string }>} */
const PAYMENT_LABELS = {
  cash:     { label: 'Efectivo',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  credit:   { label: 'Crédito',        cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  card:     { label: 'Tarjeta',        cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  transfer: { label: 'Transferencia',  cls: 'bg-violet-50 text-violet-700 border-violet-200' },
}

const CLIENT_LABELS = {
  cf:         'C/F',
  registered: 'Registrado',
  company:    'Empresa',
}

const STATUS_OPTS = [
  { value: '',       label: 'Todas'   },
  { value: 'active', label: 'Activas' },
  { value: 'voided', label: 'Anuladas'},
]

export default function SalesHistoryPage() {
  const { enabled: taxEnabled } = useTaxSettings()
  const { user } = useAuthContext()
  const isCashier = user?.role === 'cashier'
  const [page,          setPage]          = useState(1)
  const [openSaleId,    setOpenSaleId]    = useState(/** @type {number | null} */ (null))
  const [voidSale,      setVoidSale]      = useState(/** @type {any} */ (null))
  const [returnSaleId,  setReturnSaleId]  = useState(/** @type {number | null} */ (null))

  // filtros
  const [search,  setSearch]  = useState('')
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')
  const [status,  setStatus]  = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // resetear página cuando cambia cualquier filtro
  useEffect(() => { setPage(1) }, [debouncedSearch, from, to, status])

  const hasFilters = !!(debouncedSearch || from || to || status)

  function clearFilters() {
    setSearch(''); setFrom(''); setTo(''); setStatus('')
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useSales({
    page,
    pageSize: PAGE_SIZE,
    search:  debouncedSearch || undefined,
    from:    from  || undefined,
    to:      to    || undefined,
    status:  status || undefined,
    userId:  isCashier ? user?.id : undefined,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const canPrev    = page > 1
  const canNext    = data ? page < totalPages : false

  const pageTotals = (data?.data ?? []).reduce(
    (acc, s) => ({ subtotal: acc.subtotal + s.subtotal, tax: acc.tax + s.tax_amount, total: acc.total + s.total }),
    { subtotal: 0, tax: 0, total: 0 }
  )

  return (
    <div className="sh-shell">
      <div className="sh-header-row">
        <PageHeader
          title="Historial de ventas"
          subtitle="Registro de todas las transacciones."
        />
        <Button
          variant="outline" size="sm"
          onClick={() => refetch()} disabled={isFetching}
          className="shrink-0 self-start mt-1"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar folio, cliente o NIT..."
            className="pl-8 h-8 text-xs w-56"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="date" value={from}
            onChange={e => setFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date" value={to}
            onChange={e => setTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          />
        </div>

        <div className="flex rounded-md border border-input overflow-hidden text-xs">
          {STATUS_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`px-3 h-8 transition-colors ${
                status === opt.value
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-xs text-muted-foreground">
            <X className="mr-1 h-3 w-3" /> Limpiar filtros
          </Button>
        )}
      </div>

      {/* ── Cuerpo ── */}
      {isLoading && (
        <LoadingSpinner label="Cargando historial..." className="justify-center py-16" />
      )}

      {isError && (
        <EmptyState
          title="No se pudo cargar el historial"
          description={error instanceof Error ? error.message : 'Error desconocido'}
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {!isLoading && !isError && data?.data.length === 0 && (
        <EmptyState
          title={hasFilters ? 'Sin resultados para los filtros aplicados' : 'Sin ventas registradas'}
          description={hasFilters ? 'Prueba ajustando la búsqueda o el rango de fechas.' : 'Cuando proceses una venta en Facturar aparecerá aquí.'}
          icon={<ShoppingBag className="h-10 w-10 opacity-25" />}
          action={hasFilters
            ? <Button variant="outline" size="sm" onClick={clearFilters}><X className="mr-1 h-3.5 w-3.5" />Limpiar filtros</Button>
            : undefined
          }
        />
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <div className="sh-table-card">
          <div className="sh-table-scroll">
            <table className="sh-table">
              <thead>
                <tr>
                  <th className="sh-th w-20">Folio</th>
                  <th className="sh-th w-36">Fecha y hora</th>
                  <th className="sh-th">Cliente</th>
                  <th className="sh-th w-28">NIT</th>
                  <th className="sh-th w-24">Tipo</th>
                  <th className="sh-th w-28">Pago</th>
                  <th className="sh-th sh-num w-28">Subtotal</th>
                  {taxEnabled && <th className="sh-th sh-num w-24">IVA</th>}
                  <th className="sh-th sh-num w-28">Total</th>
                  <th className="sh-th w-16" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((sale, idx) => {
                  const pmKey = sale.payment_method ?? ''
                  const ctKey = sale.client_type    ?? ''
                  const pm    = PAYMENT_LABELS[pmKey] ?? { label: pmKey || '—', cls: '' }
                  const ct    = CLIENT_LABELS[ctKey]  ?? (ctKey || '—')
                  const date  = dateFmt.format(new Date(sale.date.replace(' ', 'T')))
                  const [datePart, timePart] = date.split(', ')
                  const isVoided = sale.status === 'voided'
                  return (
                    <tr key={sale.id} className={isVoided ? 'sh-tr-voided' : idx % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td">
                        <div className="flex items-center gap-1.5">
                          <span className="sh-folio">{sale.id}</span>
                          {isVoided && <span className="sh-badge-voided">Anulada</span>}
                        </div>
                      </td>
                      <td className="sh-td">
                        <span className="sh-date-main">{datePart}</span>
                        <span className="sh-date-time">{timePart}</span>
                      </td>
                      <td className="sh-td sh-customer">
                        {sale.customer_name_snapshot ?? 'Consumidor Final'}
                      </td>
                      <td className="sh-td sh-nit">
                        {sale.customer_nit_snapshot ?? 'C/F'}
                      </td>
                      <td className="sh-td">
                        <span className="sh-client-type">{ct}</span>
                      </td>
                      <td className="sh-td">
                        {!isVoided && <span className={`sh-payment-badge ${pm.cls}`}>{pm.label}</span>}
                      </td>
                      <td className="sh-td sh-num sh-amount">
                        <MoneyDisplay amount={sale.subtotal} />
                      </td>
                      {taxEnabled && (
                        <td className="sh-td sh-num sh-tax">
                          <MoneyDisplay amount={sale.tax_amount} />
                        </td>
                      )}
                      <td className={`sh-td sh-num ${isVoided ? 'sh-total-voided' : 'sh-total'}`}>
                        <MoneyDisplay amount={sale.total} />
                      </td>
                      <td className="sh-td text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button className="sh-eye-btn" title="Ver detalle" onClick={() => setOpenSaleId(sale.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {!isVoided && (
                            <>
                              <button className="sh-void-btn" title="Devolver productos" onClick={() => setReturnSaleId(sale.id)}>
                                <Undo2 className="h-3.5 w-3.5" />
                              </button>
                              <button className="sh-void-btn" title="Anular venta" onClick={() => setVoidSale(sale)}>
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="sh-tf-label">
                    Subtotales de esta página ({data.data.length} registros
                    {hasFilters && ` · filtrado de ${data.total} total`})
                  </td>
                  <td className="sh-tf sh-num"><MoneyDisplay amount={pageTotals.subtotal} /></td>
                  {taxEnabled && <td className="sh-tf sh-num"><MoneyDisplay amount={pageTotals.tax} /></td>}
                  <td className="sh-tf sh-num sh-tf-total"><MoneyDisplay amount={pageTotals.total} /></td>
                  <td className="sh-tf" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Paginación */}
          <div className="sh-pagination">
            <div className="sh-pag-info">
              <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                Página <strong>{data.page}</strong> de <strong>{totalPages}</strong>
                &nbsp;·&nbsp;
                <strong>{data.total}</strong> venta{data.total === 1 ? '' : 's'}
                {hasFilters && ' (filtradas)'}
              </span>
              {isFetching && <span className="sh-pag-updating">actualizando…</span>}
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={!canPrev || isFetching} className="h-7 px-2.5 text-xs">
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Anterior
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p     = start + i
                return (
                  <button key={p} onClick={() => setPage(p)} disabled={isFetching}
                    className={`sh-pag-num ${p === page ? 'sh-pag-active' : ''}`}>
                    {p}
                  </button>
                )
              })}
              <Button variant="outline" size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={!canNext || isFetching} className="h-7 px-2.5 text-xs">
                Siguiente <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <SaleDetailDialog
        open={openSaleId != null}
        onOpenChange={open => { if (!open) setOpenSaleId(null) }}
        saleId={openSaleId}
      />
      <VoidSaleDialog
        open={voidSale != null}
        onOpenChange={open => { if (!open) setVoidSale(null) }}
        sale={voidSale}
      />
      <ReturnDialog
        saleId={returnSaleId}
        onClose={() => setReturnSaleId(null)}
      />
    </div>
  )
}
