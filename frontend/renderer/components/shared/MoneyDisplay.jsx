import { useCurrencySettings } from '@/hooks/useSettings'

/**
 * Formatea montos respetando currency_code/symbol/decimal_places de settings.
 * Usa Intl.NumberFormat (no concatenacion manual) para que:
 *  - GTQ salga con separador de miles correcto (es-GT: "Q1,250.50")
 *  - el simbolo se coloque segun convencion local
 *
 * IMPORTANTE: `amount` viene en unidades de moneda (ej. 45.00 = Q45.00),
 * alineado con la columna REAL del backend actual. Cuando el backend
 * migre a integer cents, cambiar a `amount / 100` aqui (en UN solo sitio).
 *
 * @param {{ amount: number, className?: string }} props
 */
export function MoneyDisplay({ amount, className }) {
  const { code, decimals } = useCurrencySettings()

  const formatter = new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return <span className={className}>{formatter.format(amount)}</span>
}
