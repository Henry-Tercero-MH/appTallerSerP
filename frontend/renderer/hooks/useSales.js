import { useQuery } from '@tanstack/react-query'
import * as salesService from '@/services/salesService.js'
import { saleKeys } from './queryKeys.js'

/**
 * Venta individual con sus items. Null si no existe (no error).
 *
 * @param {number | null | undefined} id
 */
export function useSale(id) {
  return useQuery({
    queryKey: id != null ? saleKeys.detail(id) : ['sales', 'detail', 'none'],
    queryFn: () => salesService.getById(/** @type {number} */ (id)),
    enabled: id != null,
    staleTime: 60_000,
  })
}

/**
 * Listado paginado para historial de ventas. staleTime moderado: una venta
 * recien creada debe aparecer pronto, pero no refetcheamos en cada focus.
 * useCreateSale invalida saleKeys.all, asi que tras una venta exitosa
 * este hook refetchea automaticamente.
 *
 * @param {{ page?: number, pageSize?: number }} [opts]
 */
export function useSales(opts = {}) {
  return useQuery({
    queryKey: saleKeys.list(opts),
    queryFn: () => salesService.list(opts),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}
