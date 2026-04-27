import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as svc from '@/services/returnsService.js'
import { productKeys } from './queryKeys.js'

const returnKeys = {
  all:    ['returns'],
  bySale: (id) => ['returns', 'sale', id],
}

export function useReturns() {
  return useQuery({ queryKey: returnKeys.all, queryFn: svc.listReturns })
}
export function useReturnsBySale(saleId) {
  return useQuery({
    queryKey: returnKeys.bySale(saleId),
    queryFn:  () => svc.listReturnsBySale(saleId),
    enabled:  !!saleId,
  })
}
export function useCreateReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.createReturn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: returnKeys.all })
      qc.invalidateQueries({ queryKey: productKeys.lists })
      qc.invalidateQueries({ queryKey: ['inventory', 'stock'] })
      toast.success('Devolución registrada — stock restaurado')
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Error'),
  })
}
