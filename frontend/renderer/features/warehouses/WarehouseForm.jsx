import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const EMPTY = { code: '', name: '', description: '', address: '' }

/**
 * @param {{ initial: any, onSave: (data: any) => void, onCancel: () => void }} props
 */
export default function WarehouseForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState(/** @type {Record<string,string>} */ ({}))

  useEffect(() => {
    setForm(initial ? { ...EMPTY, ...initial } : EMPTY)
    setErrors({})
  }, [initial])

  /** @param {React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>} e */
  function handleChange(e) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }))
  }

  function validate() {
    const errs = /** @type {Record<string,string>} */ ({})
    if (!form.code.trim()) errs.code = 'El codigo es requerido'
    else if (!/^[A-Z]{2,4}-\d{3,}$/.test(form.code.trim()))
      errs.code = 'Formato: BDG-001'
    if (!form.name.trim()) errs.name = 'El nombre es requerido'
    return errs
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const errs = validate()
        if (Object.keys(errs).length) {
          setErrors(errs)
          return
        }
        onSave({ ...form, code: form.code.toUpperCase().trim() })
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="grid gap-2 sm:col-span-1">
          <Label htmlFor="code">Codigo *</Label>
          <Input
            id="code"
            name="code"
            value={form.code}
            onChange={handleChange}
            placeholder="BDG-001"
            disabled={!!initial}
            aria-invalid={!!errors.code}
          />
          {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
        </div>

        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Bodega Central"
            aria-invalid={!!errors.name}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descripcion</Label>
        <textarea
          id="description"
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Descripcion opcional"
          rows={2}
          className="min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="address">Direccion</Label>
        <Input
          id="address"
          name="address"
          value={form.address}
          onChange={handleChange}
          placeholder="Direccion de la bodega"
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{initial ? 'Guardar cambios' : 'Crear bodega'}</Button>
      </div>
    </form>
  )
}
