import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, ShieldCheck } from 'lucide-react'

import { Button }       from '@/components/ui/button'
import { PageHeader }   from '@/components/shared/PageHeader'
import { EmptyState }   from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useAuditLog }  from '@/hooks/useAuditLog'

const PAGE_SIZE = 30

const dateFmt = new Intl.DateTimeFormat('es-GT', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

/** @type {Record<string, { label: string, cls: string }>} */
const ACTION_STYLES = {
  sale_voided:      { label: 'Anulación',        cls: 'al-tag-red'    },
  sale_created:     { label: 'Venta',             cls: 'al-tag-green'  },
  settings_changed: { label: 'Configuración',     cls: 'al-tag-blue'   },
  user_created:     { label: 'Usuario creado',    cls: 'al-tag-violet' },
  user_login:       { label: 'Inicio de sesión',  cls: 'al-tag-gray'   },
}

const ACTION_FILTER_OPTIONS = [
  { value: '',               label: 'Todas las acciones' },
  { value: 'sale_voided',    label: 'Anulaciones'        },
  { value: 'sale_created',   label: 'Ventas'             },
  { value: 'settings_changed', label: 'Configuración'    },
  { value: 'user_created',   label: 'Usuarios creados'   },
  { value: 'user_login',     label: 'Inicios de sesión'  },
]

export default function AuditLogPage() {
  const [page,         setPage]         = useState(1)
  const [actionFilter, setActionFilter] = useState('')
  const [fromFilter,   setFromFilter]   = useState('')
  const [toFilter,     setToFilter]     = useState('')

  const opts = {
    page,
    pageSize: PAGE_SIZE,
    action: actionFilter || undefined,
    from:   fromFilter   || undefined,
    to:     toFilter ? toFilter + ' 23:59:59' : undefined,
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useAuditLog(opts)

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const canPrev    = page > 1
  const canNext    = data ? page < totalPages : false

  function handleFilterChange() {
    setPage(1)
  }

  return (
    <div className="sh-shell">
      <div className="sh-header-row">
        <PageHeader
          title="Bitácora del sistema"
          subtitle="Registro de todas las acciones relevantes realizadas en la aplicación."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="shrink-0 self-start mt-1"
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="al-filters">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); handleFilterChange() }}
          className="al-filter-select"
        >
          {ACTION_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="al-filter-date">
          <label className="al-filter-label">Desde</label>
          <input
            type="date"
            value={fromFilter}
            onChange={(e) => { setFromFilter(e.target.value); handleFilterChange() }}
            className="al-filter-input"
          />
        </div>
        <div className="al-filter-date">
          <label className="al-filter-label">Hasta</label>
          <input
            type="date"
            value={toFilter}
            onChange={(e) => { setToFilter(e.target.value); handleFilterChange() }}
            className="al-filter-input"
          />
        </div>
        {(actionFilter || fromFilter || toFilter) && (
          <button
            className="al-filter-clear"
            onClick={() => { setActionFilter(''); setFromFilter(''); setToFilter(''); setPage(1) }}
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Cuerpo */}
      {isLoading && <LoadingSpinner label="Cargando bitácora..." className="justify-center py-16" />}

      {isError && (
        <EmptyState
          title="No se pudo cargar la bitácora"
          description={error instanceof Error ? error.message : 'Error desconocido'}
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {!isLoading && !isError && data?.data.length === 0 && (
        <EmptyState
          title="Sin registros"
          description="No hay eventos que coincidan con los filtros aplicados."
          icon={<ShieldCheck className="h-10 w-10 opacity-25" />}
        />
      )}

      {!isLoading && !isError && data && data.data.length > 0 && (
        <div className="sh-table-card">
          <div className="sh-table-scroll">
            <table className="sh-table">
              <thead>
                <tr>
                  <th className="sh-th w-14">ID</th>
                  <th className="sh-th w-36">Fecha y hora</th>
                  <th className="sh-th w-32">Acción</th>
                  <th className="sh-th w-24">Entidad</th>
                  <th className="sh-th w-16 sh-num">ID ref.</th>
                  <th className="sh-th">Descripción</th>
                  <th className="sh-th w-32">Usuario</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((row, idx) => {
                  const style = ACTION_STYLES[row.action] ?? { label: row.action, cls: 'al-tag-gray' }
                  const date  = dateFmt.format(new Date(row.created_at.replace(' ', 'T')))
                  const [datePart, timePart] = date.split(', ')
                  return (
                    <tr key={row.id} className={idx % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td sh-nit">{row.id}</td>
                      <td className="sh-td">
                        <span className="sh-date-main">{datePart}</span>
                        <span className="sh-date-time">{timePart}</span>
                      </td>
                      <td className="sh-td">
                        <span className={`al-tag ${style.cls}`}>{style.label}</span>
                      </td>
                      <td className="sh-td sh-client-type">{row.entity ?? '—'}</td>
                      <td className="sh-td sh-num sh-nit">{row.entity_id ?? '—'}</td>
                      <td className="sh-td al-description">{row.description ?? '—'}</td>
                      <td className="sh-td sh-customer">{row.user_name ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="sh-pagination">
            <div className="sh-pag-info">
              <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
              <span>
                Página <strong>{data.page}</strong> de <strong>{totalPages}</strong>
                &nbsp;·&nbsp;
                <strong>{data.total}</strong> evento{data.total === 1 ? '' : 's'}
              </span>
              {isFetching && <span className="sh-pag-updating">actualizando…</span>}
            </div>
            <div className="flex gap-1.5">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || isFetching}
                className="h-7 px-2.5 text-xs"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Anterior
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                const p     = start + i
                return (
                  <button key={p} onClick={() => setPage(p)} disabled={isFetching}
                    className={`sh-pag-num ${p === page ? 'sh-pag-active' : ''}`}>
                    {p}
                  </button>
                )
              })}
              <Button
                variant="outline" size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!canNext || isFetching}
                className="h-7 px-2.5 text-xs"
              >
                Siguiente <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
