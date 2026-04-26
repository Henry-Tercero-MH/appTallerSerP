import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as productsService from '@/services/productsService.js'
import { productKeys } from '@/hooks/queryKeys.js'

// ── Consultas ──────────────────────────────────────────────────────────────

/** Todos los productos (activos + inactivos) para la vista de admin. */
export function useInventoryProducts() {
  return useQuery({
    queryKey: [...productKeys.lists, { all: true }],
    queryFn:  productsService.getAll,
    staleTime: 30_000,
  })
}

// ── Mutaciones ─────────────────────────────────────────────────────────────

function invalidateProducts(qc) {
  qc.invalidateQueries({ queryKey: productKeys.all })
}

export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input) => productsService.create(input),
    onSuccess: () => {
      invalidateProducts(qc)
      toast.success('Producto agregado al inventario')
    },
    onError: (err) => toast.error('No se pudo crear el producto', {
      description: err instanceof Error ? err.message : 'Error desconocido',
    }),
  })
}

export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => productsService.update(id, patch),
    onSuccess: () => {
      invalidateProducts(qc)
      toast.success('Producto actualizado correctamente')
    },
    onError: (err) => toast.error('No se pudo actualizar el producto', {
      description: err instanceof Error ? err.message : 'Error desconocido',
    }),
  })
}

export function useRemoveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => productsService.remove(id),
    onSuccess: () => {
      invalidateProducts(qc)
      toast.warning('Producto desactivado')
    },
    onError: (err) => toast.error('No se pudo desactivar el producto', {
      description: err instanceof Error ? err.message : 'Error desconocido',
    }),
  })
}

export function useRestoreProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => productsService.restore(id),
    onSuccess: () => {
      invalidateProducts(qc)
      toast.success('Producto reactivado')
    },
    onError: (err) => toast.error('No se pudo reactivar el producto', {
      description: err instanceof Error ? err.message : 'Error desconocido',
    }),
  })
}

export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, type, qty }) => productsService.adjustStock(id, type, qty),
    onSuccess: (_, { type }) => {
      invalidateProducts(qc)
      toast.success(
        type === 'entry' ? 'Entrada de stock registrada' : 'Salida de stock registrada'
      )
    },
    onError: (err) => toast.error('No se pudo registrar el movimiento', {
      description: err instanceof Error ? err.message : 'Error desconocido',
    }),
  })
}
