/**
 * Calculo de desglose de venta (subtotal / IVA / total). Copia fiel de
 * computeBreakdown en main/modules/sales/sales.service.js.
 *
 * La fuente de verdad es el main: este helper existe solo para mostrar
 * preview al operador antes de confirmar la venta. Si el algoritmo cambia
 * de un lado, debe cambiar del otro. No hay build step que comparta codigo
 * entre main y renderer.
 *
 * @param {number} rawSum   sum(price * qty) del carrito
 * @param {number} rate     tax rate (ej. 0.12 = 12%)
 * @param {boolean} included true si los precios ya incluyen IVA
 * @param {number} [decimals=2]
 * @returns {{ subtotal: number, taxAmount: number, total: number }}
 */
export function computeBreakdown(rawSum, rate, included, decimals = 2) {
  const factor = Math.pow(10, decimals)
  const round = (/** @type {number} */ n) => Math.round(n * factor) / factor
  if (included) {
    const total = round(rawSum)
    const taxAmount = round(total - total / (1 + rate))
    const subtotal = round(total - taxAmount)
    return { subtotal, taxAmount, total }
  }
  const subtotal = round(rawSum)
  const taxAmount = round(subtotal * rate)
  const total = round(subtotal + taxAmount)
  return { subtotal, taxAmount, total }
}
