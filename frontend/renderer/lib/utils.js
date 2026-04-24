import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Helper estandar de shadcn: concatena clases condicionalmente y deduplica
 * conflictos Tailwind (ej. `p-2 p-4` -> `p-4`).
 *
 * @param {...import('clsx').ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
