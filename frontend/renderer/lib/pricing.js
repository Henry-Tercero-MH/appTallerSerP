/**
 * Calculo de desglose de venta (subtotal / IVA / total / descuento).
 * Copia fiel de computeBreakdown en main/modules/sales/sales.service.js.
 *
 * @param {number} rawSum   sum(price * qty) del carrito
 * @param {number} rate     tax rate (ej. 0.12 = 12%)
 * @param {boolean} included true si los precios ya incluyen IVA
 * @param {number} [decimals=2]
 * @param {'none'|'percent'|'fixed'} [discountType]
 * @param {number} [discountValue]
 * @returns {{ subtotal: number, taxAmount: number, total: number, discountAmount: number }}
 */
export function computeBreakdown(rawSum, rate, included, decimals = 2, discountType = 'none', discountValue = 0) {
  const factor = Math.pow(10, decimals)
  const round = (/** @type {number} */ n) => Math.round(n * factor) / factor

  let discountAmount = 0
  if (discountType === 'percent' && discountValue > 0) {
    discountAmount = round(rawSum * (discountValue / 100))
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = round(Math.min(discountValue, rawSum))
  }
  const discountedSum = round(Math.max(0, rawSum - discountAmount))

  if (included) {
    const total = round(discountedSum)
    const taxAmount = round(total - total / (1 + rate))
    const subtotal = round(total - taxAmount)
    return { subtotal, taxAmount, total, discountAmount }
  }
  const subtotal = round(discountedSum)
  const taxAmount = round(subtotal * rate)
  const total = round(subtotal + taxAmount)
  return { subtotal, taxAmount, total, discountAmount }
}
