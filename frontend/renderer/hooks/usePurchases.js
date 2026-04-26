import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as svc from '@/services/purchasesService.js'

export const purchaseKeys = {
  all:       ['purchases'],
  orders:    ['purchases', 'orders'],
  order: (id) => ['purchases', 'order', id],
  suppliers: ['purchases', 'suppliers'],
}

export function useSuppliers() {
  return useQuery({ queryKey: purchaseKeys.suppliers, queryFn: svc.listSuppliers, staleTime: 60_000 })
}

export function usePurchaseOrders() {
  return useQuery({ queryKey: purchaseKeys.orders, queryFn: svc.listOrders, staleTime: 30_000 })
}

export function usePurchaseOrder(id) {
  return useQuery({
    queryKey: purchaseKeys.order(id),
    queryFn:  () => svc.getOrder(id),
    enabled:  !!id,
  })
}

export function useCreateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: /** @param {{ input: any, role: string }} v */ (v) => svc.createSupplier(v.input, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.suppliers }),
  })
}

export function useUpdateSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: /** @param {{ id: number, input: any, role: string }} v */ (v) => svc.updateSupplier(v.id, v.input, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.suppliers }),
  })
}

export function useSetSupplierActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: /** @param {{ id: number, active: boolean, role: string }} v */ (v) => svc.setSupplierActive(v.id, v.active, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.suppliers }),
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.createOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.orders }),
  })
}

export function useMarkSent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: /** @param {{ id: number, role: string }} v */ (v) => svc.markSent(v.id, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  })
}

export function useReceiveOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.receiveOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  })
}

export function useCancelOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: /** @param {{ id: number, role: string }} v */ (v) => svc.cancelOrder(v.id, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: purchaseKeys.all }),
  })
}
