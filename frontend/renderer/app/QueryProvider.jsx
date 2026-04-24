import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * staleTime/gcTime conservadores para una app local:
 * - La DB es local y rapidisima, pero recargar todo a cada foco seria ruido UI.
 * - refetchOnWindowFocus=false porque en Electron "enfocar ventana" pasa todo
 *   el tiempo y provoca flickers innecesarios.
 * - retry=1 porque IPC no falla por red; si falla dos veces, es un bug real.
 *
 * @param {{ children: React.ReactNode }} props
 */
export function QueryProvider({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
