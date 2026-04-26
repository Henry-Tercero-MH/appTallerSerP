import { useState } from 'react'
import {
  ChevronLeft, ChevronRight, Eye,
  TrendingUp, ShoppingBag, RefreshCw, Ban,
} from 'lucide-react'

import { Button }   from '@/components/ui/button'

import { PageHeader }     from '@/components/shared/PageHeader'
import { EmptyState }     from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay }   from '@/components/shared/MoneyDisplay'

import { useSales } from '@/hooks/useSales'
import { SaleDetailDialog } from './SaleDetailDialog'
import { VoidSaleDialog }   from './VoidSaleDialog'

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

export default function SalesHistoryPage() {
  const [page, setPage]             = useState(1)
  const [openSaleId, setOpenSaleId] = useState(/** @type {number | null} */ (null))
  const [voidSale,   setVoidSale]   = useState(/** @type {import('@/schemas/sale.schema').Sale | null} */ (null))

  const { data, isLoading, isError, error, refetch, isFetching } = useSales({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const canPrev    = page > 1
  const canNext    = data ? page < totalPages : false

  // Totales de la página actual
  const pageTotals = (data?.data ?? []).reduce(
    (acc, s) => ({ subtotal: acc.subtotal + s.subtotal, tax: acc.tax + s.tax_amount, total: acc.total + s.total }),
    { subtotal: 0, tax: 0, total: 0 }
  )

  return (
    <div className="sh-shell">
      <div className="sh-header-row">
        <PageHeader
          title="Historial de ventas"
          subtitle="Registro de todas las transacciones. Los datos son los snapshotados al momento de cobrar."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 self-start mt-1"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
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
          title="Sin ventas registradas"
          description="Cuando proceses una venta en Facturar aparecerá aquí."
          icon={<ShoppingBag className="h-10 w-10 opacity-25" />}
        />
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <div className="sh-table-card">
          {/* Tabla */}
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
                  <th className="sh-th sh-num w-24">IVA</th>
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
                      <td className="sh-td sh-num sh-tax">
                        <MoneyDisplay amount={sale.tax_amount} />
                      </td>
                      <td className={`sh-td sh-num ${isVoided ? 'sh-total-voided' : 'sh-total'}`}>
                        <MoneyDisplay amount={sale.total} />
                      </td>
                      <td className="sh-td text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            className="sh-eye-btn"
                            title="Ver detalle"
                            onClick={() => setOpenSaleId(sale.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {!isVoided && (
                            <button
                              className="sh-void-btn"
                              title="Anular venta"
                              onClick={() => setVoidSale(sale)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {/* Fila de totales de página */}
              <tfoot>
                <tr>
                  <td colSpan={6} className="sh-tf-label">
                    Subtotales de esta página ({data.data.length} registros)
                  </td>
                  <td className="sh-tf sh-num">
                    <MoneyDisplay amount={pageTotals.subtotal} />
                  </td>
                  <td className="sh-tf sh-num">
                    <MoneyDisplay amount={pageTotals.tax} />
                  </td>
                  <td className="sh-tf sh-num sh-tf-total">
                    <MoneyDisplay amount={pageTotals.total} />
                  </td>
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
                <strong>{data.total}</strong> venta{data.total === 1 ? '' : 's'} en total
              </span>
              {isFetching && <span className="sh-pag-updating">actualizando…</span>}
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || isFetching}
                className="h-7 px-2.5 text-xs"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Anterior
              </Button>
              {/* Números de página (máx 5 visibles) */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p     = start + i
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={isFetching}
                    className={`sh-pag-num ${p === page ? 'sh-pag-active' : ''}`}
                  >
                    {p}
                  </button>
                )
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext || isFetching}
                className="h-7 px-2.5 text-xs"
              >
                Siguiente <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <SaleDetailDialog
        open={openSaleId != null}
        onOpenChange={(open) => { if (!open) setOpenSaleId(null) }}
        saleId={openSaleId}
      />

      <VoidSaleDialog
        open={voidSale != null}
        onOpenChange={(open) => { if (!open) setVoidSale(null) }}
        sale={voidSale}
      />
    </div>
  )
}
