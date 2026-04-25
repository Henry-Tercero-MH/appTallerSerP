import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Power, PowerOff, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'

import { useWarehouseStore } from './warehouseStore'
import WarehouseForm from './WarehouseForm'

export default function WarehousesPage() {
  const { warehouses, create, update, remove, restore } = useWarehouseStore()
  const [modal, setModal] = useState(/** @type {any} */ (null))
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const filtered = useMemo(() => {
    return warehouses.filter((w) => {
      if (!showInactive && !w.isActive) return false
      if (!search) return true
      const qs = search.toLowerCase()
      return w.name.toLowerCase().includes(qs) || w.code.toLowerCase().includes(qs)
    })
  }, [warehouses, showInactive, search])

  const handleSave = (/** @type {any} */ data) => {
    if (modal?.edit) {
      update(modal.edit.id, data)
      toast.success('Bodega actualizada correctamente')
    } else {
      create(data)
      toast.success('Bodega creada exitosamente')
    }
    setModal(null)
  }

  const handleDelete = (/** @type {any} */ w) => {
    remove(w.id)
    toast.warning(`Bodega "${w.name}" desactivada`)
    setModal(null)
  }

  const isFormOpen = modal === 'create' || modal?.edit != null
  const isConfirmOpen = modal?.confirm != null

  return (
    <div className="p-6 print-friendly">
      <div className="no-print">
        <PageHeader
          title="Gestion de bodegas"
          subtitle="Administra las ubicaciones fisicas del inventario"
          actions={
            <>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="mr-1 h-4 w-4" /> Imprimir
              </Button>
              <Button size="sm" onClick={() => setModal('create')}>
                <Plus className="mr-1 h-4 w-4" /> Nueva bodega
              </Button>
            </>
          }
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="text"
              placeholder="Buscar por codigo o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Mostrar inactivas
            </label>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              description={search ? 'Ajusta la busqueda.' : 'No hay bodegas registradas.'}
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Codigo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Direccion</TableHead>
                    <TableHead>Descripcion</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right no-print">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((w) => (
                    <TableRow key={w.id} className={!w.isActive ? 'opacity-60' : undefined}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{w.code}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{w.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {w.address || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {w.description || '-'}
                      </TableCell>
                      <TableCell>
                        {w.isActive ? (
                          <Badge variant="success">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right no-print">
                        <div className="flex justify-end gap-1">
                          {w.isActive ? (
                            <>
                              <Button size="sm" variant="ghost" onClick={() => setModal({ edit: w })}>
                                <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => setModal({ confirm: w })}
                              >
                                <PowerOff className="mr-1 h-3.5 w-3.5" /> Desactivar
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => restore(w.id)}>
                              <Power className="mr-1 h-3.5 w-3.5" /> Activar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal === 'create' ? 'Registrar nueva bodega' : 'Editar bodega'}
            </DialogTitle>
          </DialogHeader>
          {isFormOpen && (
            <WarehouseForm
              initial={modal?.edit ?? null}
              onSave={handleSave}
              onCancel={() => setModal(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmOpen} onOpenChange={(open) => { if (!open) setModal(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar desactivacion</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas desactivar la bodega{' '}
              <strong className="text-foreground">{modal?.confirm?.name}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => modal?.confirm && handleDelete(modal.confirm)}
            >
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
