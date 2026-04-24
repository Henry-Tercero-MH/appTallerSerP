/**
 * Tipos para window.api (contextBridge). No migra el proyecto a TS:
 * con checkJs: true en jsconfig, estos .d.ts dan autocompletado e
 * inferencia en .js/.jsx sin tocar el runtime.
 *
 * Formato de respuesta unificado acordado con el main:
 *   exito:  { ok: true, data }
 *   error:  { ok: false, error: { code, message } }
 */

export {}

export type IpcOk<T> = { ok: true; data: T }
export type IpcErr   = { ok: false; error: { code: string; message: string } }
export type IpcResponse<T> = IpcOk<T> | IpcErr

export interface ProductRow {
  id: number
  code: string
  name: string
  price: number
  stock: number
}

export interface CustomerRow {
  id: number
  nit: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  active: number
  created_at: string
  updated_at: string
}

export interface CustomerCreateInput {
  nit?: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
}

export interface CustomerListOptions {
  includeInactive?: boolean
}

export interface CustomerUpdateInput {
  nit?: string
  name?: string
  email?: string | null
  phone?: string | null
  address?: string | null
  active?: boolean
}

export interface SaleItemInput {
  id: number
  qty: number
  price: number
}

export interface SaleInput {
  items: SaleItemInput[]
  customerId?: number
}

export interface SaleCreatedResult {
  saleId: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currencyCode: string
  customerId: number
  customerName: string
  customerNit: string
}

export interface SaleRow {
  id: number
  subtotal: number
  tax_rate_applied: number
  tax_amount: number
  total: number
  currency_code: string
  date: string
  customer_id: number | null
  customer_name_snapshot: string | null
  customer_nit_snapshot: string | null
}

export interface SaleItemRow {
  id: number
  sale_id: number
  product_id: number
  qty: number
  price: number
  product_code: string | null
  product_name: string | null
}

export type SaleWithItems = SaleRow & { items: SaleItemRow[] }

export interface SaleListOptions {
  page?: number
  pageSize?: number
}

export interface SaleListResult {
  data: SaleRow[]
  total: number
  page: number
  pageSize: number
}

export type SettingValue = string | number | boolean | object | null
export type SettingsByCategory = Record<string, Record<string, SettingValue>>

export interface RendererApi {
  settings: {
    getAll():                                   Promise<IpcResponse<SettingsByCategory>>
    get(key: string):                           Promise<IpcResponse<SettingValue>>
    set(key: string, value: SettingValue):      Promise<IpcResponse<true>>
    getByCategory(category: string):            Promise<IpcResponse<Record<string, SettingValue>>>
  }
  products: {
    list():                                     Promise<IpcResponse<ProductRow[]>>
    search(query: string):                      Promise<IpcResponse<ProductRow[]>>
    getById(id: number):                        Promise<IpcResponse<ProductRow | null>>
  }
  customers: {
    list(opts?: CustomerListOptions):           Promise<IpcResponse<CustomerRow[]>>
    search(query: string, opts?: CustomerListOptions): Promise<IpcResponse<CustomerRow[]>>
    getById(id: number):                        Promise<IpcResponse<CustomerRow | null>>
    create(input: CustomerCreateInput):         Promise<IpcResponse<CustomerRow>>
    update(id: number, patch: CustomerUpdateInput): Promise<IpcResponse<CustomerRow>>
    setActive(id: number, active: boolean):     Promise<IpcResponse<true>>
  }
  sales: {
    create(saleData: SaleInput):                Promise<IpcResponse<SaleCreatedResult>>
    getById(id: number):                        Promise<IpcResponse<SaleWithItems | null>>
    list(opts?: SaleListOptions):               Promise<IpcResponse<SaleListResult>>
  }
}

declare global {
  interface Window {
    api: RendererApi
  }
}
