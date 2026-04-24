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
  const tax = /** @type {{ tax_rate?: number, tax_included_in_price?: boolean } | undefined} */ (data?.tax)
  return {
    rate:     typeof tax?.tax_rate === 'number' ? tax.tax_rate : 0.12,
    included: typeof tax?.tax_included_in_price === 'boolean' ? tax.tax_included_in_price : false,
  }
}
