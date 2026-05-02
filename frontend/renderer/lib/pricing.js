/**
 * Calculo de desglose de venta (subtotal / IVA / total / descuento).
 * Copia fiel de computeBreakdown en main/modules/sales/sales.service.js.
 *
 * @param {number} rawSum
 * @param {number} rate
 * @param {boolean} included
 * @param {number} [decimals=2]
 * @param {'none'|'percent'|'fixed'} [discountType]
 * @param {number} [discountValue]
 * @param {boolean} [taxEnabled=true] cuando false, taxAmount=0 y subtotal=total
 * @returns {{ subtotal: number, taxAmount: number, total: number, discountAmount: number }}
 */
export function computeBreakdown(rawSum, rate, included, decimals = 2, discountType = 'none', discountValue = 0, taxEnabled = true) {
  const factor = Math.pow(10, decimals)
  const round = (/** @type {number} */ n) => Math.round(n * factor) / factor

  let discountAmount = 0
  if (discountType === 'percent' && discountValue > 0) {
    discountAmount = round(rawSum * (discountValue / 100))
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = round(Math.min(discountValue, rawSum))
  }
  const discountedSum = round(Math.max(0, rawSum - discountAmount))

  if (!taxEnabled) {
    return { subtotal: discountedSum, taxAmount: 0, total: discountedSum, discountAmount }
  }

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
