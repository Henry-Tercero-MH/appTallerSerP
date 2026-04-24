import { useState } from 'react'
import { Check, Plus, Search, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCustomer, useSearchCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { cn } from '@/lib/utils'

/**
 * Combobox de cliente para POS. Maneja:
 *  - Busqueda live por nombre o NIT
 *  - Seleccion de resultado
 *  - Quick-create inline: crea un cliente nuevo y lo auto-selecciona
 *
 * Value es customerId o null; onChange recibe el customerId tras seleccion
 * o creacion. El caller controla el estado (no guardamos cliente completo,
 * solo id — la UI consulta por id cuando necesita mostrar el chip).
 *
 * @param {{
 *   value: number | null,
 *   onChange: (id: number | null) => void,
 * }} props
 */
export function CustomerCombobox({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: selected } = useCustomer(value)

  // Si hay cliente seleccionado, mostrar chip; click en X deselecciona.
  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{selected.name}</p>
            <p className="text-xs text-muted-foreground">
              NIT: <span className="font-mono">{selected.nit}</span>
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => {
            onChange(null)
            setQuery('')
          }}
          aria-label="Cambiar cliente"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  if (creating) {
    return (
      <QuickCreateForm
        initialName={query}
        onCancel={() => setCreating(false)}
        onCreated={(newId) => {
          setCreating(false)
          setQuery('')
          onChange(newId)
        }}
      />
    )
  }

  return (
    <CustomerSearchBox
      query={query}
      setQuery={setQuery}
      onSelect={(id) => {
        onChange(id)
        setQuery('')
      }}
      onRequestCreate={() => setCreating(true)}
    />
  )
}

/**
 * @param {{
 *   query: string,
 *   setQuery: (q: string) => void,
 *   onSelect: (id: number) => void,
 *   onRequestCreate: () => void,
 * }} props
 */
function CustomerSearchBox({ query, setQuery, onSelect, onRequestCreate }) {
  const { data: results = [], isLoading } = useSearchCustomers(query)

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente por nombre o NIT..."
          className="pl-9"
          autoFocus
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-md border">
        {isLoading && (
          <div className="p-3 text-center text-sm text-muted-foreground">Buscando...</div>
        )}

        {!isLoading && results.length === 0 && (
          <div className="space-y-2 p-3 text-center">
            <p className="text-sm text-muted-foreground">
              {query ? 'Sin coincidencias.' : 'Escribe para buscar.'}
            </p>
          </div>
        )}

        {!isLoading && results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={cn(
              'flex w-full items-center justify-between border-b px-3 py-2 text-left last:border-0',
              'hover:bg-muted/50 focus:bg-muted focus:outline-none'
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono">{c.nit}</span>
                {c.id === 1 && <Badge variant="secondary" className="ml-2">Por defecto</Badge>}
              </p>
            </div>
            <Check className="h-4 w-4 opacity-0" />
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRequestCreate}
        className="w-full"
      >
        <Plus className="mr-1 h-4 w-4" /> Nuevo cliente
      </Button>
    </div>
  )
}

/**
 * @param {{
 *   initialName?: string,
 *   onCancel: () => void,
 *   onCreated: (id: number) => void,
 * }} props
 */
function QuickCreateForm({ initialName = '', onCancel, onCreated }) {
  const [name, setName] = useState(initialName)
  const [nit, setNit] = useState('')
  const [phone, setPhone] = useState('')

  const createMutation = useCreateCustomer()

  const disabled = createMutation.isPending || name.trim().length < 2

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-sm font-medium">Nuevo cliente</p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre *"
        autoFocus
      />
      <Input
        value={nit}
        onChange={(e) => setNit(e.target.value)}
        placeholder="NIT (vacio = C/F)"
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Telefono (opcional)"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
          disabled={createMutation.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={disabled}
          onClick={() => {
            createMutation.mutate(
              { name: name.trim(), nit: nit.trim(), phone: phone.trim() || null },
              { onSuccess: (customer) => onCreated(customer.id) }
            )
          }}
        >
          {createMutation.isPending ? 'Creando...' : 'Crear y seleccionar'}
        </Button>
      </div>
    </div>
  )
}
