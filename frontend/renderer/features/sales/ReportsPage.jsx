import { useState, useMemo } from 'react'
import {
  BarChart3, RefreshCw, ShoppingCart, TrendingUp, TrendingDown, Package,
  FileSpreadsheet, FileText, Download, AlertTriangle, Users,
  CalendarDays, ClipboardList, Clock, CreditCard, Scale,
} from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Legend,
} from 'recharts'

import { Button }       from '@/components/ui/button'
import { PageHeader }   from '@/components/shared/PageHeader'
import { EmptyState }   from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'

import { useDailyReport, useRangeReport } from '@/hooks/useSales'
import { useExpenseSummary }              from '@/hooks/useExpenses'
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
  const [chartRange, setChartRange] = useState({
    from: new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10),
    to:   new Date().toISOString().slice(0, 10),
  })
  const [chartType, setChartType] = useState(/** @type {'bar'|'line'} */ ('bar'))
  const [loadingReport, setLoadingReport] = useState(/** @type {string|null} */ (null))
  const [plRange, setPlRange] = useState({
    from: new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10),
    to:   new Date().toISOString().slice(0, 10),
  })

  const { data: dailyData, isLoading: dailyLoading, isError: dailyError, refetch, isFetching } = useDailyReport()
  const { data: rangeData, isLoading: rangeLoading } = useRangeReport(chartRange)
  const { data: plRangeData }   = useRangeReport(plRange)
  const { data: plExpenses }    = useExpenseSummary(plRange.from, plRange.to)
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

      {/* ── Análisis por rango ────────────────────────────────────────────── */}
      <AnalyticsSection chartRange={chartRange} setChartRange={setChartRange} rangeData={rangeData} rangeLoading={rangeLoading} />

      {/* ── P&L Ingresos vs Egresos ─────────────────────────────────────────── */}
      <PLSection
        plRange={plRange}
        setPlRange={setPlRange}
        rangeData={plRangeData}
        expenses={plExpenses}
      />

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

// ─── P&L ─────────────────────────────────────────────────────────────────────

function PLSection({ plRange, setPlRange, rangeData, expenses }) {
  const ingresos = rangeData?.series?.reduce((s, r) => s + r.total, 0) ?? 0
  const egresos  = expenses?.total ?? 0
  const utilidad = ingresos - egresos
  const margen   = ingresos > 0 ? ((utilidad / ingresos) * 100).toFixed(1) : '0.0'

  return (
    <div className="rp-chart-section">
      <div className="rp-chart-header">
        <div className="rp-section-header">
          <Scale className="h-4 w-4 text-primary" />
          <span>Ingresos vs Egresos (P&amp;L)</span>
        </div>
        <div className="rp-date-range">
          <div className="rp-date-field">
            <label>Desde</label>
            <input type="date" value={plRange.from}
              onChange={e => setPlRange(r => ({ ...r, from: e.target.value }))}
              className="al-filter-input" />
          </div>
          <div className="rp-date-field">
            <label>Hasta</label>
            <input type="date" value={plRange.to}
              onChange={e => setPlRange(r => ({ ...r, to: e.target.value }))}
              className="al-filter-input" />
          </div>
        </div>
      </div>

      <div className="rp-kpi-grid">
        <div className="rp-kpi">
          <div className="rp-kpi-top">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="rp-kpi-label">Ingresos (ventas)</span>
          </div>
          <div className="rp-kpi-value text-emerald-700">{fmtMoney(ingresos)}</div>
        </div>
        <div className="rp-kpi">
          <div className="rp-kpi-top">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="rp-kpi-label">Egresos (gastos)</span>
          </div>
          <div className="rp-kpi-value text-red-600">{fmtMoney(egresos)}</div>
        </div>
        <div className={`rp-kpi ${utilidad >= 0 ? 'rp-kpi-hl' : ''}`} style={utilidad < 0 ? { borderColor: '#fca5a5', background: '#fff1f2' } : {}}>
          <div className="rp-kpi-top">
            <Scale className="h-4 w-4" style={{ color: utilidad >= 0 ? 'var(--primary)' : '#dc2626' }} />
            <span className="rp-kpi-label">Utilidad neta</span>
          </div>
          <div className="rp-kpi-value" style={{ color: utilidad >= 0 ? 'var(--primary)' : '#dc2626' }}>
            {fmtMoney(utilidad)}
          </div>
          <p className="rp-kpi-suffix">Margen: {margen}%</p>
        </div>
        <div className="rp-kpi">
          <div className="rp-kpi-top">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            <span className="rp-kpi-label">Gastos registrados</span>
          </div>
          <div className="rp-kpi-value">{expenses?.count ?? 0}</div>
          <p className="rp-kpi-suffix">registros en el período</p>
        </div>
      </div>

      {expenses?.byCategory?.length > 0 && (
        <div className="sh-table-card mt-4">
          <div className="rp-section-header px-3 pt-3">
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
            <span className="text-sm font-medium">Gastos por categoría</span>
          </div>
          <div className="sh-table-scroll">
            <table className="sh-table">
              <thead>
                <tr>
                  <th className="sh-th">Categoría</th>
                  <th className="sh-th sh-num w-32">Monto</th>
                  <th className="sh-th w-36">% del total</th>
                </tr>
              </thead>
              <tbody>
                {expenses.byCategory.map((cat, i) => {
                  const pct = egresos > 0 ? ((cat.total / egresos) * 100).toFixed(1) : '0'
                  return (
                    <tr key={cat.category} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td font-medium capitalize">{cat.category}</td>
                      <td className="sh-td sh-num text-red-600 font-semibold">{fmtMoney(cat.total)}</td>
                      <td className="sh-td">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-1.5">
                            <div className="bg-red-400 rounded-full h-1.5" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componentes internos ────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const PAYMENT_LABELS = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', check: 'Cheque' }
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899']

function fmtMoney(v) {
  return `Q${Number(v).toLocaleString('es-GT', { minimumFractionDigits: 2 })}`
}

function buildHourData(byHour) {
  return Array.from({ length: 24 }, (_, h) => {
    const found = byHour.find(r => r.hour === h)
    return { hour: `${String(h).padStart(2,'0')}:00`, sale_count: found?.sale_count ?? 0, total: found?.total ?? 0 }
  })
}

function buildWeekdayData(byWeekday) {
  return WEEKDAY_LABELS.map((label, i) => {
    const found = byWeekday.find(r => r.weekday === i)
    return { weekday: label, sale_count: found?.sale_count ?? 0, total: found?.total ?? 0 }
  })
}

function AnalyticsSection({ chartRange, setChartRange, rangeData, rangeLoading }) {
  const [chartType, setChartType] = useState(/** @type {'bar'|'line'} */ ('bar'))

  const hourData    = useMemo(() => rangeData ? buildHourData(rangeData.byHour) : [], [rangeData])
  const weekdayData = useMemo(() => rangeData ? buildWeekdayData(rangeData.byWeekday) : [], [rangeData])
  const pieData     = useMemo(() => rangeData
    ? rangeData.byPaymentMethod.map(r => ({ name: PAYMENT_LABELS[r.method] ?? r.method, value: r.sale_count, total: r.total }))
    : [], [rangeData])

  const peakHour    = useMemo(() => hourData.reduce((a, b) => b.sale_count > a.sale_count ? b : a, hourData[0]), [hourData])
  const peakDay     = useMemo(() => weekdayData.reduce((a, b) => b.sale_count > a.sale_count ? b : a, weekdayData[0]), [weekdayData])
  const totalSales  = rangeData?.series.reduce((s, r) => s + r.sale_count, 0) ?? 0
  const totalRev    = rangeData?.series.reduce((s, r) => s + r.total, 0) ?? 0

  return (
    <div className="rp-chart-section">
      {/* Header con controles */}
      <div className="rp-chart-header">
        <div className="rp-section-header">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span>Análisis de ventas</span>
        </div>
        <div className="rp-chart-controls">
          <div className="rp-date-range">
            <div className="rp-date-field">
              <label>Desde</label>
              <input type="date" value={chartRange.from}
                onChange={e => setChartRange(r => ({ ...r, from: e.target.value }))}
                className="al-filter-input" />
            </div>
            <div className="rp-date-field">
              <label>Hasta</label>
              <input type="date" value={chartRange.to}
                onChange={e => setChartRange(r => ({ ...r, to: e.target.value }))}
                className="al-filter-input" />
            </div>
          </div>
          <div className="rp-chart-type-btns">
            <button className={`rp-type-btn ${chartType === 'bar'  ? 'rp-type-btn-active' : ''}`} onClick={() => setChartType('bar')}>Barras</button>
            <button className={`rp-type-btn ${chartType === 'line' ? 'rp-type-btn-active' : ''}`} onClick={() => setChartType('line')}>Línea</button>
          </div>
        </div>
      </div>

      {rangeLoading && <LoadingSpinner label="Cargando análisis..." className="justify-center py-10" />}

      {!rangeLoading && rangeData && rangeData.series.length === 0 && (
        <EmptyState title="Sin ventas en este período" description="Ajusta el rango de fechas." />
      )}

      {!rangeLoading && rangeData && rangeData.series.length > 0 && (
        <>
          {/* KPIs del período */}
          <div className="rp-analytics-kpis">
            <div className="rp-an-kpi">
              <ShoppingCart className="h-4 w-4 text-primary" />
              <div>
                <p className="rp-an-val">{totalSales}</p>
                <p className="rp-an-lbl">Ventas totales</p>
              </div>
            </div>
            <div className="rp-an-kpi">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="rp-an-val">{fmtMoney(totalRev)}</p>
                <p className="rp-an-lbl">Ingresos totales</p>
              </div>
            </div>
            <div className="rp-an-kpi">
              <Clock className="h-4 w-4 text-blue-500" />
              <div>
                <p className="rp-an-val">{peakHour?.hour ?? '—'}</p>
                <p className="rp-an-lbl">Hora pico ({peakHour?.sale_count ?? 0} ventas)</p>
              </div>
            </div>
            <div className="rp-an-kpi">
              <CalendarDays className="h-4 w-4 text-violet-500" />
              <div>
                <p className="rp-an-val">{peakDay?.weekday ?? '—'}</p>
                <p className="rp-an-lbl">Día más activo ({peakDay?.sale_count ?? 0} ventas)</p>
              </div>
            </div>
          </div>

          <div className="rp-charts-grid">

            {/* Tendencia diaria */}
            <div className="rp-chart-card rp-chart-card-wide">
              <p className="rp-chart-title">Ingresos por día</p>
              <ResponsiveContainer width="100%" height={200}>
                {chartType === 'bar' ? (
                  <BarChart data={rangeData.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={v => `Q${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => [fmtMoney(v), 'Total']} labelFormatter={l => `Fecha: ${l}`} />
                    <Bar dataKey="total" fill="var(--primary)" radius={[3,3,0,0]} />
                  </BarChart>
                ) : (
                  <LineChart data={rangeData.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={v => `Q${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={v => [fmtMoney(v), 'Total']} labelFormatter={l => `Fecha: ${l}`} />
                    <Line type="monotone" dataKey="total" stroke="var(--primary)" strokeWidth={2} dot={rangeData.series.length <= 14} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Horarios concurridos */}
            <div className="rp-chart-card rp-chart-card-wide">
              <div className="rp-chart-title-row">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                <p className="rp-chart-title">Horarios más concurridos</p>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={hourData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                  <Tooltip formatter={v => [v, 'Ventas']} labelFormatter={l => `Hora: ${l}`} />
                  <Bar dataKey="sale_count" radius={[3,3,0,0]}>
                    {hourData.map((entry, i) => (
                      <Cell key={i} fill={entry.hour === peakHour?.hour ? '#ef4444' : '#3b82f6'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {peakHour && peakHour.sale_count > 0 && (
                <p className="rp-chart-note">Hora pico: <strong>{peakHour.hour}</strong> con {peakHour.sale_count} ventas · {fmtMoney(peakHour.total)}</p>
              )}
            </div>

            {/* Días de semana */}
            <div className="rp-chart-card">
              <div className="rp-chart-title-row">
                <CalendarDays className="h-3.5 w-3.5 text-violet-500" />
                <p className="rp-chart-title">Ventas por día de semana</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekdayData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="weekday" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                  <Tooltip formatter={v => [v, 'Ventas']} />
                  <Bar dataKey="sale_count" radius={[3,3,0,0]}>
                    {weekdayData.map((entry, i) => (
                      <Cell key={i} fill={entry.weekday === peakDay?.weekday ? '#6366f1' : '#a5b4fc'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Métodos de pago */}
            <div className="rp-chart-card">
              <div className="rp-chart-title-row">
                <CreditCard className="h-3.5 w-3.5 text-emerald-500" />
                <p className="rp-chart-title">Métodos de pago</p>
              </div>
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, name, p) => [v + ' ventas · ' + fmtMoney(p.payload.total), name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="rp-chart-note rp-chart-note-empty">Sin datos de métodos de pago</p>
              )}
            </div>

            {/* Top productos */}
            {rangeData.topProducts.length > 0 && (
              <div className="rp-chart-card rp-chart-card-wide">
                <div className="rp-chart-title-row">
                  <Package className="h-3.5 w-3.5 text-amber-500" />
                  <p className="rp-chart-title">Top 10 productos más vendidos</p>
                </div>
                <ResponsiveContainer width="100%" height={Math.max(180, rangeData.topProducts.length * 28)}>
                  <BarChart data={rangeData.topProducts} layout="vertical" margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `Q${(v/1000).toFixed(1)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={150} />
                    <Tooltip
                      formatter={(v, _n, p) => [
                        `${fmtMoney(v)}  ·  ${p.payload.units_sold} uds`,
                        'Ingresos',
                      ]}
                    />
                    <Bar dataKey="revenue" radius={[0,3,3,0]}>
                      {rangeData.topProducts.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? '#f59e0b' : i === 1 ? '#6366f1' : i === 2 ? '#10b981' : '#94a3b8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

          </div>
        </>
      )}
    </div>
  )
}

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
