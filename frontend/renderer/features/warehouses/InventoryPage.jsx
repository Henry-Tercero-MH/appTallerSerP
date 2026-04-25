import { useMemo, useState } from 'react'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'

import { useInventoryStore } from './inventoryStore'
import ProductForm from './ProductForm'
import StockMovementModal from './StockMovementModal'

/**
 * Inventory page migrada a tokens shadcn. La fuente de datos sigue siendo
 * `useInventoryStore` (mock en memoria). Conectar al main usando
 * window.api.products es trabajo aparte.
 */
export default function InventoryPage() {
  const {
    products,
    movements,
    lowStockProducts,
    createProduct,
    updateProduct,
    removeProduct,
    restoreProduct,
    addMovement,
  } = useInventoryStore()

  const [modal, setModal] = useState(/** @type {any} */ (null))
  const [activeTab, setActiveTab] = useState(/** @type {'inventory'|'movements'} */ ('inventory'))
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!showInactive && !p.isActive) return false
      if (!search) return true
      const qs = search.toLowerCase()
      return (
        p.name.toLowerCase().includes(qs) ||
        p.code.toLowerCase().includes(qs) ||
        p.category.toLowerCase().includes(qs)
      )
    })
  }, [products, showInactive, search])

  const totalUnits = products.reduce((acc, p) => acc + (p.isActive ? p.stock : 0), 0)
  const activeCount = products.filter((p) => p.isActive).length

  const handleProductSave = (/** @type {any} */ data) => {
    if (modal?.productEdit) {
      updateProduct(modal.productEdit.id, data)
      toast.success('Producto actualizado correctamente')
    } else {
      createProduct(data)
      toast.success('Producto agregado al inventario')
    }
    setModal(null)
  }

  const handleMovementSave = (/** @type {any} */ mvtData) => {
    addMovement(mvtData)
    toast.success(`Movimiento de ${mvtData.type === 'entry' ? 'entrada' : 'salida'} registrado`)
    setModal(null)
  }

  const handleDelete = (/** @type {any} */ p) => {
    removeProduct(p.id)
    toast.warning(`Producto "${p.name}" desactivado`)
    setModal(null)
  }

  const isProductDialogOpen = modal === 'productCreate' || modal?.productEdit != null
  const isMovementDialogOpen = modal?.mvtEntry != null || modal?.mvtExit != null

  return (
    <div className="p-6 print-friendly">
      <div className="no-print">
        <PageHeader
          title="Bodega Central"
          subtitle="Gestion de inventario del taller"
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
          value={lowStockProducts.length}
          tone={lowStockProducts.length > 0 ? 'warning' : 'default'}
        />
      </div>

      <Card className="no-print">
        <div className="flex border-b">
          <TabButton active={activeTab === 'inventory'} onClick={() => setActiveTab('inventory')}>
            <Package className="mr-2 h-4 w-4" /> Listado de inventario
          </TabButton>
          <TabButton active={activeTab === 'movements'} onClick={() => setActiveTab('movements')}>
            <ClipboardList className="mr-2 h-4 w-4" /> Historial de movimientos
          </TabButton>
        </div>

        <CardContent className="p-4">
          {activeTab === 'inventory' && (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Input
                  type="text"
                  placeholder="Buscar por codigo, nombre o categoria..."
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
                  description="Ajusta los terminos de busqueda o cambia el filtro."
                />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Codigo</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Ubicacion</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead className="text-right no-print">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.map((p) => {
                        const lowStock = p.isActive && p.stock <= (p.minStock ?? 5)
                        return (
                          <TableRow
                            key={p.id}
                            className={!p.isActive ? 'opacity-60' : lowStock ? 'bg-warning/10' : undefined}
                          >
                            <TableCell>
                              <Badge variant="outline" className="font-mono">{p.code}</Badge>
                            </TableCell>
                            <TableCell>
                              <p className="font-semibold">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.brand} · {p.condition}
                              </p>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.category}</TableCell>
                            <TableCell className="font-mono text-xs">{p.location}</TableCell>
                            <TableCell>
                              <MoneyDisplay amount={p.price} />
                            </TableCell>
                            <TableCell>
                              <strong className={lowStock ? 'text-destructive' : undefined}>
                                {p.stock}
                              </strong>
                            </TableCell>
                            <TableCell className="text-right no-print">
                              <div className="flex justify-end gap-1">
                                {p.isActive ? (
                                  <>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => setModal({ mvtEntry: p })}
                                      title="Registrar entrada"
                                    >
                                      <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => setModal({ mvtExit: p })}
                                      title="Registrar salida"
                                    >
                                      <Minus className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setModal({ productEdit: p })}
                                    >
                                      <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:bg-destructive/10"
                                      onClick={() => setModal({ confirmDeact: p })}
                                    >
                                      <PowerOff className="mr-1 h-3.5 w-3.5" /> Desactivar
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => restoreProduct(p.id)}
                                  >
                                    <Power className="mr-1 h-3.5 w-3.5" /> Activar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}

          {activeTab === 'movements' && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha / hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No hay movimientos registrados.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(m.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={m.type === 'entry' ? 'success' : 'destructive'}>
                            {m.type === 'entry' ? 'Entrada' : 'Salida'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{m.productName}</TableCell>
                        <TableCell className="text-right">
                          <strong className={m.type === 'entry' ? 'text-success' : 'text-destructive'}>
                            {m.type === 'entry' ? '+' : '-'}{m.qty}
                          </strong>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.notes}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isProductDialogOpen}
        onOpenChange={(open) => { if (!open) setModal(null) }}
      >
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

      <Dialog
        open={isMovementDialogOpen}
        onOpenChange={(open) => { if (!open) setModal(null) }}
      >
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

      <Dialog
        open={modal?.confirmDeact != null}
        onOpenChange={(open) => { if (!open) setModal(null) }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar desactivacion</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas desactivar el producto{' '}
              <strong className="text-foreground">{modal?.confirmDeact?.name}</strong>?
              Ya no aparecera en las listas activas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => modal?.confirmDeact && handleDelete(modal.confirmDeact)}
            >
              Desactivar producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** @param {{ active: boolean, onClick: () => void, children: React.ReactNode }} props */
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

/**
 * @param {{ label: string, value: number | string, tone?: 'default' | 'warning' }} props
 */
function StatCard({ label, value, tone = 'default' }) {
  return (
    <Card className={tone === 'warning' ? 'border-l-4 border-l-destructive' : undefined}>
      <CardContent className="p-4">
        <p className={
          'text-2xl font-bold ' + (tone === 'warning' ? 'text-destructive' : 'text-primary')
        }>
          {value}
        </p>
        <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  )
}
