import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as cashService from '@/services/cashService.js'

export const cashKeys = {
  all:        ['cash'],
  open:       ['cash', 'open'],
  list:       ['cash', 'list'],
  session: (id) => ['cash', 'session', id],
}

/** Sesión de caja actualmente abierta (null si no hay) */
export function useOpenSession() {
  return useQuery({
    queryKey: cashKeys.open,
    queryFn:  cashService.getOpenSession,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })
}

/** Historial de todas las sesiones */
export function useCashSessions() {
  return useQuery({
    queryKey: cashKeys.list,
    queryFn:  cashService.listSessions,
    staleTime: 60_000,
  })
}

/** Detalle de una sesión (movimientos + total ventas) */
export function useCashSession(id) {
  return useQuery({
    queryKey: cashKeys.session(id),
    queryFn:  () => cashService.getSession(id),
    enabled:  !!id,
  })
}

/** Abrir caja */
export function useOpenCash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cashService.openSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: cashKeys.all }),
  })
}

/** Cerrar caja */
export function useCloseCash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cashService.closeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: cashKeys.all }),
  })
}

/** Agregar movimiento manual */
export function useAddMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cashService.addMovement,
    onSuccess: () => qc.invalidateQueries({ queryKey: cashKeys.all }),
  })
}
