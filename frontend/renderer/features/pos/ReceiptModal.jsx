import { useRef } from 'react'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { usePrinterSettings } from '@/hooks/useSettings'

/** @param {number} n */
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)
/** @param {Date} d */
const fmtDate  = (d) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'short', timeStyle: 'short', hour12: false }).format(d)

/** @type {Record<string, string>} */
const PAYMENT_LABELS = {
  cash:     'Efectivo',
  card:     'Tarjeta',
  transfer: 'Transferencia',
  credit:   'Crédito',
}

/**
 * @param {{
 *   data: {
 *     saleId: number, date: Date,
 *     items: import('@/schemas/cart-item.schema').CartItem[],
 *     customerName: string, customerNit: string,
 *     paymentMethod: string,
 *     discount: { type: string, value: number },
 *     subtotal: number, taxAmount: number, total: number, taxRate: number,
 *     discountAmount?: number,
 *   } | null,
 *   business: { name: string, logo: string, nit: string, address: string, phone: string },
 *   taxEnabled?: boolean,
 *   onClose: () => void,
 * }} props
 */
/** Dimensiones del preview según el tamaño de papel configurado */
const PAPER_CONFIG = {
  'thermal-80':  { dialogCls: 'max-w-xs',  previewWidth: '302px', fontSize: '11px', padding: '8px'  },
  'half-letter': { dialogCls: 'max-w-xl',  previewWidth: '528px', fontSize: '12px', padding: '16px' },
  'letter':      { dialogCls: 'max-w-3xl', previewWidth: '720px', fontSize: '13px', padding: '20px' },
}

export function ReceiptModal({ data, business, taxEnabled = false, onClose }) {
  const receiptRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const { printerName, paperSize } = usePrinterSettings()
  const paper = PAPER_CONFIG[/** @type {keyof typeof PAPER_CONFIG} */ (paperSize)] ?? PAPER_CONFIG['half-letter']

  async function handlePrint() {
    const content = receiptRef.current?.innerHTML ?? ''

    const pageSizeCss = {
      'half-letter': '@page { size: 5.5in 8.5in; margin: 12mm 15mm; }',
      'letter':      '@page { size: 8.5in 11in;  margin: 15mm 20mm; }',
      'thermal-80':  '@page { size: 80mm auto;   margin: 2mm 3mm; }',
    }[paperSize] ?? '@page { size: 5.5in 8.5in; margin: 12mm 15mm; }'

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  ${pageSizeCss}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; }
  .receipt { width: 100%; max-width: 100%; }
  .receipt-center { text-align: center; margin-bottom: 8px; }
  .receipt-bold { font-weight: bold; }
  .receipt-lg { font-size: 16px; }
  .receipt-sm { font-size: 10px; color: #444; }
  .receipt-divider { border-top: 1px dashed #000; margin: 6px 0; }
  .receipt-row { display: flex; justify-content: space-between; padding: 1px 0; }
  .receipt-row-head { display: flex; justify-content: space-between; font-weight: bold; font-size: 10px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 2px; }
  .receipt-item-name { flex: 1; word-break: break-word; }
  .receipt-item-qty   { width: 28px; text-align: center; }
  .receipt-item-price { width: 64px; text-align: right; }
  .receipt-item-sub   { width: 72px; text-align: right; }
  .receipt-total-row { display: flex; justify-content: space-between; padding: 2px 0; }
  .receipt-grand { display: flex; justify-content: space-between; font-size: 15px; font-weight: bold; border-top: 2px solid #000; padding-top: 5px; margin-top: 3px; }
  .receipt-footer { text-align: center; margin-top: 12px; font-size: 11px; }
  img { max-width: 90px; max-height: 70px; }
</style>
</head><body>${content}</body></html>`

    if (printerName && window.api?.printer) {
      const result = await window.api.printer.print(html, printerName, paperSize)
      if (!result.ok) {
        console.warn('[print] silent print failed, falling back to dialog:', result.error)
        openPrintDialog(html)
      }
    } else {
      openPrintDialog(html)
    }
  }

  function openPrintDialog(html) {
    const win = window.open('', '_blank', 'width=500,height=750')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  if (!data) return null

  const discountAmount = data.discountAmount ?? (
    data.discount?.type === 'percent'
      ? (data.items.reduce((s, i) => s + i.price * i.qty, 0)) * (data.discount.value / 100)
      : data.discount?.type === 'fixed' ? data.discount.value : 0
  )

  return (
    <Dialog open={!!data} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className={`${paper.dialogCls} p-0 gap-0 [&>button:last-child]:hidden`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-semibold">Recibo de venta</span>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimir
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Receipt content */}
        <div className="overflow-y-auto max-h-[80vh] bg-gray-100 flex justify-center" style={{ padding: paper.padding }}>
          <div
            ref={receiptRef}
            className="receipt bg-white shadow-sm"
            style={{ width: paper.previewWidth, fontSize: paper.fontSize, padding: paper.padding, fontFamily: "'Courier New', monospace" }}
          >
            {/* Header */}
            <div className="receipt-center mb-2">
              {business.logo && (
                <img src={business.logo} alt={business.name} className="mx-auto mb-1 h-12 object-contain" />
              )}
              <div className="receipt-bold receipt-lg">{business.name}</div>
              {business.nit     && <div className="receipt-sm">NIT: {business.nit}</div>}
              {business.address && <div className="receipt-sm">{business.address}</div>}
              {business.phone   && <div className="receipt-sm">Tel: {business.phone}</div>}
            </div>

            <div className="receipt-divider" />

            {/* Folio + fecha */}
            <div className="receipt-row">
              <span className="receipt-bold">RECIBO #{String(data.saleId).padStart(6, '0')}</span>
            </div>
            <div className="receipt-row receipt-sm">
              <span>{fmtDate(data.date)}</span>
            </div>
            <div className="receipt-row receipt-sm mt-0.5">
              <span>Cliente: {data.customerName}</span>
            </div>
            <div className="receipt-row receipt-sm">
              <span>NIT: {data.customerNit}</span>
            </div>
            <div className="receipt-row receipt-sm">
              <span>Pago: {PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod}</span>
            </div>

            <div className="receipt-divider" />

            {/* Items */}
            <div className="receipt-row-head">
              <span className="receipt-item-name">DESCRIPCIÓN</span>
              <span className="receipt-item-qty">QTY</span>
              <span className="receipt-item-price">P/U</span>
              <span className="receipt-item-sub">TOTAL</span>
            </div>
            {data.items.map((item, i) => (
              <div key={i} className="mb-0.5">
                <div className="receipt-row">
                  <span className="receipt-item-name" style={{ wordBreak: 'break-word' }}>{item.name}</span>
                  <span className="receipt-item-qty">{item.qty}</span>
                  <span className="receipt-item-price">{fmtMoney(item.price)}</span>
                  <span className="receipt-item-sub">{fmtMoney(item.price * item.qty)}</span>
                </div>
              </div>
            ))}

            <div className="receipt-divider" />

            {/* Totales */}
            {discountAmount > 0 && (
              <>
                <div className="receipt-total-row">
                  <span>Bruto:</span>
                  <span>{fmtMoney(data.items.reduce((s, i) => s + i.price * i.qty, 0))}</span>
                </div>
                <div className="receipt-total-row">
                  <span>Descuento{data.discount?.type === 'percent' ? ` (${data.discount.value}%)` : ''}:</span>
                  <span>-{fmtMoney(discountAmount)}</span>
                </div>
              </>
            )}
            <div className="receipt-total-row">
              <span>Subtotal:</span>
              <span>{fmtMoney(data.subtotal)}</span>
            </div>
            {taxEnabled && (
              <div className="receipt-total-row">
                <span>IVA ({Math.round(data.taxRate * 100)}%):</span>
                <span>{fmtMoney(data.taxAmount)}</span>
              </div>
            )}
            <div className="receipt-total-row receipt-grand">
              <span>TOTAL:</span>
              <span>{fmtMoney(data.total)}</span>
            </div>

            {/* Footer */}
            <div className="receipt-divider" />
            <div className="receipt-footer">
              <div className="receipt-bold">¡Gracias por su compra!</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
