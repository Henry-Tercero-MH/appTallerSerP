import { useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, Eye, Send, Check, X, ShoppingCart,
  Pencil, RefreshCw, FileText, Printer, Wallet,
} from 'lucide-react'

import { PageHeader }     from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState }     from '@/components/shared/EmptyState'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'

import {
  useQuotes, useQuote,
  useCreateQuote, useUpdateQuote,
  useMarkSentQuote, useAcceptQuote, useRejectQuote, useConvertQuote,
  useConvertQuoteToReceivable,
} from '@/hooks/useQuotes'
import { useProducts }          from '@/hooks/useProducts'
import { useAuthContext }       from '@/features/auth/AuthContext'
import { useBusinessSettings, useTaxSettings }  from '@/hooks/useSettings'

const fmtDate  = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(s + 'T00:00:00')) : '—'
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

const STATUS_LABEL = {
  draft:     'Borrador',
  sent:      'Enviada',
  accepted:  'Aceptada',
  rejected:  'Rechazada',
  converted: 'Convertida',
}
const STATUS_CLASS = {
  draft:     'po-badge-draft',
  sent:      'po-badge-sent',
  accepted:  'qt-badge-accepted',
  rejected:  'qt-badge-rejected',
  converted: 'qt-badge-converted',
}

const EDITABLE_STATUSES = ['draft', 'sent']
const ACTIVE_STATUSES   = ['draft', 'sent', 'accepted']

export default function QuotesPage() {
  const { enabled: taxEnabled } = useTaxSettings()
  const { user }  = useAuthContext()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('active')
  const [newModal, setNewModal]   = useState(false)
  const [editId, setEditId]       = useState(/** @type {number|null} */ (null))
  const [detailId, setDetailId]   = useState(/** @type {number|null} */ (null))
  const [printId, setPrintId]     = useState(/** @type {number|null} */ (null))

  const { data: quotes = [], isLoading, refetch, isFetching } = useQuotes()
  const markSentMut   = useMarkSentQuote()
  const acceptMut     = useAcceptQuote()
  const rejectMut     = useRejectQuote()
  const convertMut    = useConvertQuote()
  const toRecvMut     = useConvertQuoteToReceivable()

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilter === 'active'
      ? ACTIVE_STATUSES.includes(q.status)
      : statusFilter === 'all' ? true : q.status === statusFilter
    const term = search.toLowerCase()
    const matchSearch = !term || q.customer_name.toLowerCase().includes(term)
    return matchStatus && matchSearch
  })

  async function handleMarkSent(id) {
    try { await markSentMut.mutateAsync(id); toast.success('Cotización enviada') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }
  async function handleAccept(id) {
    try { await acceptMut.mutateAsync(id); toast.success('Cotización aceptada') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }
  async function handleReject(id) {
    if (!confirm('¿Rechazar esta cotización?')) return
    try { await rejectMut.mutateAsync(id); toast.success('Cotización rechazada') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }
  async function handleConvert(id) {
    if (!confirm('¿Convertir esta cotización en venta? Se descontará el stock.')) return
    try {
      await convertMut.mutateAsync({ id, userId: user.id, userName: user.full_name })
      toast.success('Cotización convertida a venta')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  async function handleToReceivable(id) {
    if (!confirm('¿Crear una cuenta por cobrar desde esta cotización?')) return
    try {
      await toRecvMut.mutateAsync({ id, userId: user.id, userName: user.full_name })
      toast.success('Cuenta por cobrar creada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <div className="p-6">
      <PageHeader title="Cotizaciones" subtitle="Crea y gestiona cotizaciones para tus clientes" />

      {/* Toolbar */}
      <div className="po-toolbar">
        <div className="po-toolbar-left">
          <input
            className="po-search"
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="rv-filter-select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="active">Activas</option>
            <option value="all">Todas</option>
            <option value="draft">Borrador</option>
            <option value="sent">Enviadas</option>
            <option value="accepted">Aceptadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="converted">Convertidas</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setNewModal(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nueva cotización
          </Button>
        </div>
      </div>

      {isLoading
        ? <LoadingSpinner label="Cargando cotizaciones..." className="py-10" />
        : filtered.length === 0
          ? <EmptyState title="Sin cotizaciones" description="Crea tu primera cotización." />
          : (
            <div className="sh-table-card">
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th className="sh-th w-14">#</th>
                      <th className="sh-th">Cliente</th>
                      <th className="sh-th w-28">Estado</th>
                      <th className="sh-th sh-num w-32">Total</th>
                      <th className="sh-th">Válida hasta</th>
                      <th className="sh-th">Creada por</th>
                      <th className="sh-th w-44 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((q, i) => (
                      <tr key={q.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                        <td className="sh-td sh-nit">{q.id}</td>
                        <td className="sh-td">
                          <div className="font-medium">{q.customer_name}</div>
                          {q.customer_nit && <div className="text-xs text-muted-foreground">NIT: {q.customer_nit}</div>}
                        </td>
                        <td className="sh-td">
                          <span className={`po-badge ${STATUS_CLASS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
                        </td>
                        <td className="sh-td sh-num sh-total">{fmtMoney(q.total)}</td>
                        <td className="sh-td sh-muted">{fmtDate(q.valid_until)}</td>
                        <td className="sh-td sh-muted">{q.created_by_name ?? '—'}</td>
                        <td className="sh-td">
                          <div className="sh-actions">
                            <button className="sh-action-btn" title="Ver detalle" onClick={() => setDetailId(q.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button className="sh-action-btn" title="Imprimir" onClick={() => setPrintId(q.id)}>
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            {EDITABLE_STATUSES.includes(q.status) && (
                              <button className="sh-action-btn" title="Editar" onClick={() => setEditId(q.id)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {q.status === 'draft' && (
                              <button className="sh-action-btn" title="Marcar enviada" onClick={() => handleMarkSent(q.id)}>
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['draft', 'sent'].includes(q.status) && (
                              <button className="sh-action-btn success" title="Aceptar" onClick={() => handleAccept(q.id)}>
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['draft', 'sent', 'accepted'].includes(q.status) && (
                              <button className="sh-action-btn sh-void-btn" title="Rechazar" onClick={() => handleReject(q.id)}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {q.status === 'accepted' && (
                              <button className="sh-action-btn" title="Convertir a venta" onClick={() => handleConvert(q.id)}>
                                <ShoppingCart className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['accepted', 'sent', 'draft'].includes(q.status) && (
                              <button className="sh-action-btn" title="Crear cuenta por cobrar" onClick={() => handleToReceivable(q.id)}>
                                <Wallet className="h-3.5 w-3.5" />
                              </button>
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

      <QuoteFormModal open={newModal} onClose={() => setNewModal(false)} user={user} />
      <QuoteFormModal open={!!editId} editId={editId} onClose={() => setEditId(null)} user={user} />
      <QuoteDetailModal id={detailId} onClose={() => setDetailId(null)} />
      <QuotePrintDialog id={printId} onClose={() => setPrintId(null)} />
    </div>
  )
}

// ── Modal: Crear / Editar cotización ─────────────────────────────────────────

function QuoteFormModal({ open, editId = null, onClose, user }) {
  const isEdit = !!editId
  const { data: existing, isLoading: loadingExisting } = useQuote(editId)

  const [form, setForm] = useState({
    customerName: '',
    customerNit:  '',
    notes:        '',
    validUntil:   '',
  })
  const [items, setItems] = useState(/** @type {{ productId?: number, productName: string, productCode: string, qty: number, unitPrice: number }[]} */ ([]))
  const [initialized, setInitialized] = useState(false)

  // Inicializar form cuando se carga la cotización existente
  if (isEdit && existing && !initialized) {
    setForm({
      customerName: existing.quote.customer_name,
      customerNit:  existing.quote.customer_nit  ?? '',
      notes:        existing.quote.notes         ?? '',
      validUntil:   existing.quote.valid_until   ?? '',
    })
    setItems(existing.items.map(it => ({
      productId:   it.product_id   ?? undefined,
      productName: it.product_name,
      productCode: it.product_code ?? '',
      qty:         it.qty,
      unitPrice:   it.unit_price,
    })))
    setInitialized(true)
  }

  function handleClose() {
    setForm({ customerName: '', customerNit: '', notes: '', validUntil: '' })
    setItems([])
    setInitialized(false)
    onClose()
  }

  const { data: products = [] } = useProducts()
  const createMut = useCreateQuote()
  const updateMut = useUpdateQuote()

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  function addItem() {
    setItems(prev => [...prev, { productName: '', productCode: '', qty: 1, unitPrice: 0 }])
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
        ? { ...it, productId: prod.id, productName: prod.name, productCode: prod.code ?? '', unitPrice: prod.price }
        : it
      ))
    }
  }

  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      customerName: form.customerName,
      customerNit:  form.customerNit  || undefined,
      notes:        form.notes        || undefined,
      validUntil:   form.validUntil   || undefined,
      userId:       user.id,
      userName:     user.full_name,
      items: items.map(it => ({
        productId:   it.productId,
        productName: it.productName,
        productCode: it.productCode || undefined,
        qty:         it.qty,
        unitPrice:   it.unitPrice,
      })),
    }
    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: editId, input: payload })
        toast.success('Cotización actualizada')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Cotización creada')
      }
      handleClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEdit ? 'Editar cotización' : 'Nueva cotización'}
          </DialogTitle>
        </DialogHeader>

        {isEdit && loadingExisting
          ? <LoadingSpinner label="Cargando..." />
          : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              {/* Cliente */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Nombre del cliente *</Label>
                  <Input value={form.customerName} onChange={set('customerName')} placeholder="Juan García" required />
                </div>
                <div className="grid gap-1.5">
                  <Label>NIT</Label>
                  <Input value={form.customerNit} onChange={set('customerNit')} placeholder="123456-7" />
                </div>
              </div>

              {/* Vigencia y notas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Válida hasta</Label>
                  <Input type="date" value={form.validUntil} onChange={set('validUntil')} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Notas</Label>
                  <Input value={form.notes} onChange={set('notes')} placeholder="Observaciones..." />
                </div>
              </div>

              {/* Productos */}
              <div>
                <div className="po-items-header">
                  <span className="text-sm font-semibold">Productos / Servicios</span>
                  <button type="button" className="po-add-item-btn" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5" /> Agregar
                  </button>
                </div>
                {items.length === 0
                  ? <p className="po-items-empty">Agrega productos a la cotización.</p>
                  : (
                    <div className="qt-items-list">
                      <div className="qt-items-header">
                        <span>Producto del sistema</span>
                        <span>Descripción</span>
                        <span className="text-center">Cant.</span>
                        <span className="text-center">Precio unit.</span>
                        <span className="text-right">Subtotal</span>
                        <span />
                      </div>
                      {items.map((item, idx) => (
                        <div key={idx} className="qt-item-row">
                          <select className="po-select" value={item.productId ?? ''}
                            onChange={e => selectProduct(idx, e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {products.filter(p => p.is_active === 1).map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <Input placeholder="Descripción / nombre"
                            value={item.productName}
                            onChange={e => updateItem(idx, 'productName', e.target.value)} />
                          <Input type="number" min="0.01" step="0.01" placeholder="1"
                            value={item.qty}
                            onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} />
                          <Input type="number" min="0" step="0.01" placeholder="0.00"
                            value={item.unitPrice}
                            onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                          <span className="qt-item-subtotal">{fmtMoney(item.qty * item.unitPrice)}</span>
                          <button type="button" className="po-item-remove" onClick={() => removeItem(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="qt-totals-row">
                        <span className="text-muted-foreground text-sm">Subtotal:</span>
                        <strong>{fmtMoney(subtotal)}</strong>
                      </div>
                    </div>
                  )
                }
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear cotización'}
                </Button>
              </DialogFooter>
            </form>
          )
        }
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Detalle de cotización ─────────────────────────────────────────────

function QuoteDetailModal({ id, onClose }) {
  const { data, isLoading } = useQuote(id)
  const q = data?.quote

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cotización #{id}</DialogTitle>
          {q && (
            <DialogDescription>
              {q.customer_name}{q.customer_nit ? ` · NIT: ${q.customer_nit}` : ''} ·{' '}
              <span className={`po-badge ${STATUS_CLASS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
            </DialogDescription>
          )}
        </DialogHeader>
        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : q && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="qt-detail-grid">
                <div>
                  <div className="rv-detail-label">Creada por</div>
                  <div className="rv-detail-value">{q.created_by_name ?? '—'}</div>
                </div>
                <div>
                  <div className="rv-detail-label">Fecha</div>
                  <div className="rv-detail-value">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(q.created_at))}</div>
                </div>
                <div>
                  <div className="rv-detail-label">Válida hasta</div>
                  <div className="rv-detail-value">{fmtDate(q.valid_until)}</div>
                </div>
                {q.sale_id && (
                  <div>
                    <div className="rv-detail-label">Venta generada</div>
                    <div className="rv-detail-value font-semibold text-emerald-600">#{q.sale_id}</div>
                  </div>
                )}
                {q.notes && (
                  <div className="col-span-2">
                    <div className="rv-detail-label">Notas</div>
                    <div className="rv-detail-value">{q.notes}</div>
                  </div>
                )}
              </div>

              {/* Items */}
              <table className="sh-table">
                <thead>
                  <tr>
                    <th className="sh-th">Producto / Servicio</th>
                    <th className="sh-th sh-num w-20">Cant.</th>
                    <th className="sh-th sh-num w-28">Precio unit.</th>
                    <th className="sh-th sh-num w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, i) => (
                    <tr key={it.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td">
                        {it.product_code && <span className="inv-code mr-2">{it.product_code}</span>}
                        {it.product_name}
                      </td>
                      <td className="sh-td sh-num">{it.qty}</td>
                      <td className="sh-td sh-num">{fmtMoney(it.unit_price)}</td>
                      <td className="sh-td sh-num sh-total">{fmtMoney(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="sh-td text-right text-muted-foreground text-sm">Subtotal:</td>
                    <td className="sh-td sh-num">{fmtMoney(q.subtotal)}</td>
                  </tr>
                  {taxEnabled && (
                    <tr>
                      <td colSpan={3} className="sh-td text-right text-muted-foreground text-sm">IVA ({(q.tax_rate * 100).toFixed(0)}%):</td>
                      <td className="sh-td sh-num">{fmtMoney(q.tax_amount)}</td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td colSpan={3} className="sh-td text-right">Total:</td>
                    <td className="sh-td sh-num sh-total">{fmtMoney(q.total)}</td>
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

// ── Dialog: Imprimir cotización ───────────────────────────────────────────────

function QuotePrintDialog({ id, onClose }) {
  const { data, isLoading } = useQuote(id)
  const { name: bizName, logo: bizLogo } = useBusinessSettings()
  const q = data?.quote

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Imprimir cotización #{id}
          </DialogTitle>
        </DialogHeader>

        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : q && (
            <div className="print-friendly qt-print-body">
              {/* Encabezado */}
              <header className="qt-print-header">
                {bizLogo && <img src={bizLogo} alt={bizName} className="qt-print-logo" />}
                <div>
                  <div className="qt-print-biz-name">{bizName}</div>
                  <div className="qt-print-doc-title">COTIZACIÓN #{q.id}</div>
                </div>
              </header>

              {/* Info cliente y fechas */}
              <div className="qt-print-meta">
                <div>
                  <div className="qt-print-meta-label">Cliente</div>
                  <div className="qt-print-meta-value">{q.customer_name}</div>
                  {q.customer_nit && <div className="qt-print-meta-sub">NIT: {q.customer_nit}</div>}
                </div>
                <div className="text-right">
                  <div className="qt-print-meta-label">Fecha</div>
                  <div className="qt-print-meta-value">{fmtDate(q.created_at?.slice(0,10))}</div>
                  {q.valid_until && (
                    <>
                      <div className="qt-print-meta-label mt-1">Válida hasta</div>
                      <div className="qt-print-meta-value">{fmtDate(q.valid_until)}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Items */}
              <table className="qt-print-table">
                <thead>
                  <tr>
                    <th className="text-left">Descripción</th>
                    <th className="text-right w-16">Cant.</th>
                    <th className="text-right w-28">Precio unit.</th>
                    <th className="text-right w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, i) => (
                    <tr key={it.id} className={i % 2 === 0 ? 'qt-print-row-even' : ''}>
                      <td>
                        {it.product_code && <span className="qt-print-code">{it.product_code} · </span>}
                        {it.product_name}
                      </td>
                      <td className="text-right">{it.qty}</td>
                      <td className="text-right">{fmtMoney(it.unit_price)}</td>
                      <td className="text-right font-medium">{fmtMoney(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totales */}
              <div className="qt-print-totals">
                <div className="qt-print-total-row">
                  <span>Subtotal</span><span>{fmtMoney(q.subtotal)}</span>
                </div>
                {taxEnabled && (
                  <div className="qt-print-total-row">
                    <span>IVA ({(q.tax_rate * 100).toFixed(0)}%)</span><span>{fmtMoney(q.tax_amount)}</span>
                  </div>
                )}
                <div className="qt-print-total-row qt-print-total-final">
                  <span>TOTAL</span><span>{fmtMoney(q.total)}</span>
                </div>
              </div>

              {/* Notas */}
              {q.notes && (
                <div className="qt-print-notes">
                  <span className="font-semibold">Notas: </span>{q.notes}
                </div>
              )}

              <div className="qt-print-footer">
                Gracias por su preferencia · {bizName}
              </div>
            </div>
          )
        }

        <DialogFooter className="no-print gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          <Button type="button" disabled={!q} onClick={() => window.print()}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
