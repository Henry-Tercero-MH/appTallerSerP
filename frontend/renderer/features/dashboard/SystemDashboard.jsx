import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, ClipboardList, Package, Users,
  TrendingUp, TrendingDown, AlertTriangle, Landmark, Wallet,
  CreditCard, ArrowUpRight, ArrowDownRight, Box,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button }            from '@/components/ui/button'
import { MoneyDisplay }      from '@/components/shared/MoneyDisplay'
import { LoadingSpinner }    from '@/components/shared/LoadingSpinner'

import { useDailyReport }        from '@/hooks/useSales'
import { useInventoryProducts }  from '@/features/warehouses/inventoryStore'
import { useOpenSession }        from '@/hooks/useCash'
import { useReceivables, useReceivablesSummary } from '@/hooks/useReceivables'
import { usePurchaseOrders }     from '@/hooks/usePurchases'
import { useExpenseSummary }     from '@/hooks/useExpenses'
import { useTaxSettings }        from '@/hooks/useSettings'
import { ROUTES }                from '@/lib/constants'

const dateFmt  = new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' })
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)
const fmtDate  = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s)) : '—'

export default function SystemDashboard() {
  const navigate = useNavigate()
  const today    = new Date().toISOString().slice(0, 10)

  const { data: report,    isLoading: loadingReport }  = useDailyReport()
  const { data: products = [] }                        = useInventoryProducts()
  const { data: cashSession }                          = useOpenSession()
  const { data: recvList = [] }                        = useReceivables()
  const { data: recvSummary }                          = useReceivablesSummary()
  const { data: orders = [] }                          = usePurchaseOrders()
  const { data: expSummary }                           = useExpenseSummary(today, today)
  const { enabled: taxEnabled }                        = useTaxSettings()

  const summary     = report?.summary ?? null
  const lowStock    = products.filter(p => p.is_active === 1 && p.stock <= p.min_stock)
  const activeProds = products.filter(p => p.is_active === 1).length
  const in3Days     = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const overdueRecv = recvList.filter(r => ['pending','partial'].includes(r.status) && r.due_date && r.due_date < today)
  const soonDueRecv = recvList.filter(r => ['pending','partial'].includes(r.status) && r.due_date && r.due_date >= today && r.due_date <= in3Days)
  const pendingOrders = orders.filter(o => ['draft','sent'].includes(o.status))

  return (
    <div className="p-6 space-y-6">
      {/* Fecha */}
      <p className="text-sm text-muted-foreground">{dateFmt.format(new Date())}</p>

      {/* ── Alertas ─────────────────────────────────────────────── */}
      {(lowStock.length > 0 || overdueRecv.length > 0 || soonDueRecv.length > 0) && (
        <div className="flex flex-col gap-2">
          {lowStock.length > 0 && (
            <Card className="border-l-4 border-l-destructive bg-destructive/5">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="font-semibold text-destructive text-sm">
                      {lowStock.length} producto{lowStock.length > 1 ? 's' : ''} con stock bajo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lowStock.slice(0, 3).map(p => p.name).join(', ')}
                      {lowStock.length > 3 ? ` y ${lowStock.length - 3} más` : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.INVENTORY)}>
                  Ver inventario
                </Button>
              </CardContent>
            </Card>
          )}
          {soonDueRecv.length > 0 && (
            <Card className="border-l-4 border-l-blue-400 bg-blue-50/60">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-blue-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-blue-700 text-sm">
                      {soonDueRecv.length} cuenta{soonDueRecv.length > 1 ? 's' : ''} por vencer en los próximos 3 días
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {soonDueRecv.slice(0, 2).map(r => r.customer_name).join(', ')}
                      {soonDueRecv.length > 2 ? ` y ${soonDueRecv.length - 2} más` : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.RECEIVABLES)}>
                  Ver cuentas
                </Button>
              </CardContent>
            </Card>
          )}
          {overdueRecv.length > 0 && (
            <Card className="border-l-4 border-l-amber-500 bg-amber-50">
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-700 text-sm">
                      {overdueRecv.length} cuenta{overdueRecv.length > 1 ? 's' : ''} por cobrar vencida{overdueRecv.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {overdueRecv.slice(0, 2).map(r => r.customer_name).join(', ')}
                      {overdueRecv.length > 2 ? ` y ${overdueRecv.length - 2} más` : ''}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate(ROUTES.RECEIVABLES)}>
                  Ver cuentas
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── KPIs ventas del día ──────────────────────────────────── */}
      <section>
        <h2 className="db-section-title">Ventas del día</h2>
        {loadingReport
          ? <div className="flex h-20 items-center justify-center"><LoadingSpinner /></div>
          : (
            <div className="db-kpi-grid">
              <KpiCard label="Transacciones"    value={summary?.sale_count ?? 0}             suffix="ventas"  icon={<ShoppingCart className="db-kpi-icon" />} />
              {taxEnabled && <KpiCard label="Subtotal"   value={fmtMoney(summary?.subtotal ?? 0)}             icon={<TrendingUp className="db-kpi-icon text-blue-500" />} suffix="" />}
              <KpiCard label="Total cobrado"    value={fmtMoney(summary?.total ?? 0)}                         icon={<TrendingUp className="db-kpi-icon text-emerald-600" />} highlight />
              <KpiCard label="Gastos del día"   value={fmtMoney(expSummary?.today ?? 0)}                      icon={<TrendingDown className="db-kpi-icon text-red-500" />} danger />
            </div>
          )
        }
      </section>

      {/* ── Estado de caja + cuentas por cobrar ─────────────────── */}
      <div className="db-two-col">
        {/* Caja */}
        <section>
          <h2 className="db-section-title">Caja</h2>
          <Card>
            <CardContent className="p-4">
              {cashSession
                ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="db-status-dot db-status-open" />
                      <span className="text-sm font-semibold text-emerald-700">Abierta</span>
                    </div>
                    <div className="db-info-row">
                      <span className="db-info-label">Apertura</span>
                      <span className="db-info-value">{fmtMoney(cashSession.opening_amount)}</span>
                    </div>
                    <div className="db-info-row">
                      <span className="db-info-label">Abierta por</span>
                      <span className="db-info-value">{cashSession.opened_by_name}</span>
                    </div>
                    <div className="db-info-row">
                      <span className="db-info-label">Desde</span>
                      <span className="db-info-value">{fmtDate(cashSession.opened_at)}</span>
                    </div>
                    <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => navigate(ROUTES.CASH)}>
                      <Landmark className="h-3.5 w-3.5 mr-1" /> Ir a caja
                    </Button>
                  </div>
                )
                : (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="flex items-center gap-2">
                      <span className="db-status-dot db-status-closed" />
                      <span className="text-sm font-semibold text-slate-500">Caja cerrada</span>
                    </div>
                    <Button size="sm" onClick={() => navigate(ROUTES.CASH)}>
                      <Landmark className="h-3.5 w-3.5 mr-1" /> Abrir caja
                    </Button>
                  </div>
                )
              }
            </CardContent>
          </Card>
        </section>

        {/* Cuentas por cobrar */}
        <section>
          <h2 className="db-section-title">Cuentas por cobrar</h2>
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="db-info-row">
                <span className="db-info-label">Saldo pendiente</span>
                <span className="db-info-value font-bold text-amber-600">{fmtMoney(recvSummary?.total_balance)}</span>
              </div>
              <div className="db-info-row">
                <span className="db-info-label">Cuentas activas</span>
                <span className="db-info-value">{recvSummary?.total_count ?? 0}</span>
              </div>
              <div className="db-info-row">
                <span className="db-info-label">Vencidas</span>
                <span className={`db-info-value font-semibold ${overdueRecv.length > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {overdueRecv.length}
                </span>
              </div>
              <div className="db-info-row">
                <span className="db-info-label">Parcialmente pagadas</span>
                <span className="db-info-value">{fmtMoney(recvSummary?.partial_balance)}</span>
              </div>
              <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => navigate(ROUTES.RECEIVABLES)}>
                <Wallet className="h-3.5 w-3.5 mr-1" /> Ver cuentas
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ── Compras pendientes + Stock bajo ─────────────────────── */}
      <div className="db-two-col">
        {/* Órdenes de compra pendientes */}
        <section>
          <h2 className="db-section-title">Compras pendientes</h2>
          <Card>
            <CardContent className="p-0">
              {pendingOrders.length === 0
                ? <p className="db-empty">Sin órdenes pendientes</p>
                : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">#</th>
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Proveedor</th>
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Estado</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.slice(0, 5).map((o, i) => (
                        <tr key={o.id} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/30'}`}>
                          <td className="px-3 py-2 text-muted-foreground">{o.id}</td>
                          <td className="px-3 py-2 font-medium">{o.supplier_name}</td>
                          <td className="px-3 py-2">
                            <span className={`po-badge ${o.status === 'draft' ? 'po-badge-draft' : 'po-badge-sent'}`}>
                              {o.status === 'draft' ? 'Borrador' : 'Enviada'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">{fmtMoney(o.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
              <div className="p-3 border-t">
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate(ROUTES.PURCHASES)}>
                  <ArrowDownRight className="h-3.5 w-3.5 mr-1" /> Ver compras
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Stock bajo */}
        <section>
          <h2 className="db-section-title">Stock bajo ({lowStock.length})</h2>
          <Card>
            <CardContent className="p-0">
              {lowStock.length === 0
                ? <p className="db-empty">Todos los productos con stock suficiente</p>
                : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left text-xs text-muted-foreground font-medium">Producto</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Stock</th>
                        <th className="px-3 py-2 text-right text-xs text-muted-foreground font-medium">Mínimo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStock.slice(0, 5).map((p, i) => (
                        <tr key={p.id} className={`border-b last:border-0 ${i % 2 === 0 ? '' : 'bg-muted/30'}`}>
                          <td className="px-3 py-2 font-medium">{p.name}</td>
                          <td className={`px-3 py-2 text-right font-semibold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.stock}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{p.min_stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
              <div className="p-3 border-t">
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate(ROUTES.INVENTORY)}>
                  <Box className="h-3.5 w-3.5 mr-1" /> Ver inventario
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>

      {/* ── Top productos del día ────────────────────────────────── */}
      {(report?.topProducts?.length ?? 0) > 0 && (
        <section>
          <h2 className="db-section-title">Top productos hoy</h2>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Producto</th>
                    <th className="px-4 py-2 font-medium text-right">Unidades</th>
                    <th className="px-4 py-2 font-medium text-right">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {(report?.topProducts ?? []).map((p, i) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 font-medium">{p.name ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{p.units_sold}</td>
                      <td className="px-4 py-2 text-right font-semibold">{fmtMoney(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Accesos rápidos ──────────────────────────────────────── */}
      <section>
        <h2 className="db-section-title">Accesos rápidos</h2>
        <div className="db-quicklinks">
          <QuickLink label="Nueva venta"     icon={<ShoppingCart className="h-5 w-5" />} onClick={() => navigate(ROUTES.POS)}         primary />
          <QuickLink label="Historial"        icon={<ClipboardList className="h-5 w-5" />} onClick={() => navigate(ROUTES.HISTORY)} />
          <QuickLink label={`Productos (${activeProds})`} icon={<Package className="h-5 w-5" />} onClick={() => navigate(ROUTES.INVENTORY)} />
          <QuickLink label="Clientes"         icon={<Users className="h-5 w-5" />}        onClick={() => navigate(ROUTES.CLIENTS)} />
          <QuickLink label="Cuentas × Cobrar" icon={<Wallet className="h-5 w-5" />}       onClick={() => navigate(ROUTES.RECEIVABLES)} />
          <QuickLink label="Compras"          icon={<ArrowDownRight className="h-5 w-5" />} onClick={() => navigate(ROUTES.PURCHASES)} />
        </div>
      </section>
    </div>
  )
}

function KpiCard({ label, value, suffix, icon, highlight = false, danger = false }) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : danger ? 'border-red-200 bg-red-50/50' : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-xl font-bold ${highlight ? 'text-primary' : danger ? 'text-red-600' : ''}`}>{value}</div>
        {suffix && <p className="text-xs text-muted-foreground mt-0.5">{suffix}</p>}
      </CardContent>
    </Card>
  )
}

function QuickLink({ label, icon, onClick, primary = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-accent
        ${primary ? 'border-primary/40 bg-primary/5 text-primary hover:bg-primary/10' : 'text-foreground'}`}
    >
      {icon}
      {label}
    </button>
  )
}
