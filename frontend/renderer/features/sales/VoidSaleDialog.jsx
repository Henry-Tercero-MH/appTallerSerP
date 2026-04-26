import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import { Button }    from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { MoneyDisplay } from '@/components/shared/MoneyDisplay'
import { useVoidSale }  from '@/hooks/useSales'
import { useAuthContext } from '@/features/auth/AuthContext'

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (v: boolean) => void,
 *   sale: import('@/schemas/sale.schema').Sale | null,
 * }} props
 */
export function VoidSaleDialog({ open, onOpenChange, sale }) {
  const [reason, setReason] = useState('')
  const { user } = useAuthContext()
  const voidMutation = useVoidSale()

  function handleClose() {
    if (voidMutation.isPending) return
    setReason('')
    onOpenChange(false)
  }

  function handleConfirm() {
    if (!sale) return
    voidMutation.mutate(
      {
        saleId:   sale.id,
        reason:   reason.trim(),
        userId:   user?.id,
        userName: user?.full_name ?? user?.email,
      },
      {
        onSuccess: () => {
          toast.success(`Venta #${sale.id} anulada`)
          setReason('')
          onOpenChange(false)
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'No se pudo anular')
        },
      }
    )
  }

  const canConfirm = reason.trim().length >= 5 && !voidMutation.isPending

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Anular venta #{sale?.id}
          </DialogTitle>
        </DialogHeader>

        {sale && (
          <div className="space-y-4">
            {/* Resumen de la venta */}
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cliente</span>
                <span className="font-medium">{sale.customer_name_snapshot ?? 'Consumidor Final'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <MoneyDisplay amount={sale.total} className="font-bold text-primary" />
              </div>
            </div>

            <Separator />

            {/* Advertencia */}
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Esta acción es irreversible. El stock de los productos será restaurado automáticamente.
            </div>

            {/* Motivo */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Motivo de anulación <span className="text-destructive">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe el motivo (mínimo 5 caracteres)..."
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground text-right">{reason.trim().length} / 5 mín.</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={voidMutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {voidMutation.isPending ? 'Anulando...' : 'Confirmar anulación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
