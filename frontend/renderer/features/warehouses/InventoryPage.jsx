import { useMemo, useState } from 'react'
import {
  ClipboardList,
  Minus,
  Package,
  Pencil,
  Plus,
  PowerOff,
  Power,
  Printer,
  RefreshCw,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { PageHeader }     from '@/components/shared/PageHeader'
import { EmptyState }     from '@/components/shared/EmptyState'
import { MoneyDisplay }   from '@/components/shared/MoneyDisplay'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import {
  useInventoryProducts,
  useCreateProduct,
  useUpdateProduct,
  useRemoveProduct,
  useRestoreProduct,
} from './inventoryStore'
import { useAdjustStock, useInventoryMovements } from '@/hooks/useInventory'
import { useAuthContext } from '@/features/auth/AuthContext'
import ProductForm from './ProductForm'
import StockMovementModal from './StockMovementModal'

const MVT_LABELS = {
  in:         { label: 'Entrada',     cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  out:        { label: 'Salida',      cls: 'text-red-700 bg-red-50 border-red-200' },
  adjustment: { label: 'Ajuste',      cls: 'text-blue-700 bg-blue-50 border-blue-200' },
  sale:       { label: 'Venta',       cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  purchase:   { label: 'Compra',      cls: 'text-violet-700 bg-violet-50 border-violet-200' },
  return:     { label: 'Devolución',  cls: 'text-teal-700 bg-teal-50 border-teal-200' },
}

const mvtDateFmt = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'short', timeStyle: 'short', hour12: false,
})

function MovementsTab() {
  const [mvtPage, setMvtPage] = useState(1)
  const PAGE_SIZE = 50
  const { data, isLoading, refetch, isFetching } = useInventoryMovements({ page: mvtPage, pageSize: PAGE_SIZE })

  const movements  = data?.data  ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (isLoading) return <LoadingSpinner label="Cargando movimientos..." className="py-10" />

  if (movements.length === 0) return (
    <EmptyState
      title="Sin movimientos registrados"
      description="Los ajustes de stock, ventas, compras y devoluciones aparecerán aquí."
    />
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="sh-table-card">
        <div className="sh-table-scroll">
          <table className="sh-table">
            <thead>
              <tr>
                <th className="sh-th w-36">Fecha</th>
                <th className="sh-th">Producto</th>
                <th className="sh-th w-28">Tipo</th>
                <th className="sh-th sh-num w-20">Cant.</th>
                <th className="sh-th w-28">Stock</th>
                <th className="sh-th">Notas</th>
                <th className="sh-th w-28">Usuario</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m, idx) => {
                const t          = MVT_LABELS[m.type] ?? { label: m.type, cls: '' }
                const isPositive = m.qty_after >= m.qty_before
                return (
                  <tr key={m.id} className={idx % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                    <td className="sh-td sh-muted text-xs">
                      {mvtDateFmt.format(new Date(m.created_at.replace(' ', 'T')))}
                    </td>
                    <td className="sh-td font-medium text-sm">{m.product_name}</td>
                    <td className="sh-td">
                      <span className={`sh-payment-badge text-xs ${t.cls}`}>{t.label}</span>
                    </td>
                    <td className="sh-td sh-num">
                      <span className={isPositive ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                        {isPositive ? '+' : '-'}{m.qty}
                      </span>
                    </td>
                    <td className="sh-td sh-muted text-xs">
                      {m.qty_before} → {m.qty_after}
                    </td>
                    <td className="sh-td sh-muted text-xs truncate max-w-[180px]">{m.notes ?? '—'}</td>
                    <td className="sh-td sh-muted text-xs">{m.created_by_name ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} movimientos en total</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs"
              disabled={mvtPage <= 1} onClick={() => setMvtPage(p => p - 1)}>
              Anterior
            </Button>
            <span className="px-2">Pág. {mvtPage} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs"
              disabled={mvtPage >= totalPages} onClick={() => setMvtPage(p => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function InventoryPage() {
  const { user } = useAuthContext()
  const { data: products = [], isLoading, isError } = useInventoryProducts()

  const createProduct  = useCreateProduct()
  const updateProduct  = useUpdateProduct()
  const removeProduct  = useRemoveProduct()
  const restoreProduct = useRestoreProduct()
  const adjustStock    = useAdjustStock()

  const [modal,        setModal]        = useState(null)
  const [activeTab,    setActiveTab]    = useState('inventory')
  const [search,       setSearch]       = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!showInactive && p.is_active === 0) return false
      if (!search) return true
      const qs = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(qs) ||
        p.code.toLowerCase().includes(qs) ||
        p.category.toLowerCase().includes(qs)
      )
    })
  }, [products, showInactive, search])

  const activeCount  = products.filter((p) => p.is_active === 1).length
  const totalUnits   = products.reduce((acc, p) => acc + (p.is_active === 1 ? p.stock : 0), 0)
  const lowStockList = products.filter((p) => p.is_active === 1 && p.stock <= p.min_stock)

  const handleProductSave = (data) => {
    if (modal?.productEdit) {
      updateProduct.mutate({ id: modal.productEdit.id, patch: data })
    } else {
      createProduct.mutate(data)
    }
    setModal(null)
  }

  const handleMovementSave = (mvtData) => {
    adjustStock.mutate({
      productId:      mvtData.productId,
      type:           mvtData.type,
      qty:            mvtData.qty,
      notes:          mvtData.notes,
      createdBy:      user?.id,
      createdByName:  user?.full_name,
    })
    setModal(null)
  }

  const handleDeactivate = (p) => {
    removeProduct.mutate(p.id)
    setModal(null)
  }

  const isProductDialogOpen  = modal === 'productCreate' || modal?.productEdit != null
  const isMovementDialogOpen = modal?.mvtEntry != null || modal?.mvtExit != null

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-6">
        <EmptyState
          title="Error al cargar inventario"
          description="No se pudo conectar con la base de datos. Reinicia la aplicación."
        />
      </div>
    )
  }

  return (
    <div className="p-6 print-friendly">
      <div className="no-print">
        <PageHeader
          title="Bodega Central"
          subtitle="Gestión de inventario del taller"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-1 h-4 w-4" /> Imprimir
              </Button>
              <Button size="sm" onClick={() => setModal('productCreate')}>
                <Plus className="mr-1 h-4 w-4" /> Nuevo producto
              </Button>
            </>
          }
        />
      </div>

      <div className="no-print mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Items activos" value={activeCount} />
        <StatCard label="Unidades totales" value={totalUnits} />
        <StatCard
          label="Items con stock bajo"
          value={lowStockList.length}
          tone={lowStockList.length > 0 ? 'warning' : 'default'}
        />
      </div>

      <Card className="no-print">
        <div className="flex border-b">
          <TabButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')}>
            <Package className="mr-2 h-4 w-4" /> Listado de inventario
          </TabButton>
          <TabButton active={activeTab === 'movements'} onClick={() => setActiveTab('movements')}>
            <ClipboardList className="mr-2 h-4 w-4" /> Movimientos / Kardex
          </TabButton>
        </div>

        <CardContent className="p-4">
          {activeTab === 'inventory' && (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  type="text"
                  placeholder="Buscar por código, nombre o categoría..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-sm"
                />
                <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  Mostrar inactivos
                </label>
              </div>

              {filteredProducts.length === 0 ? (
                <EmptyState
                  title="Sin resultados"
                  description="Ajusta los términos de búsqueda o cambia el filtro."
                />
              ) : (
                <div className="sh-table-card">
                  <div className="sh-table-scroll">
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th className="sh-th w-28">Código</th>
                          <th className="sh-th">Producto</th>
                          <th className="sh-th w-28">Categoría</th>
                          <th className="sh-th w-28">Ubicación</th>
                          <th className="sh-th sh-num w-24">Precio</th>
                          <th className="sh-th sh-num w-24">Stock</th>
                          <th className="sh-th w-56 no-print" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((p, idx) => {
                          const lowStock = p.is_active === 1 && p.stock <= p.min_stock
                          const inactive = p.is_active === 0
                          let rowCls = idx % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'
                          if (inactive) rowCls = 'sh-tr-voided'
                          else if (lowStock) rowCls = 'inv-tr-low'
                          return (
                            <tr key={p.id} className={rowCls}>
                              <td className="sh-td">
                                <span className="inv-code">{p.code}</span>
                              </td>
                              <td className="sh-td">
                                <span className="inv-name">{p.name}</span>
                                {(p.brand || p.condition) && (
                                  <span className="inv-sub">
                                    {p.brand}{p.brand && p.condition ? ' · ' : ''}{p.condition}
                                  </span>
                                )}
                              </td>
                              <td className="sh-td sh-client-type">{p.category}</td>
                              <td className="sh-td sh-nit">{p.location}</td>
                              <td className="sh-td sh-num">
                                <MoneyDisplay amount={p.price} />
                              </td>
                              <td className="sh-td sh-num">
                                <span className={lowStock ? 'inv-stock-low' : 'inv-stock-ok'}>
                                  {p.stock}
                                </span>
                                {lowStock && (
                                  <span className="inv-stock-min">(mín {p.min_stock})</span>
                                )}
                              </td>
                              <td className="sh-td no-print">
                                <div className="inv-actions">
                                  {p.is_active === 1 ? (
                                    <>
                                      <button className="inv-btn inv-btn-icon" title="Entrada de stock"
                                        onClick={() => setModal({ mvtEntry: p })}>
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                      <button className="inv-btn inv-btn-icon" title="Salida de stock"
                                        onClick={() => setModal({ mvtExit: p })}>
                                        <Minus className="h-3.5 w-3.5" />
                                      </button>
                                      <button className="inv-btn" onClick={() => setModal({ productEdit: p })}>
                                        <Pencil className="h-3 w-3" /> Editar
                                      </button>
                                      <button className="inv-btn inv-btn-danger"
                                        onClick={() => setModal({ confirmDeact: p })}>
                                        <PowerOff className="h-3 w-3" /> Desactivar
                                      </button>
                                    </>
                                  ) : (
                                    <button className="inv-btn inv-btn-restore"
                                      onClick={() => restoreProduct.mutate(p.id)}>
                                      <Power className="h-3 w-3" /> Activar
                                    </button>
                                  )}
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
            </>
          )}

          {activeTab === 'movements' && <MovementsTab />}
        </CardContent>
      </Card>

      {/* Dialog: crear / editar producto */}
      <Dialog open={isProductDialogOpen} onOpenChange={(open) => { if (!open) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal === 'productCreate' ? 'Ingresar nuevo producto' : 'Editar producto'}
            </DialogTitle>
          </DialogHeader>
          {isProductDialogOpen && (
            <ProductForm
              initial={modal?.productEdit ?? null}
              onSave={handleProductSave}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: movimiento de stock */}
      <Dialog open={isMovementDialogOpen} onOpenChange={(open) => { if (!open) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal?.mvtEntry ? 'Registrar entrada' : 'Registrar salida'}
            </DialogTitle>
          </DialogHeader>
          {isMovementDialogOpen && (
            <StockMovementModal
              product={modal.mvtEntry || modal.mvtExit}
              isEntry={!!modal.mvtEntry}
              onSave={handleMovementSave}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: confirmar desactivación */}
      <Dialog open={modal?.confirmDeact != null} onOpenChange={(open) => { if (!open) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar desactivación</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas desactivar el producto{' '}
              <strong className="text-foreground">{modal?.confirmDeact?.name}</strong>?
              Ya no aparecerá en las listas activas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button
              type="button" variant="destructive"
              onClick={() => modal?.confirmDeact && handleDeactivate(modal.confirmDeact)}
            >
              Desactivar producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'flex items-center border-b-2 border-primary px-4 py-3 text-sm font-semibold text-primary'
          : 'flex items-center border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground'
      }
    >
      {children}
    </button>
  )
}

function StatCard({ label, value, tone = 'default' }) {
  return (
    <Card className={tone === 'warning' ? 'border-l-4 border-l-destructive' : undefined}>
      <CardContent className="p-4">
        <p className={'text-2xl font-bold ' + (tone === 'warning' ? 'text-destructive' : 'text-primary')}>
          {value}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
