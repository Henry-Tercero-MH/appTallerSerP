/**
 * Capa de negocio de ventas.
 *
 * SEGURIDAD:
 *   Este service IGNORA cualquier `total` enviado por el renderer y lo
 *   recalcula siempre desde `items[].price * qty` + tax_rate snapshotado.
 *
 * SNAPSHOT:
 *   tax_rate/tax_included_in_price/currency_code se leen de settings y se
 *   persisten en la fila. customer_name/nit se leen de customers y se
 *   persisten en columnas snapshot. Lecturas historicas NUNCA recomputan.
 *
 * Logica de calculo IDENTICA a renderer/lib/pricing.js computeBreakdown.
 * Si se modifica aqui, modificar alla.
 */

/**
 * @typedef {Object} SaleInput
 * @property {Array<{id:number, qty:number, price:number}>} items
 * @property {number} [customerId]
 * @property {string} [paymentMethod]
 * @property {string} [clientType]
 */

/**
 * @typedef {Object} SaleCreatedResult
 * @property {number} saleId
 * @property {number} subtotal
 * @property {number} taxRate
 * @property {number} taxAmount
 * @property {number} total
 * @property {string} currencyCode
 * @property {number} customerId
 * @property {string} customerName
 * @property {string} customerNit
 */

/**
 * @typedef {import('./sales.repository.js').SaleRow & {
 *   items: import('./sales.repository.js').SaleItemRow[]
 * }} SaleWithItems
 */

/**
 * @typedef {Object} SaleListResult
 * @property {import('./sales.repository.js').SaleRow[]} data
 * @property {number} total
 * @property {number} page
 * @property {number} pageSize
 */

const MAX_PAGE_SIZE = 200
const DEFAULT_CUSTOMER_ID = 1 // Consumidor Final, sembrado en migracion 004

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
  if (input.customerId !== undefined) {
    if (!Number.isInteger(input.customerId) || input.customerId <= 0) {
      throw Object.assign(new Error(`customer_id invalido: ${input.customerId}`), {
        code: 'SALE_INVALID_CUSTOMER',
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
 * @param {ReturnType<typeof import('../customers/customers.service.js').createCustomersService>} customers
 * @param {ReturnType<typeof import('../audit/audit.service.js').createAuditService>} [audit]
 */
export function createSalesService(repo, settings, customers, audit) {
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

      // Snapshot del cliente. requireById lanza CustomerNotFoundError si el
      // id no existe — protege contra un renderer que envia un id invalido.
      const customerId = input.customerId ?? DEFAULT_CUSTOMER_ID
      const customer = customers.requireById(customerId)

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
        customerId,
        customerNameSnapshot: customer.name,
        customerNitSnapshot: customer.nit,
        paymentMethod: input.paymentMethod ?? 'cash',
        clientType:    input.clientType    ?? 'cf',
      })

      return {
        saleId: typeof saleId === 'bigint' ? Number(saleId) : saleId,
        subtotal,
        taxRate,
        taxAmount,
        total,
        currencyCode: currency,
        customerId,
        customerName: customer.name,
        customerNit: customer.nit,
      }
    },

    /**
     * @param {number} id
     * @returns {SaleWithItems | null}
     */
    getById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw Object.assign(new Error(`sale id invalido: ${id}`), { code: 'SALE_INVALID_ID' })
      }
      const sale = repo.findSaleById(id)
      if (!sale) return null
      const items = repo.findSaleItems(id)
      return { ...sale, items }
    },

    /**
     * @param {{ page?: number, pageSize?: number }} [opts]
     * @returns {SaleListResult}
     */
    list(opts = {}) {
      const page = Number.isInteger(opts.page) && /** @type {number} */ (opts.page) > 0 ? /** @type {number} */ (opts.page) : 1
      const requested = Number.isInteger(opts.pageSize) && /** @type {number} */ (opts.pageSize) > 0 ? /** @type {number} */ (opts.pageSize) : 50
      const pageSize = Math.min(requested, MAX_PAGE_SIZE)
      const offset = (page - 1) * pageSize

      return {
        data: repo.findPage({ limit: pageSize, offset }),
        total: repo.countAll(),
        page,
        pageSize,
      }
    },

    /**
     * Anula una venta, restaura stock y registra en bitácora.
     * @param {{ saleId: number, reason: string, userId?: number, userName?: string }} input
     */
    voidSale(input) {
      if (!Number.isInteger(input.saleId) || input.saleId <= 0) {
        throw Object.assign(new Error(`sale id invalido: ${input.saleId}`), { code: 'SALE_INVALID_ID' })
      }
      if (!input.reason || input.reason.trim().length < 5) {
        throw Object.assign(new Error('El motivo debe tener al menos 5 caracteres'), { code: 'VOID_REASON_REQUIRED' })
      }

      const sale = repo.findSaleById(input.saleId)
      if (!sale) {
        throw Object.assign(new Error(`Venta ${input.saleId} no encontrada`), { code: 'SALE_NOT_FOUND' })
      }
      if (sale.status === 'voided') {
        throw Object.assign(new Error(`La venta ${input.saleId} ya está anulada`), { code: 'SALE_ALREADY_VOIDED' })
      }

      const items = repo.findSaleItems(input.saleId)
      const voided = repo.voidSale(
        { saleId: input.saleId, reason: input.reason.trim(), userId: input.userId },
        items
      )

      if (voided) {
        audit?.log({
          action: 'sale_voided',
          entity: 'sale',
          entityId: input.saleId,
          description: `Venta #${input.saleId} anulada. Motivo: ${input.reason.trim()}`,
          payload: { total: sale.total, customer: sale.customer_name_snapshot, reason: input.reason.trim() },
          userId: input.userId,
          userName: input.userName,
        })
      }

      return { voided, saleId: input.saleId }
    },

    /** Reporte del día: totales + top 5 productos. */
    dailyReport() {
      return {
        summary:     repo.getDailySummary(),
        topProducts: repo.getTopProducts(),
      }
    },
  }
}
