import { useState } from 'react'
import {
  BarChart3, RefreshCw, ShoppingCart, TrendingUp, Package,
  FileSpreadsheet, FileText, Download, AlertTriangle, Users,
  CalendarDays, ClipboardList,
} from 'lucide-react'

import { Button }       from '@/components/ui/button'
import { PageHeader }   from '@/components/shared/PageHeader'
import { EmptyState }   from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'

import { useDailyReport }     from '@/hooks/useSales'
import { useProducts }        from '@/hooks/useProducts'
import { useSearchCustomers } from '@/hooks/useCustomers'

import {
  exportDailySalesExcel,
  exportDailySalesPDF,
  exportSalesHistoryExcel,
  exportSalesHistoryPDF,
  exportInventoryExcel,
  exportInventoryPDF,
  exportCustomersExcel,
  exportPurchaseOrderExcel,
  exportPurchaseOrderPDF,
} from '@/lib/reports'

const dateFmt = new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' })

// Umbral de stock bajo configurable en esta sesión (futuro: desde settings DB)
const DEFAULT_THRESHOLD = 5

export default function ReportsPage() {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD)
  const [histRange, setHistRange] = useState({
    from: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
    to:   new Date().toISOString().slice(0, 10),
  })
  const [loadingReport, setLoadingReport] = useState(/** @type {string|null} */ (null))

  const { data: dailyData, isLoading: dailyLoading, isError: dailyError, refetch, isFetching } = useDailyReport()
  const { data: products = [] } = useProducts()
  const { data: customers = [] } = useSearchCustomers('', { includeInactive: true })

  const summary     = dailyData?.summary ?? null
  const topProducts = dailyData?.topProducts ?? []
  const lowStock    = products.filter(p => p.is_active === 1 && p.stock <= threshold)
  const activeProds = products.filter(p => p.is_active === 1)

  /** Envuelve una descarga async con indicador de carga */
  async function run(key, fn) {
    setLoadingReport(key)
    try {
      await fn()
    } finally {
      setLoadingReport(null)
    }
  }

  /** Descarga historial completo desde el main (todas las páginas) */
  async function fetchAllSales() {
    const res = await window.api.sales.list({ page: 1, pageSize: 200 })
    if (!res.ok) throw new Error(res.error?.message ?? 'Error')
    return res.data.data
  }

  return (
    <div className="sh-shell">
      <div className="sh-header-row">
        <PageHeader
          title="Reportes"
          subtitle={`Resumen del día — ${dateFmt.format(new Date())}`}
        />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0 self-start mt-1">
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* ── KPIs del día ──────────────────────────────────────────────────── */}
      {dailyLoading && <LoadingSpinner label="Cargando datos..." className="justify-center py-10" />}
      {dailyError && <EmptyState title="Error al cargar reportes" description="Intenta actualizar." />}

      {!dailyLoading && !dailyError && (
        <>
          <div className="rp-kpi-grid">
            <KpiCard icon={<ShoppingCart className="h-4 w-4 text-primary" />}
              label="Ventas realizadas" value={summary?.sale_count ?? 0} suffix="órdenes" />
            <KpiCard icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              label="Subtotal del día" value={<MoneyDisplay amount={summary?.subtotal ?? 0} />} />
            <KpiCard icon={<BarChart3 className="h-4 w-4 text-blue-600" />}
              label="IVA cobrado" value={<MoneyDisplay amount={summary?.tax_amount ?? 0} />} />
            <KpiCard icon={<TrendingUp className="h-4 w-4 text-primary" />}
              label="Total del día" value={<MoneyDisplay amount={summary?.total ?? 0} />} highlight />
          </div>

          {/* Top productos del día */}
          {topProducts.length > 0 && (
            <div className="sh-table-card rp-top-card">
              <div className="rp-section-header">
                <Package className="h-4 w-4 text-primary" />
                <span>Top productos vendidos hoy</span>
              </div>
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th className="sh-th w-10">#</th>
                      <th className="sh-th w-28">Código</th>
                      <th className="sh-th">Producto</th>
                      <th className="sh-th sh-num w-24">Unidades</th>
                      <th className="sh-th sh-num w-28">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={p.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                        <td className="sh-td sh-nit">{i + 1}</td>
                        <td className="sh-td"><span className="inv-code">{p.code ?? '—'}</span></td>
                        <td className="sh-td inv-name">{p.name ?? '—'}</td>
                        <td className="sh-td sh-num sh-total">{p.units_sold}</td>
                        <td className="sh-td sh-num sh-total"><MoneyDisplay amount={p.revenue} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Sección de reportes descargables ──────────────────────────────── */}
      <div className="rp-downloads-title">
        <Download className="h-4 w-4" />
        <span>Descargar reportes</span>
      </div>

      <div className="rp-cards-grid">

        {/* Ventas del día */}
        <ReportCard
          icon={<ShoppingCart className="h-5 w-5 text-primary" />}
          title="Ventas del día"
          description="KPIs y top productos de hoy."
          actions={[
            {
              label: 'Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, color: 'green',
              onClick: () => run('daily-xlsx', async () => exportDailySalesExcel({ summary, topProducts })),
              loading: loadingReport === 'daily-xlsx',
            },
            {
              label: 'PDF', icon: <FileText className="h-3.5 w-3.5" />, color: 'red',
              onClick: () => run('daily-pdf', async () => exportDailySalesPDF({ summary, topProducts })),
              loading: loadingReport === 'daily-pdf',
            },
          ]}
        />

        {/* Historial de ventas */}
        <ReportCard
          icon={<CalendarDays className="h-5 w-5 text-blue-600" />}
          title="Historial de ventas"
          description="Todas las ventas en el rango de fechas."
          extra={
            <div className="rp-date-range">
              <div className="rp-date-field">
                <label>Desde</label>
                <input type="date" value={histRange.from}
                  onChange={e => setHistRange(r => ({ ...r, from: e.target.value }))}
                  className="al-filter-input" />
              </div>
              <div className="rp-date-field">
                <label>Hasta</label>
                <input type="date" value={histRange.to}
                  onChange={e => setHistRange(r => ({ ...r, to: e.target.value }))}
                  className="al-filter-input" />
              </div>
            </div>
          }
          actions={[
            {
              label: 'Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, color: 'green',
              onClick: () => run('hist-xlsx', async () => {
                const sales = await fetchAllSales()
                exportSalesHistoryExcel(sales, histRange)
              }),
              loading: loadingReport === 'hist-xlsx',
            },
            {
              label: 'PDF', icon: <FileText className="h-3.5 w-3.5" />, color: 'red',
              onClick: () => run('hist-pdf', async () => {
                const sales = await fetchAllSales()
                exportSalesHistoryPDF(sales, histRange)
              }),
              loading: loadingReport === 'hist-pdf',
            },
          ]}
        />

        {/* Inventario */}
        <ReportCard
          icon={<Package className="h-5 w-5 text-amber-600" />}
          title="Inventario / Stock"
          description={`${activeProds.length} productos activos · ${lowStock.length} con stock bajo.`}
          actions={[
            {
              label: 'Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, color: 'green',
              onClick: () => run('inv-xlsx', async () => exportInventoryExcel(products)),
              loading: loadingReport === 'inv-xlsx',
            },
            {
              label: 'PDF', icon: <FileText className="h-3.5 w-3.5" />, color: 'red',
              onClick: () => run('inv-pdf', async () => exportInventoryPDF(products)),
              loading: loadingReport === 'inv-pdf',
            },
          ]}
        />

        {/* Clientes */}
        <ReportCard
          icon={<Users className="h-5 w-5 text-violet-600" />}
          title="Directorio de clientes"
          description={`${customers.length} clientes en total.`}
          actions={[
            {
              label: 'Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, color: 'green',
              onClick: () => run('clients-xlsx', async () => exportCustomersExcel(customers)),
              loading: loadingReport === 'clients-xlsx',
            },
          ]}
        />

        {/* Hoja de pedido */}
        <ReportCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          title="Hoja de pedido"
          description={`Productos con stock ≤ umbral configurado. Actualmente: ${lowStock.length} producto${lowStock.length === 1 ? '' : 's'}.`}
          badge={lowStock.length > 0 ? { label: `${lowStock.length} pendientes`, color: 'red' } : null}
          extra={
            <div className="rp-threshold">
              <label className="rp-threshold-label">Umbral de stock bajo</label>
              <div className="rp-threshold-row">
                <button className="rp-th-btn" onClick={() => setThreshold(t => Math.max(1, t - 1))}>−</button>
                <span className="rp-th-val">{threshold}</span>
                <button className="rp-th-btn" onClick={() => setThreshold(t => t + 1)}>+</button>
                <span className="rp-threshold-label">unidades</span>
              </div>
            </div>
          }
          actions={[
            {
              label: 'Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, color: 'green',
              onClick: () => run('order-xlsx', async () => exportPurchaseOrderExcel(lowStock, threshold)),
              loading: loadingReport === 'order-xlsx',
              disabled: lowStock.length === 0,
            },
            {
              label: 'PDF', icon: <FileText className="h-3.5 w-3.5" />, color: 'red',
              onClick: () => run('order-pdf', async () => exportPurchaseOrderPDF(lowStock, threshold)),
              loading: loadingReport === 'order-pdf',
              disabled: lowStock.length === 0,
            },
          ]}
        />

        {/* Top productos general */}
        <ReportCard
          icon={<ClipboardList className="h-5 w-5 text-emerald-600" />}
          title="Top productos (hoy)"
          description="Ranking de productos más vendidos del día."
          actions={[
            {
              label: 'Excel', icon: <FileSpreadsheet className="h-3.5 w-3.5" />, color: 'green',
              onClick: () => run('top-xlsx', async () => {
                const { exportDailySalesExcel: fn } = await import('@/lib/reports')
                fn({ summary, topProducts })
              }),
              loading: loadingReport === 'top-xlsx',
              disabled: topProducts.length === 0,
            },
            {
              label: 'PDF', icon: <FileText className="h-3.5 w-3.5" />, color: 'red',
              onClick: () => run('top-pdf', async () => exportDailySalesPDF({ summary, topProducts })),
              loading: loadingReport === 'top-pdf',
              disabled: topProducts.length === 0,
            },
          ]}
        />

      </div>
    </div>
  )
}

// ─── Componentes internos ────────────────────────────────────────────────────

function KpiCard({ icon, label, value, suffix, highlight = false }) {
  return (
    <div className={`rp-kpi ${highlight ? 'rp-kpi-hl' : ''}`}>
      <div className="rp-kpi-top">
        {icon}
        <span className="rp-kpi-label">{label}</span>
      </div>
      <div className="rp-kpi-value">{value}</div>
      {suffix && <p className="rp-kpi-suffix">{suffix}</p>}
    </div>
  )
}

/**
 * @param {{
 *   icon: React.ReactNode,
 *   title: string,
 *   description: string,
 *   extra?: React.ReactNode,
 *   badge?: { label: string, color: string } | null,
 *   actions: { label: string, icon: React.ReactNode, color: string, onClick: () => void, loading?: boolean, disabled?: boolean }[],
 * }} props
 */
function ReportCard({ icon, title, description, extra, badge, actions }) {
  return (
    <div className="rp-card">
      <div className="rp-card-header">
        <div className="rp-card-icon">{icon}</div>
        <div className="rp-card-info">
          <div className="flex items-center gap-2">
            <span className="rp-card-title">{title}</span>
            {badge && (
              <span className={`rp-badge rp-badge-${badge.color}`}>{badge.label}</span>
            )}
          </div>
          <span className="rp-card-desc">{description}</span>
        </div>
      </div>
      {extra && <div className="rp-card-extra">{extra}</div>}
      <div className="rp-card-actions">
        {actions.map((a) => (
          <button
            key={a.label}
            className={`rp-dl-btn rp-dl-${a.color} ${a.disabled ? 'rp-dl-disabled' : ''}`}
            onClick={a.onClick}
            disabled={a.disabled || a.loading}
          >
            {a.loading
              ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              : a.icon
            }
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
