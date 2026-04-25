import { Printer, ReceiptText, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'
import { useSale } from '@/hooks/useSales'

const dateFmt = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

/**
 * Dialog de detalle de venta. Lee del main via useSale(id) para que los
 * datos sean autoritativos (los snapshots de tax/cliente vienen de ahi).
 *
 * Imprimir: usa window.print() apoyandose en las reglas @media print del
 * legacy CSS (.print-friendly visible, .no-print oculto, body* hidden).
 * El dialog Radix queda en su portal pero el wrapper .print-friendly
 * mantiene la visibilidad solo del contenido del ticket.
 *
 * @param {{ open: boolean, onOpenChange: (v: boolean) => void, saleId: number | null }} props
 */
export function SaleDetailDialog({ open, onOpenChange, saleId }) {
  const { data, isLoading, isError, error } = useSale(saleId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="no-print">
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5 text-primary" />
            {saleId != null ? `Venta #${saleId}` : 'Venta'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <LoadingSpinner label="Cargando ticket..." className="justify-center py-6" />}

        {isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error instanceof Error ? error.message : 'No se pudo cargar el ticket'}
          </div>
        )}

        {!isLoading && !isError && data == null && saleId != null && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Esta venta no existe o fue eliminada.
          </div>
        )}

        {data && <Ticket sale={data} />}

        <DialogFooter className="no-print gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button
            type="button"
            disabled={!data}
            onClick={() => window.print()}
          >
            <Printer className="mr-1 h-4 w-4" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Cuerpo del ticket. Wrapper `.print-friendly` engancha con las reglas
 * @media print del CSS legacy para imprimir solo este bloque.
 *
 * @param {{ sale: import('@/schemas/sale.schema').SaleWithItems }} props
 */
function Ticket({ sale }) {
  const taxPct = Math.round(sale.tax_rate_applied * 100)

  return (
    <div className="print-friendly space-y-4 text-sm">
      <header className="space-y-1 text-center">
        <p className="text-base font-semibold">Comprobante de venta</p>
        <p className="text-xs text-muted-foreground">
          {dateFmt.format(new Date(sale.date.replace(' ', 'T')))} · Folio interno #{sale.id}
        </p>
      </header>

      <Separator />

      <div className="flex items-start gap-2">
        <UserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">
            {sale.customer_name_snapshot ?? 'Consumidor Final'}
          </p>
          <p className="text-xs text-muted-foreground">
            NIT: <span className="font-mono">{sale.customer_nit_snapshot ?? 'C/F'}</span>
            {sale.customer_id != null && (
              <Badge variant="secondary" className="ml-2">ID #{sale.customer_id}</Badge>
            )}
          </p>
        </div>
      </div>

      <Separator />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="py-1 font-medium">Producto</th>
            <th className="py-1 text-right font-medium">Cant</th>
            <th className="py-1 text-right font-medium">Precio</th>
            <th className="py-1 text-right font-medium">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it) => (
            <tr key={it.id} className="border-b last:border-0 align-top">
              <td className="py-2">
                <p className="font-medium">{it.product_name ?? `Producto #${it.product_id}`}</p>
                {it.product_code && (
                  <p className="font-mono text-xs text-muted-foreground">{it.product_code}</p>
                )}
              </td>
              <td className="py-2 text-right">{it.qty}</td>
              <td className="py-2 text-right">
                <MoneyDisplay amount={it.price} />
              </td>
              <td className="py-2 text-right font-medium">
                <MoneyDisplay amount={it.price * it.qty} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Separator />

      <dl className="space-y-1">
        <Row label="Subtotal">
          <MoneyDisplay amount={sale.subtotal} />
        </Row>
        <Row label={`IVA (${taxPct}%)`}>
          <MoneyDisplay amount={sale.tax_amount} />
        </Row>
        <Row label="Total" emphasize>
          <MoneyDisplay amount={sale.total} className="text-primary" />
        </Row>
      </dl>
    </div>
  )
}

/** @param {{ label: string, emphasize?: boolean, children: React.ReactNode }} props */
function Row({ label, emphasize = false, children }) {
  return (
    <div
      className={
        emphasize
          ? 'flex items-center justify-between border-t pt-2 text-base font-bold'
          : 'flex items-center justify-between text-sm text-muted-foreground'
      }
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
