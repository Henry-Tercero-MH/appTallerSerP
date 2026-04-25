import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'
import { DataTable } from '@/components/shared/DataTable'

import { useSales } from '@/hooks/useSales'
import { SaleDetailDialog } from './SaleDetailDialog'

const PAGE_SIZE = 20

const dateFmt = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Historial paginado de ventas. Pagina via opciones del hook (server-side
 * en main, no en memoria). Click en fila abre el SaleDetailDialog que
 * carga la venta completa con items via useSale.
 */
export default function SalesHistoryPage() {
  const [page, setPage] = useState(1)
  const [openSaleId, setOpenSaleId] = useState(/** @type {number | null} */ (null))

  const { data, isLoading, isError, error, refetch, isFetching } = useSales({
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const canPrev = page > 1
  const canNext = data ? page < totalPages : false

  /** @type {import('@tanstack/react-table').ColumnDef<import('@/schemas/sale.schema').Sale, any>[]} */
  const columns = useMemo(() => [
    {
      id: 'folio',
      header: 'Folio',
      cell: ({ row }) => (
        <Badge variant="outline" className="font-mono">#{row.original.id}</Badge>
      ),
    },
    {
      id: 'date',
      header: 'Fecha',
      cell: ({ row }) => (
        <span className="text-sm">
          {dateFmt.format(new Date(row.original.date.replace(' ', 'T')))}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Cliente',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {row.original.customer_name_snapshot ?? 'Consumidor Final'}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {row.original.customer_nit_snapshot ?? 'C/F'}
          </p>
        </div>
      ),
    },
    {
      id: 'subtotal',
      header: 'Subtotal',
      cell: ({ row }) => <MoneyDisplay amount={row.original.subtotal} />,
    },
    {
      id: 'tax',
      header: 'IVA',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          <MoneyDisplay amount={row.original.tax_amount} />
        </span>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => (
        <MoneyDisplay amount={row.original.total} className="font-semibold text-primary" />
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="text-right">
          <Button size="sm" variant="ghost" onClick={() => setOpenSaleId(row.original.id)}>
            <Eye className="mr-1 h-3.5 w-3.5" /> Ver
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <div className="p-6">
      <PageHeader
        title="Historial de ventas"
        subtitle="Tickets emitidos. Los montos y datos del cliente son los snapshotados al momento de cobrar."
      />

      <Card>
        <CardContent className="p-4">
          {isLoading && (
            <LoadingSpinner label="Cargando historial..." className="justify-center py-10" />
          )}

          {isError && (
            <EmptyState
              title="No se pudo cargar el historial"
              description={error instanceof Error ? error.message : 'Error desconocido'}
              action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
            />
          )}

          {!isLoading && !isError && data && data.data.length === 0 && (
            <EmptyState
              title="Sin ventas registradas"
              description="Cuando proceses una venta en Facturar aparecera aqui."
            />
          )}

          {!isLoading && !isError && data && data.data.length > 0 && (
            <>
              <DataTable columns={columns} data={data.data} />

              <div className="mt-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Pagina {data.page} de {totalPages} · {data.total} venta{data.total === 1 ? '' : 's'}
                  {isFetching && <span className="ml-2 italic">actualizando...</span>}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={!canPrev || isFetching}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={!canNext || isFetching}
                  >
                    Siguiente <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SaleDetailDialog
        open={openSaleId != null}
        onOpenChange={(open) => { if (!open) setOpenSaleId(null) }}
        saleId={openSaleId}
      />
    </div>
  )
}
