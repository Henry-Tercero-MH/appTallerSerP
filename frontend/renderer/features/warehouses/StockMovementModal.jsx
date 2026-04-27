import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * @param {{
 *   product: any,
 *   isEntry: boolean,
 *   onSave: (data: any) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function StockMovementModal({ product, isEntry, onSave, onCancel }) {
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')

  const typeLabel = isEntry ? 'Entrada' : 'Salida'

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!isEntry && qty > product.stock) {
          toast.error('La cantidad de salida no puede ser mayor al stock actual.')
          return
        }
        onSave({
          productId: product.id,
          type: isEntry ? 'in' : 'out',
          qty,
          notes,
        })
      }}
    >
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Registrar <strong>{typeLabel.toLowerCase()}</strong> para:
        </p>
        <p className="mt-1 text-base font-semibold">
          {product.name} — {product.brand}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Codigo: <span className="font-mono">{product.code}</span> · Stock actual: <strong>{product.stock}</strong>
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="qty">Cantidad de {typeLabel.toLowerCase()} *</Label>
        <Input
          id="qty"
          type="number"
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          min={1}
          max={isEntry ? 9999 : product.stock}
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notas / motivo *</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={isEntry ? 'Ej. Compra a proveedor...' : 'Ej. O.T. #123 o venta directa...'}
          rows={3}
          required
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant={isEntry ? 'default' : 'destructive'}>
          Confirmar {typeLabel}
        </Button>
      </div>
    </form>
  )
}
