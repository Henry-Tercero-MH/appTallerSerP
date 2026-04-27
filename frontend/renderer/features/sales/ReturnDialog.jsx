import { useState, useEffect } from 'react'
import { Undo2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import { useCreateReturn } from '@/hooks/useReturns'
import { useAuthContext }  from '@/features/auth/AuthContext'

const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

async function fetchSaleDetail(id) {
  const res = await window.api.sales.getById(id)
  if (!res.ok) throw new Error(res.error?.message ?? 'Error al cargar venta')
  return res.data
}

/** @param {{ saleId: number|null, onClose: () => void }} props */
export function ReturnDialog({ saleId, onClose }) {
  const { user } = useAuthContext()
  const [sale,    setSale]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [reason,  setReason]  = useState('')
  const [notes,   setNotes]   = useState('')
  const [qtys,    setQtys]    = useState(/** @type {Record<number, number>} */ ({}))

  const createReturn = useCreateReturn()

  useEffect(() => {
    if (!saleId) { setSale(null); setReason(''); setNotes(''); setQtys({}); return }
    setLoading(true)
    fetchSaleDetail(saleId)
      .then(d => {
        setSale(d)
        const init = {}
        d.items?.forEach(it => { init[it.id] = 0 })
        setQtys(init)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [saleId])

  const selectedItems = sale?.items?.filter(it => (qtys[it.id] ?? 0) > 0) ?? []
  const totalRefund = selectedItems.reduce((s, it) => s + (qtys[it.id] ?? 0) * it.price, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    if (selectedItems.length === 0) { toast.error('Selecciona al menos un producto'); return }
    if (!reason.trim()) { toast.error('El motivo es requerido'); return }

    await createReturn.mutateAsync({
      saleId,
      reason: reason.trim(),
      notes:  notes.trim() || undefined,
      items:  selectedItems.map(it => ({
        saleItemId:  it.id,
        productId:   it.product_id,
        productName: it.product_name ?? it.name ?? '',
        qtyReturned: qtys[it.id],
        unitPrice:   it.price,
      })),
      createdBy:     user?.id,
      createdByName: user?.full_name,
    })
    onClose()
  }

  return (
    <Dialog open={!!saleId} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-amber-600" /> Devolver productos — Venta #{saleId}
          </DialogTitle>
          {sale && (
            <DialogDescription>
              {sale.customer_name_snapshot ?? 'Consumidor Final'} · {fmtMoney(sale.total)}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading ? <LoadingSpinner label="Cargando venta..." /> : sale && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Indica la cantidad a devolver por producto. Los artículos devueltos regresan al stock.
            </p>

            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {sale.items?.map(it => (
                <div key={it.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.product_name ?? it.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Vendido: {it.qty} · {fmtMoney(it.price)} c/u
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Label className="text-xs text-muted-foreground">Devolver:</Label>
                    <Input
                      type="number"
                      min="0"
                      max={it.qty}
                      step="1"
                      className="w-16 h-7 text-xs text-center"
                      value={qtys[it.id] ?? 0}
                      onChange={e => setQtys(p => ({ ...p, [it.id]: Math.min(parseFloat(e.target.value) || 0, it.qty) }))}
                    />
                  </div>
                </div>
              ))}
            </div>

            {totalRefund > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                Reembolso estimado: <strong>{fmtMoney(totalRefund)}</strong>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label>Motivo de devolución *</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Ej. Producto defectuoso, cliente cambió de opinión..." required />
            </div>
            <div className="grid gap-1.5">
              <Label>Notas adicionales</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones..." />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={createReturn.isPending || selectedItems.length === 0}>
                {createReturn.isPending ? 'Procesando...' : 'Confirmar devolución'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
