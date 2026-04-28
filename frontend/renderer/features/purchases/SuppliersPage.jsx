import { useState, useEffect } from 'react'
import { Plus, Pencil, Power, PowerOff, Search, Truck, Building2, Phone, Mail, MapPin } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { PageHeader }     from '@/components/shared/PageHeader'
import { EmptyState }     from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import {
  useSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useSetSupplierActive,
} from '@/hooks/usePurchases'
import { useAuthContext } from '@/features/auth/AuthContext'

// ── Form dialog ───────────────────────────────────────────────────────────────

/**
 * @param {{
 *   open: boolean,
 *   supplier: any | null,
 *   role: string,
 *   onClose: () => void,
 * }} props
 */
function SupplierFormDialog({ open, supplier, role, onClose }) {
  const isEdit = !!supplier
  const create = useCreateSupplier()
  const update = useUpdateSupplier()
  const pending = create.isPending || update.isPending

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      name:         '',
      contact_name: '',
      phone:        '',
      email:        '',
      address:      '',
      notes:        '',
    },
  })

  useEffect(() => {
    if (open) {
      reset(
        supplier
          ? {
              name:         supplier.name         ?? '',
              contact_name: supplier.contact_name ?? '',
              phone:        supplier.phone        ?? '',
              email:        supplier.email        ?? '',
              address:      supplier.address      ?? '',
              notes:        supplier.notes        ?? '',
            }
          : { name: '', contact_name: '', phone: '', email: '', address: '', notes: '' }
      )
    }
  }, [open, supplier]) // eslint-disable-line react-hooks/exhaustive-deps

  /** @param {Record<string,string>} values */
  async function onSubmit(values) {
    try {
      if (isEdit) {
        await update.mutateAsync({ id: supplier.id, input: values, role })
        toast.success('Proveedor actualizado')
      } else {
        await create.mutateAsync({ input: values, role })
        toast.success('Proveedor creado')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 pt-1">
          <div className="grid gap-1.5">
            <Label>Nombre / Razón social *</Label>
            <Input {...register('name', { required: 'Requerido' })} placeholder="Ej. Distribuidora XYZ" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Contacto</Label>
              <Input {...register('contact_name')} placeholder="Nombre de contacto" />
            </div>
            <div className="grid gap-1.5">
              <Label>Teléfono</Label>
              <Input {...register('phone')} placeholder="Ej. 5555-1234" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Correo electrónico</Label>
            <Input {...register('email')} type="email" placeholder="proveedor@email.com" />
          </div>

          <div className="grid gap-1.5">
            <Label>Dirección</Label>
            <Input {...register('address')} placeholder="Dirección del proveedor" />
          </div>

          <div className="grid gap-1.5">
            <Label>Notas</Label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Condiciones de pago, plazos de entrega, etc."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const { user } = useAuthContext()
  const role = user?.role ?? ''

  const [query,    setQuery]    = useState('')
  const [editing,  setEditing]  = useState(/** @type {any|null} */ (null))
  const [creating, setCreating] = useState(false)

  const { data: suppliers = [], isLoading, isError, error, refetch } = useSuppliers()
  const setActive = useSetSupplierActive()

  const filtered = suppliers.filter(s => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      s.name?.toLowerCase().includes(q) ||
      s.contact_name?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    )
  })

  const activeCount   = suppliers.filter(s => s.active === 1).length
  const inactiveCount = suppliers.filter(s => s.active === 0).length

  async function handleToggle(s) {
    try {
      await setActive.mutateAsync({ id: s.id, active: s.active === 0, role })
      toast.success(s.active === 1 ? 'Proveedor desactivado' : 'Proveedor activado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    }
  }

  return (
    <div className="sh-shell">
      <div className="sh-header-row">
        <PageHeader
          title="Proveedores"
          subtitle="Gestiona los proveedores para órdenes de compra"
        />
        {role === 'admin' && (
          <Button size="sm" onClick={() => setCreating(true)} className="shrink-0 self-start mt-1">
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo proveedor
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="cl-stats">
        <div className="cl-stat">
          <Truck className="h-4 w-4 text-primary" />
          <span className="cl-stat-num">{suppliers.length}</span>
          <span className="cl-stat-label">total</span>
        </div>
        <div className="cl-stat-sep" />
        <div className="cl-stat">
          <span className="cl-stat-dot cl-dot-green" />
          <span className="cl-stat-num">{activeCount}</span>
          <span className="cl-stat-label">activos</span>
        </div>
        {inactiveCount > 0 && (
          <>
            <div className="cl-stat-sep" />
            <div className="cl-stat">
              <span className="cl-stat-dot cl-dot-gray" />
              <span className="cl-stat-num">{inactiveCount}</span>
              <span className="cl-stat-label">inactivos</span>
            </div>
          </>
        )}
      </div>

      {/* Búsqueda */}
      <div className="relative w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar proveedor..."
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Cuerpo */}
      {isLoading && <LoadingSpinner label="Cargando proveedores..." className="justify-center py-16" />}

      {isError && (
        <EmptyState
          title="No se pudo cargar la lista"
          description={error instanceof Error ? error.message : 'Error desconocido'}
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <EmptyState
          title={query ? 'Sin resultados' : 'Sin proveedores registrados'}
          description={query ? 'Ajusta la búsqueda.' : 'Crea el primer proveedor con el botón de arriba.'}
          icon={<Truck className="h-10 w-10 opacity-25" />}
        />
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="sh-table-card">
          <div className="sh-table-scroll">
            <table className="sh-table">
              <thead>
                <tr>
                  <th className="sh-th">Proveedor</th>
                  <th className="sh-th">Contacto</th>
                  <th className="sh-th">Teléfono</th>
                  <th className="sh-th">Correo</th>
                  <th className="sh-th">Dirección</th>
                  <th className="sh-th w-20">Estado</th>
                  <th className="sh-th w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, idx) => {
                  const isActive = s.active === 1
                  return (
                    <tr key={s.id} className={!isActive ? 'sh-tr-voided' : idx % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium text-sm">{s.name}</span>
                        </div>
                      </td>
                      <td className="sh-td text-sm">{s.contact_name || <span className="text-muted-foreground">—</span>}</td>
                      <td className="sh-td">
                        {s.phone
                          ? <span className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3 text-muted-foreground" />{s.phone}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="sh-td">
                        {s.email
                          ? <span className="flex items-center gap-1 text-xs"><Mail className="h-3 w-3 text-muted-foreground" />{s.email}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="sh-td">
                        {s.address
                          ? <span className="flex items-center gap-1 text-xs"><MapPin className="h-3 w-3 text-muted-foreground" />{s.address}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="sh-td">
                        <span className={`sh-payment-badge ${isActive
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                          {isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="sh-td text-right">
                        {role === 'admin' && (
                          <div className="flex items-center justify-end gap-0.5">
                            <button className="sh-eye-btn" title="Editar" onClick={() => setEditing(s)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="sh-void-btn"
                              title={isActive ? 'Desactivar' : 'Activar'}
                              onClick={() => handleToggle(s)}
                              disabled={setActive.isPending}
                            >
                              {isActive
                                ? <PowerOff className="h-3.5 w-3.5" />
                                : <Power    className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SupplierFormDialog
        open={creating || editing != null}
        supplier={editing}
        role={role}
        onClose={() => { setCreating(false); setEditing(null) }}
      />
    </div>
  )
}
