/**
 * Capa de negocio de ventas.
 *
 * RESPONSABILIDAD DE SEGURIDAD:
 *   Este service IGNORA cualquier `total` enviado por el renderer y lo
 *   recalcula siempre desde `items[].price * qty` + tax_rate snapshotado.
 *   Confiar en el total del cliente permitiria fraude trivial via DevTools.
 *
 * SNAPSHOT:
 *   tax_rate, tax_included_in_price y currency_code se leen del
 *   SettingsService al momento de crear la venta y se persisten en la fila.
 *   Lecturas historicas NUNCA deben recomputar contra settings actuales.
 *
 * Logica de calculo IDENTICA a renderer/lib/pricing.js computeBreakdown.
 * Si se modifica aqui, modificar alla. Existen dos copias a proposito:
 *   - la fuente de verdad es esta (server).
 *   - el renderer la reproduce solo para preview antes de enviar.
 */

/**
 * @typedef {Object} SaleInput
 * @property {Array<{id:number, qty:number, price:number}>} items
 */

/**
 * @typedef {Object} SaleCreatedResult
 * @property {number} saleId
 * @property {number} subtotal
 * @property {number} taxRate
 * @property {number} taxAmount
 * @property {number} total
 * @property {string} currencyCode
 */

/**
 * @param {SaleInput} input
 */
function assertValidInput(input) {
  if (!input || !Array.isArray(input.items) || input.items.length === 0) {
    throw Object.assign(new Error('La venta debe contener al menos un item'), {
      code: 'SALE_EMPTY',
    })
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.id) || item.id <= 0) {
      throw Object.assign(new Error(`product_id invalido: ${item.id}`), {
        code: 'SALE_INVALID_ITEM',
      })
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw Object.assign(new Error(`qty invalida para producto ${item.id}`), {
        code: 'SALE_INVALID_ITEM',
      })
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      throw Object.assign(new Error(`price invalido para producto ${item.id}`), {
        code: 'SALE_INVALID_ITEM',
      })
    }
  }
}

/**
 * @param {number} rawSum
 * @param {number} rate
 * @param {boolean} included
 * @param {number} decimals
 * @returns {{ subtotal: number, taxAmount: number, total: number }}
 */
function computeBreakdown(rawSum, rate, included, decimals) {
  const factor = Math.pow(10, decimals)
  const round = (n) => Math.round(n * factor) / factor
  if (included) {
    // rawSum = total bruto (precios con IVA incluido)
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

/**
 * @param {ReturnType<typeof import('./sales.repository.js').createSalesRepository>} repo
 * @param {ReturnType<typeof import('../settings/settings.service.js').createSettingsService>} settings
 */
export function createSalesService(repo, settings) {
  return {
    /**
     * @param {SaleInput} input
     * @returns {SaleCreatedResult}
     */
    create(input) {
      assertValidInput(input)

      const taxRate     = /** @type {number} */ (settings.get('tax_rate'))
      const taxIncluded = /** @type {boolean} */ (settings.get('tax_included_in_price'))
      const currency    = /** @type {string} */ (settings.get('currency_code'))
      const decimals    = /** @type {number} */ (settings.get('decimal_places'))

      const rawSum = input.items.reduce((acc, i) => acc + i.price * i.qty, 0)
      const { subtotal, taxAmount, total } = computeBreakdown(
        rawSum,
        taxRate,
        taxIncluded,
        decimals
      )

      const saleId = repo.insertSale({
        items: input.items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        currencyCode: currency,
      })

      return {
        // BigInt no sobrevive structuredClone de Electron en algunas versiones.
        saleId: typeof saleId === 'bigint' ? Number(saleId) : saleId,
        subtotal,
        taxRate,
        taxAmount,
        total,
        currencyCode: currency,
      }
    },
  }
}
