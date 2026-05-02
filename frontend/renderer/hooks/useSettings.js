import { useQuery } from '@tanstack/react-query'
import * as settingsService from '@/services/settingsService.js'
import { settingsKeys } from './queryKeys.js'

/**
 * Settings agrupados por category. staleTime muy largo: los settings casi
 * no cambian en caliente y el SettingsService del main ya cachea. Al mutar
 * un setting con settings:set, el que lo muto debe invalidar `settingsKeys.all`
 * explicitamente (hoy no hay mutation hook porque no hay UI de settings).
 */
export function useSettings() {
  return useQuery({
    queryKey: settingsKeys.all,
    queryFn: settingsService.getAll,
    staleTime: 10 * 60_000,
  })
}

/**
 * Helpers de acceso tipados a settings que la UI consume con frecuencia.
 * Hacer esto en un hook evita que cada componente cree su propio parsing.
 */
export function useCurrencySettings() {
  const { data } = useSettings()
  const currency = /** @type {{ currency_code?: string, currency_symbol?: string, decimal_places?: number } | undefined} */ (data?.currency)
  return {
    code:     typeof currency?.currency_code === 'string' ? currency.currency_code : 'GTQ',
    symbol:   typeof currency?.currency_symbol === 'string' ? currency.currency_symbol : 'Q',
    decimals: typeof currency?.decimal_places === 'number' ? currency.decimal_places : 2,
  }
}

export function useTaxSettings() {
  const { data } = useSettings()
  const tax = /** @type {{ tax_rate?: number, tax_included_in_price?: boolean, tax_enabled?: boolean } | undefined} */ (data?.tax)
  return {
    enabled:  typeof tax?.tax_enabled === 'boolean' ? tax.tax_enabled : false,
    rate:     typeof tax?.tax_rate === 'number' ? tax.tax_rate : 0.12,
    included: typeof tax?.tax_included_in_price === 'boolean' ? tax.tax_included_in_price : false,
  }
}

export function useBusinessSettings() {
  const { data } = useSettings()
  const b   = /** @type {Record<string,unknown>|undefined} */ (data?.business)
  const app = /** @type {Record<string,unknown>|undefined} */ (data?.app)
  return {
    name:        typeof app?.app_name         === 'string' && app.app_name         ? app.app_name         : (typeof b?.business_name === 'string' && b.business_name ? b.business_name : 'SerProMec'),
    logo:        typeof b?.business_logo_base64 === 'string' ? b.business_logo_base64 : '',
    nit:         typeof b?.business_nit      === 'string' ? b.business_nit      : '',
    address:     typeof b?.business_address  === 'string' ? b.business_address  : '',
    phone:       typeof b?.business_phone    === 'string' ? b.business_phone    : '',
    email:       typeof b?.business_email    === 'string' ? b.business_email    : '',
    city:        typeof b?.business_city     === 'string' ? b.business_city     : '',
    country:     typeof b?.business_country  === 'string' ? b.business_country  : '',
  }
}

export function usePrinterSettings() {
  const { data } = useSettings()
  const ticket = /** @type {Record<string, unknown> | undefined} */ (data?.ticket)
  return {
    printerName: typeof ticket?.receipt_printer    === 'string' ? ticket.receipt_printer    : '',
    paperSize:   typeof ticket?.receipt_paper_size === 'string' ? ticket.receipt_paper_size : 'half-letter',
  }
}
