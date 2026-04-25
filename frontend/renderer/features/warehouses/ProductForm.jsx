import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const CATEGORIES = [
  'Aceites y lubricantes',
  'Frenos e hidráulico',
  'Filtros',
  'Bujías y encendido',
  'Químicos y aerosoles',
  'Refrigeración',
  'Eléctrico',
  'Otro',
]

/**
 * @param {{
 *   initial: any,
 *   onSave: (data: any) => void,
 *   onCancel: () => void,
 * }} props
 */
export default function ProductForm({ initial, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    code:        initial?.code        ?? '',
    name:        initial?.name        ?? '',
    category:    initial?.category    ?? CATEGORIES[0],
    description: initial?.description ?? '',
    brand:       initial?.brand       ?? '',
    price:       initial?.price       ?? 0,
    stock:       initial?.stock       ?? 0,
    location:    initial?.location    ?? '',
    condition:   initial?.condition   ?? 'Nuevo',
  })

  /** @param {React.ChangeEvent<HTMLInputElement | HTMLSelectElement>} e */
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave({ ...formData, price: Number(formData.price), stock: Number(formData.stock) })
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="code">Codigo SKU *</Label>
        <Input id="code" name="code" value={formData.code} onChange={handleChange} required />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Nombre del producto *</Label>
        <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="category">Categoria</Label>
          <select id="category" name="category" value={formData.category} onChange={handleChange} className={SELECT_CLASS}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="brand">Marca</Label>
          <Input id="brand" name="brand" value={formData.brand} onChange={handleChange} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="description">Descripcion / Compatible con</Label>
        <Input id="description" name="description" value={formData.description} onChange={handleChange} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="price">Precio unitario (Q)</Label>
          <Input id="price" name="price" type="number" min="0" step="0.01" value={formData.price} onChange={handleChange} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="stock">Stock inicial</Label>
          <Input
            id="stock"
            name="stock"
            type="number"
            min="0"
            value={formData.stock}
            onChange={handleChange}
            disabled={!!initial}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="location">Ubicacion (estante / fila)</Label>
          <Input id="location" name="location" value={formData.location} onChange={handleChange} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="condition">Condicion</Label>
          <select id="condition" name="condition" value={formData.condition} onChange={handleChange} className={SELECT_CLASS}>
            <option>Nuevo</option>
            <option>Seminuevo</option>
            <option>Antiguo</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit">{initial ? 'Actualizar producto' : 'Guardar producto'}</Button>
      </div>
    </form>
  )
}
