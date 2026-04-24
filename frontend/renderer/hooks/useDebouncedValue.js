import { useEffect, useState } from 'react'

/**
 * Devuelve `value` retrasado `delay` ms. Util para busquedas en vivo
 * sin pegarle a la DB por cada tecla.
 *
 * @template T
 * @param {T} value
 * @param {number} delay
 * @returns {T}
 */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(handle)
  }, [value, delay])

  return debounced
}
