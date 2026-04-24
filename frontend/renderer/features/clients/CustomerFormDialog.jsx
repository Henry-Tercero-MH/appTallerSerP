import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { customerCreateSchema } from '@/schemas/customer.schema'
import { useCreateCustomer, useUpdateCustomer } from '@/hooks/useCustomers'

/**
 * Dialog unificado de create/edit. `initial` activa modo edicion.
 * Comparte validacion Zod (customerCreateSchema) en ambos modos. La
 * diferencia esta en la mutation y en el titulo del dialog.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (v: boolean) => void,
 *   initial?: import('@/schemas/customer.schema').Customer | null,
 *   onSaved?: (customer: import('@/schemas/customer.schema').Customer) => void,
 * }} props
 */
export function CustomerFormDialog({ open, onOpenChange, initial, onSaved }) {
  const isEdit = initial != null && initial.id !== 1
  const isProtectedDefault = initial != null && initial.id === 1

  const form = useForm({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      name:    '',
      nit:     '',
      email:   '',
      phone:   '',
      address: '',
    },
  })

  const createMutation = useCreateCustomer()
  const updateMutation = useUpdateCustomer()

  // Reset al abrir: rellenar con `initial` si edit, o limpiar si create.
  useEffect(() => {
    if (!open) return
    form.reset({
      name:    initial?.name    ?? '',
      nit:     initial?.nit     ?? '',
      email:   initial?.email   ?? '',
      phone:   initial?.phone   ?? '',
      address: initial?.address ?? '',
    })
  }, [open, initial, form])

  const isSubmitting = createMutation.isPending || updateMutation.isPending

  /** @param {import('@/schemas/customer.schema').CustomerCreateForm} values */
  const onSubmit = (values) => {
    const payload = {
      name: values.name,
      nit: values.nit,
      email: values.email || null,
      phone: values.phone || null,
      address: values.address || null,
    }

    if (isEdit && initial) {
      updateMutation.mutate(
        { id: initial.id, patch: payload },
        {
          onSuccess: (saved) => {
            onOpenChange(false)
            onSaved?.(saved)
          },
        }
      )
    } else {
      createMutation.mutate(payload, {
        onSuccess: (saved) => {
          onOpenChange(false)
          onSaved?.(saved)
        },
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          <DialogDescription>
            {isProtectedDefault
              ? 'El cliente "Consumidor Final" es del sistema y no se puede editar.'
              : 'Los campos marcados con * son obligatorios. Si el NIT se deja vacio se guarda como C/F.'}
          </DialogDescription>
        </DialogHeader>

        {isProtectedDefault ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input id="name" {...form.register('name')} placeholder="Nombre o razon social" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="nit">NIT</Label>
              <Input id="nit" {...form.register('nit')} placeholder="C/F si vacio" />
              {form.formState.errors.nit && (
                <p className="text-xs text-destructive">{form.formState.errors.nit.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...form.register('email')} placeholder="opcional" />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Telefono</Label>
              <Input id="phone" {...form.register('phone')} placeholder="opcional" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address">Direccion</Label>
              <Input id="address" {...form.register('address')} placeholder="opcional" />
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
