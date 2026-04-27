import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as svc from '@/services/receivablesService.js'

export const receivableKeys = {
  all:     ['receivables'],
  list:    ['receivables', 'list'],
  detail:  (id) => ['receivables', 'detail', id],
  summary: ['receivables', 'summary'],
}

export function useReceivables() {
  return useQuery({ queryKey: receivableKeys.list, queryFn: svc.listReceivables, staleTime: 30_000 })
}

export function useReceivable(id) {
  return useQuery({
    queryKey: receivableKeys.detail(id),
    queryFn:  () => svc.getReceivable(id),
    enabled:  !!id,
  })
}

export function useReceivablesSummary() {
  return useQuery({ queryKey: receivableKeys.summary, queryFn: svc.getSummary, staleTime: 30_000 })
}

export function useCreateReceivable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.createReceivable,
    onSuccess: () => qc.invalidateQueries({ queryKey: receivableKeys.all }),
  })
}

export function useApplyPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.applyPayment,
    onSuccess: () => qc.invalidateQueries({ queryKey: receivableKeys.all }),
  })
}

export function useCancelReceivable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: svc.cancelReceivable,
    onSuccess: () => qc.invalidateQueries({ queryKey: receivableKeys.all }),
  })
}
