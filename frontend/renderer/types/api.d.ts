/**
 * Tipos para window.api (contextBridge). No migra el proyecto a TS:
 * con checkJs: true en jsconfig, estos .d.ts dan autocompletado e
 * inferencia en .js/.jsx sin tocar el runtime.
 *
 * Formato de respuesta unificado acordado con el main (Prompt 1):
 *   exito:  { ok: true, data }
 *   error:  { ok: false, error: { code, message } }
 *
 * Los services del renderer unwrappean esto antes de exponer datos.
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

export interface SaleItemInput {
  id: number    // product_id (rename pendiente cuando createSale se rediseñe)
  qty: number
  price: number
}

export interface SaleInput {
  items: SaleItemInput[]
}

export interface SaleCreatedResult {
  saleId: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  currencyCode: string
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
  }
  sales: {
    create(saleData: SaleInput):                Promise<IpcResponse<SaleCreatedResult>>
  }
}

declare global {
  interface Window {
    api: RendererApi
  }
}
