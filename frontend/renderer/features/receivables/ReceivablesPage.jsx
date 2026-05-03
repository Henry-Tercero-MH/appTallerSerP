import { useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, Eye, Ban, CreditCard, RefreshCw,
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
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
  useReceivables, useReceivable, useReceivablesSummary,
  useCreateReceivable, useApplyPayment, useCancelReceivable,
} from '@/hooks/useReceivables'
import { useAuthContext } from '@/features/auth/AuthContext'

/** @param {string|null|undefined} s */
const fmtDate  = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(s + 'T00:00:00')) : '—'
/** @param {number|null|undefined} n */
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

const STATUS_LABEL = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagada', cancelled: 'Cancelada' }
const STATUS_CLASS = { pending: 'rv-badge-pending', partial: 'rv-badge-partial', paid: 'rv-badge-paid', cancelled: 'rv-badge-cancelled' }

const PAYMENT_METHODS = [
  { value: 'cash',     label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card',     label: 'Tarjeta' },
  { value: 'check',    label: 'Cheque' },
]

export default function ReceivablesPage() {
  const { user }         = useAuthContext()
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [newModal, setNewModal]         = useState(false)
  const [detailId, setDetailId]         = useState(/** @type {number|null} */ (null))
  const [payId, setPayId]               = useState(/** @type {number|null} */ (null))
  const [cancelId, setCancelId]         = useState(/** @type {number|null} */ (null))

  const { data: list = [], isLoading, refetch, isFetching } = useReceivables()
  const { data: summary } = useReceivablesSummary()
  const cancelMut = useCancelReceivable()

  const filtered = list.filter(r => {
    const matchStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'active'
        ? ['pending', 'partial'].includes(r.status)
        : r.status === statusFilter
    const q = search.toLowerCase()
    const matchSearch = !q || r.customer_name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)
    return matchStatus && matchSearch
  })

  async function handleCancel() {
    if (!cancelId) return
    try {
      await cancelMut.mutateAsync(cancelId)
      toast.success('Cuenta cancelada')
      setCancelId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
      setCancelId(null)
    }
  }

  const isOverdue = (r) => r.due_date && r.due_date < new Date().toISOString().slice(0, 10) && ['pending', 'partial'].includes(r.status)

  return (
    <div className="p-6">
      <PageHeader title="Cuentas por Cobrar" subtitle="Gestión de créditos y cobros" />

      {/* KPIs */}
      {summary && (
        <div className="rv-kpis">
          <div className="rv-kpi">
            <TrendingUp className="rv-kpi-icon" />
            <div>
              <div className="rv-kpi-label">Total pendiente</div>
              <div className="rv-kpi-value">{fmtMoney(summary.total_balance)}</div>
            </div>
          </div>
          <div className="rv-kpi rv-kpi-warning">
            <AlertTriangle className="rv-kpi-icon" />
            <div>
              <div className="rv-kpi-label">Vencidas</div>
              <div className="rv-kpi-value">{fmtMoney(summary.overdue_balance)}</div>
            </div>
          </div>
          <div className="rv-kpi rv-kpi-partial">
            <Clock className="rv-kpi-icon" />
            <div>
              <div className="rv-kpi-label">Parcialmente pagadas</div>
              <div className="rv-kpi-value">{fmtMoney(summary.partial_balance)}</div>
            </div>
          </div>
          <div className="rv-kpi rv-kpi-success">
            <CheckCircle2 className="rv-kpi-icon" />
            <div>
              <div className="rv-kpi-label">Cuentas activas</div>
              <div className="rv-kpi-value">{summary.total_count}</div>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="rv-toolbar">
        <div className="rv-toolbar-left">
          <input
            className="po-search"
            placeholder="Buscar cliente o descripción..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="rv-filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="active">Activas</option>
            <option value="all">Todas</option>
            <option value="pending">Pendientes</option>
            <option value="partial">Parciales</option>
            <option value="paid">Pagadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>
        <div className="rv-toolbar-right">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setNewModal(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nueva cuenta
          </Button>
        </div>
      </div>

      {isLoading
        ? <LoadingSpinner label="Cargando cuentas..." className="py-10" />
        : filtered.length === 0
          ? <EmptyState title="Sin cuentas" description="No hay cuentas por cobrar con los filtros seleccionados." />
          : (
            <div className="sh-table-card">
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th className="sh-th">Cliente</th>
                      <th className="sh-th">Descripción</th>
                      <th className="sh-th w-28">Estado</th>
                      <th className="sh-th sh-num">Total</th>
                      <th className="sh-th sh-num">Pagado</th>
                      <th className="sh-th sh-num">Saldo</th>
                      <th className="sh-th">Vencimiento</th>
                      <th className="sh-th w-36 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={r.id} className={`${i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'} ${isOverdue(r) ? 'rv-overdue-row' : ''}`}>
                        <td className="sh-td">
                          <div className="rv-customer-name">{r.customer_name}</div>
                          {r.customer_nit && <div className="rv-customer-nit">NIT: {r.customer_nit}</div>}
                        </td>
                        <td className="sh-td sh-muted">{r.description}</td>
                        <td className="sh-td">
                          <span className={`po-badge ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                          {isOverdue(r) && <span className="rv-overdue-tag">vencida</span>}
                        </td>
                        <td className="sh-td sh-num">{fmtMoney(r.amount)}</td>
                        <td className="sh-td sh-num">{fmtMoney(r.amount_paid)}</td>
                        <td className="sh-td sh-num sh-total">{fmtMoney(r.amount - r.amount_paid)}</td>
                        <td className="sh-td sh-muted">{fmtDate(r.due_date)}</td>
                        <td className="sh-td">
                          <div className="sh-actions">
                            <button className="sh-action-btn" title="Ver detalle" onClick={() => setDetailId(r.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {['pending', 'partial'].includes(r.status) && (
                              <button className="sh-action-btn" title="Registrar pago" onClick={() => setPayId(r.id)}>
                                <CreditCard className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['pending', 'partial'].includes(r.status) && (
                              <button className="sh-action-btn sh-void-btn" title="Cancelar" onClick={() => setCancelId(r.id)}>
                                <Ban className="h-3.5 w-3.5" />
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

      <NewReceivableModal open={newModal} onClose={() => setNewModal(false)} user={user} />
      <ReceivableDetailModal id={detailId} onClose={() => setDetailId(null)} />
      <PaymentModal id={payId} onClose={() => setPayId(null)} user={user} />

      {/* Confirmación de cancelación */}
      <Dialog open={!!cancelId} onOpenChange={(o) => { if (!o) setCancelId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="h-5 w-5" /> Cancelar cuenta por cobrar
            </DialogTitle>
            <DialogDescription>
              Esta acción cancela la cuenta y no puede deshacerse.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                <strong>El inventario NO se restaura automáticamente.</strong>{' '}
                Los productos ya fueron entregados al cliente al crear esta cuenta.
              </p>
            </div>
            <p className="pl-6 text-amber-700">
              Si el cliente devuelve mercancía, registra la entrada desde{' '}
              <strong>Inventario → Ajustes</strong>.
            </p>
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button variant="outline" onClick={() => setCancelId(null)}>
              Atrás
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMut.isPending}
              onClick={handleCancel}
            >
              {cancelMut.isPending ? 'Cancelando...' : 'Confirmar cancelación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Modal: Nueva cuenta por cobrar ───────────────────────────────────────────

function NewReceivableModal({ open, onClose, user }) {
  const [form, setForm] = useState({
    customerName: '',
    customerNit:  '',
    description:  '',
    amount:       '',
    dueDate:      '',
    notes:        '',
  })
  const mut = useCreateReceivable()
  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await mut.mutateAsync({
        customerName: form.customerName,
        customerNit:  form.customerNit  || undefined,
        description:  form.description,
        amount:       parseFloat(form.amount) || 0,
        dueDate:      form.dueDate || undefined,
        notes:        form.notes   || undefined,
        userId:       user.id,
        userName:     user.full_name,
      })
      toast.success('Cuenta creada')
      setForm({ customerName: '', customerNit: '', description: '', amount: '', dueDate: '', notes: '' })
      onClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" /> Nueva cuenta por cobrar
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Nombre del cliente *</Label>
              <Input value={form.customerName} onChange={set('customerName')} placeholder="Juan García" required />
            </div>
            <div className="grid gap-1.5">
              <Label>NIT (opcional)</Label>
              <Input value={form.customerNit} onChange={set('customerNit')} placeholder="123456-7" />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Descripción *</Label>
            <Input value={form.description} onChange={set('description')} placeholder="Ej. Reparación vehículo, factura #123..." required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Monto total *</Label>
              <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
            </div>
            <div className="grid gap-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input type="date" value={form.dueDate} onChange={set('dueDate')} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Input value={form.notes} onChange={set('notes')} placeholder="Observaciones..." />
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>{mut.isPending ? 'Guardando...' : 'Crear cuenta'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Detalle de cuenta ─────────────────────────────────────────────────

function ReceivableDetailModal({ id, onClose }) {
  const { data, isLoading } = useReceivable(id)
  const r = data?.receivable

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cuenta #{id}</DialogTitle>
          {r && <DialogDescription>{r.customer_name} · {fmtMoney(r.amount)}</DialogDescription>}
        </DialogHeader>
        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : r && (
            <div className="space-y-4">
              {/* Info principal */}
              <div className="rv-detail-grid">
                <div className="rv-detail-field">
                  <span className="rv-detail-label">Cliente</span>
                  <span className="rv-detail-value">{r.customer_name}{r.customer_nit ? ` · NIT: ${r.customer_nit}` : ''}</span>
                </div>
                <div className="rv-detail-field">
                  <span className="rv-detail-label">Estado</span>
                  <span className={`po-badge ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
                <div className="rv-detail-field">
                  <span className="rv-detail-label">Descripción</span>
                  <span className="rv-detail-value">{r.description}</span>
                </div>
                <div className="rv-detail-field">
                  <span className="rv-detail-label">Vencimiento</span>
                  <span className="rv-detail-value">{fmtDate(r.due_date)}</span>
                </div>
                <div className="rv-detail-field">
                  <span className="rv-detail-label">Total</span>
                  <span className="rv-detail-value font-semibold">{fmtMoney(r.amount)}</span>
                </div>
                <div className="rv-detail-field">
                  <span className="rv-detail-label">Saldo pendiente</span>
                  <span className="rv-detail-value font-semibold text-amber-600">{fmtMoney(r.amount - r.amount_paid)}</span>
                </div>
              </div>

              {/* Pagos */}
              <div>
                <div className="rv-payments-title">Historial de pagos</div>
                {data.payments.length === 0
                  ? <p className="rv-no-payments">Sin pagos registrados.</p>
                  : (
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th className="sh-th">Fecha</th>
                          <th className="sh-th">Método</th>
                          <th className="sh-th sh-num">Monto</th>
                          <th className="sh-th">Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.payments.map((p, i) => (
                          <tr key={p.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                            <td className="sh-td sh-muted">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(p.created_at))}</td>
                            <td className="sh-td">{PAYMENT_METHODS.find(m => m.value === p.payment_method)?.label ?? p.payment_method}</td>
                            <td className="sh-td sh-num sh-total">{fmtMoney(p.amount)}</td>
                            <td className="sh-td sh-muted">{p.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                }
              </div>
            </div>
          )
        }
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Registrar pago ────────────────────────────────────────────────────

function PaymentModal({ id, onClose, user }) {
  const { data, isLoading } = useReceivable(id)
  const [amount, setAmount]   = useState('')
  const [method, setMethod]   = useState('cash')
  const [notes, setNotes]     = useState('')
  const mut = useApplyPayment()

  const balance = data ? data.receivable.amount - data.receivable.amount_paid : 0

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      await mut.mutateAsync({
        receivableId:  id,
        amount:        parseFloat(amount) || 0,
        paymentMethod: method,
        notes:         notes || undefined,
        userId:        user.id,
        userName:      user.full_name,
      })
      toast.success('Pago registrado')
      setAmount(''); setNotes('')
      onClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-emerald-600" /> Registrar pago
          </DialogTitle>
          {data && (
            <DialogDescription>
              {data.receivable.customer_name} · Saldo: <strong>{fmtMoney(balance)}</strong>
            </DialogDescription>
          )}
        </DialogHeader>
        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : (
            <form onSubmit={handleSubmit} className="space-y-3 pt-1">
              <div className="grid gap-1.5">
                <Label>Monto a pagar *</Label>
                <Input
                  type="number" min="0.01" step="0.01" max={balance}
                  value={amount} onChange={e => setAmount(e.target.value)}
                  placeholder={fmtMoney(balance)}
                  required
                />
                <button type="button" className="rv-pay-full-btn" onClick={() => setAmount(String(balance))}>
                  Pagar saldo completo ({fmtMoney(balance)})
                </button>
              </div>
              <div className="grid gap-1.5">
                <Label>Método de pago</Label>
                <select className="po-select" value={method} onChange={e => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Notas (opcional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
              </div>
              <DialogFooter className="gap-2 pt-1">
                <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
                <Button type="submit" disabled={mut.isPending}>
                  {mut.isPending ? 'Procesando...' : 'Registrar pago'}
                </Button>
              </DialogFooter>
            </form>
          )
        }
      </DialogContent>
    </Dialog>
  )
}
