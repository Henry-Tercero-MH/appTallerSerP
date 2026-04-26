import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart,
  ClipboardList,
  Wrench,
  Package,
  Users,
  BarChart3,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import { useDailyReport } from '@/hooks/useSales'
import { useInventoryProducts } from '@/features/warehouses/inventoryStore'
import { ROUTES } from '@/lib/constants'

const dateFmt = new Intl.DateTimeFormat('es-GT', { dateStyle: 'full' })

export default function SystemDashboard() {
  const navigate = useNavigate()

  const { data: report, isLoading: loadingReport } = useDailyReport()
  const { data: products = [] }                     = useInventoryProducts()

  const summary      = report?.summary ?? null
  const lowStock     = products.filter(p => p.is_active === 1 && p.stock <= p.min_stock)
  const activeProds  = products.filter(p => p.is_active === 1).length

  return (
    <div className="p-6 space-y-6">
      {/* Encabezado */}
      <div>
        <p className="text-sm text-muted-foreground">{dateFmt.format(new Date())}</p>
      </div>

      {/* KPIs del día */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Resumen del día
        </h2>
        {loadingReport ? (
          <div className="flex h-24 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Ventas"
              value={summary?.sale_count ?? 0}
              suffix="órdenes"
              icon={<ShoppingCart className="h-4 w-4 text-primary" />}
            />
            <KpiCard
              label="Subtotal"
              value={<MoneyDisplay amount={summary?.subtotal ?? 0} />}
              icon={<TrendingUp className="h-4 w-4 text-green-600" />}
            />
            <KpiCard
              label="Impuesto"
              value={<MoneyDisplay amount={summary?.tax_amount ?? 0} />}
              icon={<BarChart3 className="h-4 w-4 text-blue-500" />}
            />
            <KpiCard
              label="Total cobrado"
              value={<MoneyDisplay amount={summary?.total ?? 0} />}
              icon={<TrendingUp className="h-4 w-4 text-primary" />}
              highlight
            />
          </div>
        )}
      </section>

      {/* Alertas rápidas */}
      {lowStock.length > 0 && (
        <section>
          <Card className="border-l-4 border-l-destructive bg-destructive/5">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <p className="font-semibold text-destructive">
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
        </section>
      )}

      {/* Accesos rápidos */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Accesos rápidos
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <QuickLink
            label="Nueva venta"
            icon={<ShoppingCart className="h-6 w-6" />}
            onClick={() => navigate(ROUTES.POS)}
            primary
          />
          <QuickLink
            label="Historial"
            icon={<ClipboardList className="h-6 w-6" />}
            onClick={() => navigate(ROUTES.HISTORY)}
          />
          <QuickLink
            label="Taller"
            icon={<Wrench className="h-6 w-6" />}
            onClick={() => navigate(ROUTES.WORKSHOP)}
          />
          <QuickLink
            label={`Productos (${activeProds})`}
            icon={<Package className="h-6 w-6" />}
            onClick={() => navigate(ROUTES.INVENTORY)}
          />
          <QuickLink
            label="Clientes"
            icon={<Users className="h-6 w-6" />}
            onClick={() => navigate(ROUTES.CLIENTS)}
          />
        </div>
      </section>

      {/* Top productos del día */}
      {(report?.topProducts?.length ?? 0) > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Top productos hoy
          </h2>
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
                      <td className="px-4 py-2 text-right">
                        <MoneyDisplay amount={p.revenue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}

/**
 * @param {{
 *   label: string
 *   value: import('react').ReactNode
 *   suffix?: string
 *   icon: import('react').ReactNode
 *   highlight?: boolean
 * }} p
 */
function KpiCard({ label, value, suffix, icon, highlight = false }) {
  return (
    <Card className={highlight ? 'border-primary/40 bg-primary/5' : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`text-xl font-bold ${highlight ? 'text-primary' : ''}`}>{value}</div>
        {suffix && <p className="text-xs text-muted-foreground mt-0.5">{suffix}</p>}
      </CardContent>
    </Card>
  )
}

/**
 * @param {{
 *   label: string
 *   icon: import('react').ReactNode
 *   onClick: () => void
 *   primary?: boolean
 * }} p
 */
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
