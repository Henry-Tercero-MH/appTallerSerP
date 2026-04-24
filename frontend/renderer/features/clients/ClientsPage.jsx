import { useMemo, useState } from 'react'
import { Pencil, Plus, Power, PowerOff, Search, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { DataTable } from '@/components/shared/DataTable'

import {
  useSearchCustomers,
  useToggleCustomerActive,
} from '@/hooks/useCustomers'

import { CustomerFormDialog } from './CustomerFormDialog'

const PROTECTED_ID = 1 // Consumidor Final — sistema, no editable ni desactivable

/**
 * Directorio de clientes. Lista+search paginados en memoria (el dataset de
 * customers cabe sobrado en cualquier instalacion razonable). Si un dia
 * pasa de ~10k clientes, reemplazar por `useSales`-style paginacion server.
 */
export default function ClientsPage() {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(/** @type {import('@/schemas/customer.schema').Customer | null} */ (null))
  const [creating, setCreating] = useState(false)

  // Admin-view: incluye inactivos para poder reactivarlos.
  const { data: customers = [], isLoading, isError, error, refetch } =
    useSearchCustomers(query, { includeInactive: true })

  const toggleActive = useToggleCustomerActive()

  /** @type {import('@tanstack/react-table').ColumnDef<import('@/schemas/customer.schema').Customer, any>[]} */
  const columns = useMemo(() => [
    {
      id: 'name',
      header: 'Cliente',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            {row.original.id === PROTECTED_ID && (
              <Badge variant="secondary" className="mt-0.5">Sistema</Badge>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'nit',
      header: 'NIT',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.nit}</span>,
    },
    {
      id: 'contact',
      header: 'Contacto',
      cell: ({ row }) => (
        <div className="flex flex-col text-sm text-muted-foreground">
          {row.original.email && <span className="truncate">{row.original.email}</span>}
          {row.original.phone && <span>{row.original.phone}</span>}
          {!row.original.email && !row.original.phone && (
            <span className="italic">Sin datos</span>
          )}
        </div>
      ),
    },
    {
      id: 'active',
      header: 'Estado',
      cell: ({ row }) =>
        row.original.active === 1 ? (
          <Badge variant="success">Activo</Badge>
        ) : (
          <Badge variant="outline">Inactivo</Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const c = row.original
        const isProtected = c.id === PROTECTED_ID
        return (
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(c)}
              disabled={isProtected}
              title={isProtected ? 'Cliente del sistema' : 'Editar'}
            >
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
            </Button>
            {c.active === 1 ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleActive.mutate({ id: c.id, active: false })}
                disabled={isProtected || toggleActive.isPending}
                title={isProtected ? 'Cliente del sistema' : 'Desactivar'}
                className="text-destructive hover:bg-destructive/10"
              >
                <PowerOff className="mr-1 h-3.5 w-3.5" /> Desactivar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleActive.mutate({ id: c.id, active: true })}
                disabled={toggleActive.isPending}
                title="Reactivar"
              >
                <Power className="mr-1 h-3.5 w-3.5" /> Activar
              </Button>
            )}
          </div>
        )
      },
    },
  ], [toggleActive])

  return (
    <div className="p-6">
      <PageHeader
        title="Clientes"
        subtitle="Directorio de clientes para facturacion y ordenes de trabajo"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nuevo cliente
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar por nombre o NIT..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && <LoadingSpinner label="Cargando clientes..." className="justify-center py-10" />}

          {isError && (
            <EmptyState
              title="No se pudo cargar el directorio"
              description={error instanceof Error ? error.message : 'Error desconocido'}
              action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
            />
          )}

          {!isLoading && !isError && (
            <DataTable
              columns={columns}
              data={customers}
              emptyMessage={query ? 'Sin coincidencias.' : 'No hay clientes todavia.'}
            />
          )}
        </CardContent>
      </Card>

      <CustomerFormDialog
        open={creating}
        onOpenChange={setCreating}
      />

      <CustomerFormDialog
        open={editing != null}
        onOpenChange={(open) => { if (!open) setEditing(null) }}
        initial={editing}
      />
    </div>
  )
}
