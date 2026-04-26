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

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import {
  useInventoryProducts,
  useCreateProduct,
  useUpdateProduct,
  useRemoveProduct,
  useRestoreProduct,
  useAdjustStock,
} from './inventoryStore'
import ProductForm from './ProductForm'
import StockMovementModal from './StockMovementModal'

export default function InventoryPage() {
  const { data: products = /** @type {import('@/schemas/product.schema.js').ProductList} */ ([]), isLoading, isError } = useInventoryProducts()

  const createProduct  = useCreateProduct()
  const updateProduct  = useUpdateProduct()
  const removeProduct  = useRemoveProduct()
  const restoreProduct = useRestoreProduct()
  const adjustStock    = useAdjustStock()

  const [modal, setModal]             = useState(/** @type {any} */ (null))
  const [activeTab, setActiveTab]     = useState(/** @type {'inventory'|'movements'} */ ('inventory'))
  const [search, setSearch]           = useState('')
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

  const handleProductSave = (/** @type {any} */ data) => {
    if (modal?.productEdit) {
      updateProduct.mutate({ id: modal.productEdit.id, patch: data })
    } else {
      createProduct.mutate(data)
    }
    setModal(null)
  }

  const handleMovementSave = (/** @type {any} */ mvtData) => {
    adjustStock.mutate({ id: mvtData.productId, type: mvtData.type, qty: mvtData.qty })
    setModal(null)
  }

  const handleDeactivate = (/** @type {any} */ p) => {
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
            <ClipboardList className="mr-2 h-4 w-4" /> Movimientos recientes
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

          {activeTab === 'movements' && (
            <EmptyState
              title="Historial de movimientos"
              description="Los movimientos de stock se registran en esta sesión. El historial completo estará disponible próximamente."
            />
          )}
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
