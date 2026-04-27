import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, RefreshCw, TrendingDown, Calendar } from 'lucide-react'

import { PageHeader }     from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState }     from '@/components/shared/EmptyState'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

import {
  useExpenses, useExpenseSummary, useExpenseCategories,
  useCreateExpense, useUpdateExpense, useRemoveExpense,
} from '@/hooks/useExpenses'
import { useAuthContext } from '@/features/auth/AuthContext'

const fmtDate  = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(s + 'T00:00:00')) : '—'
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

const PAYMENT_LABELS = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta', check: 'Cheque' }

const CAT_LABELS = {
  renta: 'Renta', servicios: 'Servicios', sueldos: 'Sueldos', insumos: 'Insumos',
  transporte: 'Transporte', mantenimiento: 'Mantenimiento', publicidad: 'Publicidad',
  impuestos: 'Impuestos', otros: 'Otros',
}

function todayStr() { return new Date().toISOString().slice(0, 10) }
function firstOfMonth() {
  const d = new Date(); d.setDate(1)
  return d.toISOString().slice(0, 10)
}

export default function ExpensesPage() {
  const { user } = useAuthContext()
  const [from, setFrom]   = useState(firstOfMonth)
  const [to,   setTo]     = useState(todayStr)
  const [modal, setModal] = useState(/** @type {null|'new'|object} */ (null))

  const { data: list = [], isLoading, refetch, isFetching } = useExpenses({ from, to })
  const { data: summary } = useExpenseSummary(from, to)
  const removeMut = useRemoveExpense()

  async function handleRemove(id) {
    if (!confirm('¿Eliminar este gasto?')) return
    try { await removeMut.mutateAsync(id) }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Gastos / Egresos" subtitle="Control de gastos operativos del negocio" />

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground">Total en período</div>
              <div className="text-xl font-bold text-destructive mt-1">{fmtMoney(summary.total)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground">Hoy</div>
              <div className="text-xl font-bold mt-1">{fmtMoney(summary.today)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground">Registros</div>
              <div className="text-xl font-bold mt-1">{summary.count}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground">Mayor categoría</div>
              <div className="text-sm font-bold mt-1 truncate">
                {summary.byCategory?.[0]
                  ? `${CAT_LABELS[summary.byCategory[0].category] ?? summary.byCategory[0].category} — ${fmtMoney(summary.byCategory[0].total)}`
                  : '—'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          <span className="text-xs text-muted-foreground">—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setModal('new')}>
            <Plus className="mr-1 h-4 w-4" /> Registrar gasto
          </Button>
        </div>
      </div>

      {isLoading
        ? <LoadingSpinner label="Cargando gastos..." className="py-10" />
        : list.length === 0
          ? <EmptyState title="Sin gastos" description="No hay gastos registrados en el período seleccionado." />
          : (
            <div className="sh-table-card">
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th className="sh-th">Fecha</th>
                      <th className="sh-th">Categoría</th>
                      <th className="sh-th">Descripción</th>
                      <th className="sh-th">Método</th>
                      <th className="sh-th sh-num w-32">Monto</th>
                      <th className="sh-th w-24 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((exp, i) => (
                      <tr key={exp.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                        <td className="sh-td sh-muted">{fmtDate(exp.expense_date)}</td>
                        <td className="sh-td">
                          <span className="po-badge po-badge-draft">{CAT_LABELS[exp.category] ?? exp.category}</span>
                        </td>
                        <td className="sh-td font-medium">{exp.description}</td>
                        <td className="sh-td sh-muted">{PAYMENT_LABELS[exp.payment_method] ?? exp.payment_method}</td>
                        <td className="sh-td sh-num sh-total text-destructive">{fmtMoney(exp.amount)}</td>
                        <td className="sh-td">
                          <div className="sh-actions">
                            <button className="sh-action-btn" title="Editar" onClick={() => setModal(exp)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button className="sh-action-btn sh-void-btn" title="Eliminar" onClick={() => handleRemove(exp.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="sh-tf sh-tf-label">Total período</td>
                      <td className="sh-tf sh-num sh-tf-total text-destructive">{fmtMoney(summary?.total ?? 0)}</td>
                      <td className="sh-tf" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
      }

      <ExpenseModal
        open={!!modal}
        initial={modal !== 'new' ? modal : null}
        onClose={() => setModal(null)}
        user={user}
      />
    </div>
  )
}

function ExpenseModal({ open, initial, onClose, user }) {
  const isEdit = !!initial
  const [form, setForm] = useState({
    category:       initial?.category       ?? 'otros',
    description:    initial?.description    ?? '',
    amount:         initial?.amount         ?? '',
    payment_method: initial?.payment_method ?? 'cash',
    expense_date:   initial?.expense_date   ?? todayStr(),
    notes:          initial?.notes          ?? '',
  })

  const { data: cats = [] } = useExpenseCategories()
  const createMut = useCreateExpense()
  const updateMut = useUpdateExpense()

  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = { ...form, amount: parseFloat(form.amount) || 0,
      created_by: user?.id, created_by_name: user?.full_name }
    try {
      if (isEdit) await updateMut.mutateAsync({ id: initial.id, input: payload })
      else        await createMut.mutateAsync(payload)
      onClose()
    } catch (err) { toast.error(err.message) }
  }

  const isPending = createMut.isPending || updateMut.isPending

  const catOptions = cats.length ? cats : Object.keys(CAT_LABELS)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-destructive" />
            {isEdit ? 'Editar gasto' : 'Registrar gasto'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Categoría</Label>
              <select className="po-select" value={form.category} onChange={set('category')}>
                {catOptions.map(c => (
                  <option key={c} value={c}>{CAT_LABELS[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Fecha *</Label>
              <Input type="date" value={form.expense_date} onChange={set('expense_date')} required />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Descripción *</Label>
            <Input value={form.description} onChange={set('description')} placeholder="Ej. Pago de renta mensual" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Monto *</Label>
              <Input type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
            </div>
            <div className="grid gap-1.5">
              <Label>Método de pago</Label>
              <select className="po-select" value={form.payment_method} onChange={set('payment_method')}>
                {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <Input value={form.notes} onChange={set('notes')} placeholder="Observaciones opcionales..." />
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : isEdit ? 'Actualizar' : 'Registrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
