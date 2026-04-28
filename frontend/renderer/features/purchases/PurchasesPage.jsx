import { useState } from 'react'
import { toast } from 'sonner'
import {
  ShoppingBag, Truck, Plus, Eye, Ban, Send, PackageCheck,
  RefreshCw, Pencil, Power, PowerOff,
} from 'lucide-react'

import { PageHeader }     from '@/components/shared/PageHeader'
import { MoneyDisplay }   from '@/components/shared/MoneyDisplay'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState }     from '@/components/shared/EmptyState'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'

import {
  useSuppliers, usePurchaseOrders, usePurchaseOrder,
  useCreateOrder, useMarkSent, useReceiveOrder, useCancelOrder,
} from '@/hooks/usePurchases'
import { useProducts } from '@/hooks/useProducts'
import { useAuthContext } from '@/features/auth/AuthContext'

const fmtDate  = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s)) : '—'
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

const STATUS_LABEL = { draft: 'Borrador', sent: 'Enviada', received: 'Recibida', cancelled: 'Cancelada' }
const STATUS_CLASS = { draft: 'po-badge-draft', sent: 'po-badge-sent', received: 'po-badge-received', cancelled: 'po-badge-cancelled' }

export default function PurchasesPage() {
  return (
    <div className="p-6">
      <PageHeader title="Compras" subtitle="Órdenes de compra" />
      <OrdersTab />
    </div>
  )
}

// ── Tab: Órdenes ─────────────────────────────────────────────────────────────

function OrdersTab() {
  const { user } = useAuthContext()
  const [newModal,     setNewModal]     = useState(false)
  const [detailId,     setDetailId]     = useState(/** @type {number|null} */ (null))
  const [receiveId,    setReceiveId]    = useState(/** @type {number|null} */ (null))

  const { data: orders = [], isLoading, refetch, isFetching } = usePurchaseOrders()
  const markSentMut  = useMarkSent()
  const cancelMut    = useCancelOrder()

  async function handleMarkSent(id) {
    try {
      await markSentMut.mutateAsync({ id, role: user.role })
      toast.success('Orden marcada como enviada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  async function handleCancel(id) {
    if (!confirm('¿Cancelar esta orden?')) return
    try {
      await cancelMut.mutateAsync({ id, role: user.role })
      toast.success('Orden cancelada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <>
      <div className="po-toolbar">
        <Button size="sm" onClick={() => setNewModal(true)}>
          <Plus className="mr-1 h-4 w-4" /> Nueva orden
        </Button>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {isLoading
        ? <LoadingSpinner label="Cargando órdenes..." className="py-10" />
        : orders.length === 0
          ? <EmptyState title="Sin órdenes" description="Crea tu primera orden de compra." />
          : (
            <div className="sh-table-card">
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th className="sh-th w-16">#</th>
                      <th className="sh-th">Proveedor</th>
                      <th className="sh-th w-28">Estado</th>
                      <th className="sh-th">Creada por</th>
                      <th className="sh-th">Fecha</th>
                      <th className="sh-th sh-num w-32">Total</th>
                      <th className="sh-th w-40 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o, i) => (
                      <tr key={o.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                        <td className="sh-td sh-nit">{o.id}</td>
                        <td className="sh-td font-medium">{o.supplier_name}</td>
                        <td className="sh-td">
                          <span className={`po-badge ${STATUS_CLASS[o.status]}`}>{STATUS_LABEL[o.status]}</span>
                        </td>
                        <td className="sh-td sh-muted">{o.created_by_name ?? '—'}</td>
                        <td className="sh-td sh-muted">{fmtDate(o.created_at)}</td>
                        <td className="sh-td sh-num sh-total">{fmtMoney(o.total_cost)}</td>
                        <td className="sh-td">
                          <div className="sh-actions">
                            <button className="sh-action-btn" title="Ver detalle" onClick={() => setDetailId(o.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {o.status === 'draft' && (
                              <button className="sh-action-btn" title="Marcar enviada" onClick={() => handleMarkSent(o.id)}>
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['draft', 'sent'].includes(o.status) && (
                              <>
                                <button className="sh-action-btn po-receive-btn" title="Recibir mercadería" onClick={() => setReceiveId(o.id)}>
                                  <PackageCheck className="h-3.5 w-3.5" />
                                </button>
                                <button className="sh-action-btn sh-void-btn" title="Cancelar" onClick={() => handleCancel(o.id)}>
                                  <Ban className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
      }

      <NewOrderModal open={newModal} onClose={() => setNewModal(false)} user={user} />
      <OrderDetailModal id={detailId} onClose={() => setDetailId(null)} />
      <ReceiveOrderModal id={receiveId} onClose={() => setReceiveId(null)} user={user} />
    </>
  )
}

// ── Modal: Nueva orden ───────────────────────────────────────────────────────

function NewOrderModal({ open, onClose, user }) {
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes]           = useState('')
  const [items, setItems]           = useState(/** @type {{ productId?: number, productName: string, productCode: string, qtyOrdered: number, unitCost: number }[]} */ ([]))

  const { data: suppliers = [] } = useSuppliers()
  const { data: products  = [] } = useProducts()
  const createMut = useCreateOrder()

  function addItem() {
    setItems(prev => [...prev, { productName: '', productCode: '', qtyOrdered: 1, unitCost: 0 }])
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function selectProduct(idx, productId) {
    const prod = products.find(p => p.id === Number(productId))
    if (prod) {
      setItems(prev => prev.map((it, i) => i === idx
        ? { ...it, productId: prod.id, productName: prod.name, productCode: prod.code ?? '', unitCost: prod.cost ?? 0 }
        : it
      ))
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (items.length === 0) { toast.error('Agrega al menos un producto'); return }
    try {
      await createMut.mutateAsync({
        supplierId: Number(supplierId),
        notes:      notes.trim() || undefined,
        userId:     user.id,
        userName:   user.full_name,
        role:       user.role,
        items,
      })
      toast.success('Orden creada')
      setSupplierId(''); setNotes(''); setItems([])
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" /> Nueva orden de compra
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Proveedor</Label>
              <select className="po-select" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
                <option value="">Seleccionar...</option>
                {suppliers.filter(s => s.active === 1).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Notas (opcional)</Label>
              <Input placeholder="Observaciones..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="po-items-header">
              <span className="text-sm font-semibold">Productos</span>
              <button type="button" className="po-add-item-btn" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" /> Agregar
              </button>
            </div>
            {items.length === 0
              ? <p className="po-items-empty">Agrega productos a la orden.</p>
              : (
                <div className="po-items-list">
                  {items.map((item, idx) => (
                    <div key={idx} className="po-item-row">
                      <select className="po-select po-item-product"
                        value={item.productId ?? ''}
                        onChange={e => selectProduct(idx, e.target.value)}>
                        <option value="">Producto del sistema...</option>
                        {products.filter(p => p.is_active === 1).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <Input className="po-item-name" placeholder="Nombre"
                        value={item.productName}
                        onChange={e => updateItem(idx, 'productName', e.target.value)} />
                      <Input className="po-item-qty" type="number" min="0.01" step="0.01" placeholder="Cant."
                        value={item.qtyOrdered}
                        onChange={e => updateItem(idx, 'qtyOrdered', parseFloat(e.target.value) || 0)} />
                      <Input className="po-item-cost" type="number" min="0" step="0.01" placeholder="Costo"
                        value={item.unitCost}
                        onChange={e => updateItem(idx, 'unitCost', parseFloat(e.target.value) || 0)} />
                      <button type="button" className="po-item-remove" onClick={() => removeItem(idx)}>
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="po-items-total">
                    Total estimado: <strong>{fmtMoney(items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0))}</strong>
                  </div>
                </div>
              )
            }
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending ? 'Guardando...' : 'Crear orden'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Detalle de orden ──────────────────────────────────────────────────

function OrderDetailModal({ id, onClose }) {
  const { data, isLoading } = usePurchaseOrder(id)

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Orden #{id}</DialogTitle>
          {data && <DialogDescription>{data.order.supplier_name} · {fmtDate(data.order.created_at)}</DialogDescription>}
        </DialogHeader>
        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : data && (
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <span className={`po-badge ${STATUS_CLASS[data.order.status]}`}>{STATUS_LABEL[data.order.status]}</span>
                {data.order.received_at && <span className="text-xs text-muted-foreground">Recibida: {fmtDate(data.order.received_at)}</span>}
                {data.order.notes && <span className="text-xs text-muted-foreground">📝 {data.order.notes}</span>}
              </div>
              <table className="sh-table">
                <thead>
                  <tr>
                    <th className="sh-th">Producto</th>
                    <th className="sh-th sh-num">Ordenado</th>
                    <th className="sh-th sh-num">Recibido</th>
                    <th className="sh-th sh-num">Costo unit.</th>
                    <th className="sh-th sh-num">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item, i) => (
                    <tr key={item.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td">
                        {item.product_code && <span className="inv-code mr-2">{item.product_code}</span>}
                        {item.product_name}
                      </td>
                      <td className="sh-td sh-num">{item.qty_ordered}</td>
                      <td className="sh-td sh-num">{item.qty_received}</td>
                      <td className="sh-td sh-num">{fmtMoney(item.unit_cost)}</td>
                      <td className="sh-td sh-num sh-total">{fmtMoney(item.qty_received * item.unit_cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="sh-td text-right font-semibold">Total:</td>
                    <td className="sh-td sh-num sh-total">{fmtMoney(data.order.total_cost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Recibir mercadería ────────────────────────────────────────────────

function ReceiveOrderModal({ id, onClose, user }) {
  const { data, isLoading } = usePurchaseOrder(id)
  const [received, setReceived] = useState(/** @type {Record<number, number>} */ ({}))
  const mut = useReceiveOrder()

  function initReceived() {
    if (data?.items) {
      const init = {}
      data.items.forEach(item => { init[item.id] = item.qty_ordered })
      setReceived(init)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await mut.mutateAsync({
        orderId: id,
        role:    user.role,
        items:   Object.entries(received).map(([itemId, qty]) => ({
          id:           Number(itemId),
          qty_received: Number(qty),
        })),
      })
      toast.success('Mercadería recibida y stock actualizado')
      onClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5 text-emerald-600" /> Recibir mercadería
          </DialogTitle>
          {data && <DialogDescription>Orden #{id} · {data.order.supplier_name}</DialogDescription>}
        </DialogHeader>
        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : data && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-muted-foreground">Ajusta las cantidades recibidas. Al confirmar se sumará al stock.</p>
              {data.items.map(item => (
                <div key={item.id} className="po-receive-row">
                  <span className="po-receive-name">
                    {item.product_code && <span className="inv-code mr-1">{item.product_code}</span>}
                    {item.product_name}
                  </span>
                  <span className="po-receive-ordered">Ord: {item.qty_ordered}</span>
                  <Input
                    type="number" min="0" step="0.01"
                    className="po-receive-input"
                    value={received[item.id] ?? item.qty_ordered}
                    onFocus={() => { if (Object.keys(received).length === 0) initReceived() }}
                    onChange={e => setReceived(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              ))}
              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={mut.isPending}>
                  {mut.isPending ? 'Procesando...' : 'Confirmar recepción'}
                </Button>
              </DialogFooter>
            </form>
          )
        }
      </DialogContent>
    </Dialog>
  )
}
