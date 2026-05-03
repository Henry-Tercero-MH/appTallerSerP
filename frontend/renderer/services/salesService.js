import { z } from 'zod'
import {
  saleCreatedSchema,
  saleInputSchema,
  saleListSchema,
  saleWithItemsSchema,
} from '@/schemas/sale.schema.js'
import { voidSaleInputSchema, voidSaleResultSchema } from '@/schemas/audit.schema.js'
import { unwrap } from './ipc.js'

export const dailyReportSchema = z.object({
  summary: z.object({
    sale_count:    z.number(),
    subtotal:      z.number(),
    tax_amount:    z.number(),
    total:         z.number(),
    cash_total:    z.number().default(0),
    currency_code: z.string(),
  }).nullable(),
  topProducts: z.array(z.object({
    id:         z.number(),
    code:       z.string().nullable(),
    name:       z.string().nullable(),
    units_sold: z.number(),
    revenue:    z.number(),
  })),
})

/** @typedef {import('zod').infer<typeof dailyReportSchema>} DailyReport */

/**
 * @param {import('@/schemas/sale.schema.js').SaleInput} saleInput
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleCreated>}
 */
export async function create(saleInput) {
  const safe = saleInputSchema.parse(saleInput)
  const res = await window.api.sales.create(safe)
  return unwrap('sales:create', res, saleCreatedSchema)
}

/**
 * @param {number} id
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleWithItems | null>}
 */
export async function getById(id) {
  const res = await window.api.sales.getById(id)
  return unwrap('sales:get-by-id', res, saleWithItemsSchema.nullable())
}

/**
 * @param {{ page?: number, pageSize?: number }} [opts]
 * @returns {Promise<import('@/schemas/sale.schema.js').SaleList>}
 */
export async function list(opts = {}) {
  const res = await window.api.sales.list(opts)
  return unwrap('sales:list', res, saleListSchema)
}

/** @returns {Promise<DailyReport>} */
export async function dailyReport() {
  const res = await window.api.sales.dailyReport()
  return unwrap('sales:daily-report', res, dailyReportSchema)
}

/**
 * @param {import('@/schemas/audit.schema.js').z.infer<typeof voidSaleInputSchema>} input
 */
export async function voidSale(input) {
  const safe = voidSaleInputSchema.parse(input)
  const res  = await window.api.sales.void(safe)
  return unwrap('sales:void', res, voidSaleResultSchema)
}

export const rangeReportSchema = z.object({
  series: z.array(z.object({
    day:        z.string(),
    sale_count: z.number(),
    subtotal:   z.number(),
    total:      z.number(),
  })),
  topProducts: z.array(z.object({
    id:         z.number(),
    code:       z.string().nullable(),
    name:       z.string().nullable(),
    units_sold: z.number(),
    revenue:    z.number(),
  })),
  byHour: z.array(z.object({
    hour:       z.number(),
    sale_count: z.number(),
    total:      z.number(),
  })),
  byWeekday: z.array(z.object({
    weekday:    z.number(),
    sale_count: z.number(),
    total:      z.number(),
  })),
  byPaymentMethod: z.array(z.object({
    method:     z.string(),
    sale_count: z.number(),
    total:      z.number(),
  })),
})

/** @typedef {import('zod').infer<typeof rangeReportSchema>} RangeReport */

/**
 * @param {{ from: string, to: string }} range  Formato YYYY-MM-DD
 * @returns {Promise<RangeReport>}
 */
export async function rangeReport(range) {
  const res = await window.api.sales.rangeReport(range)
  return unwrap('sales:range-report', res, rangeReportSchema)
}
