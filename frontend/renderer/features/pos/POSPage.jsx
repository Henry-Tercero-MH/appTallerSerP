import { useState } from 'react'
import { Minus, Plus, Search, ShoppingCart, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { MoneyDisplay } from '@/components/shared/MoneyDisplay'
import { CustomerCombobox } from '@/components/shared/CustomerCombobox'

import { useSearchProducts, useCreateSale } from '@/hooks/useProducts'
import { useTaxSettings, useCurrencySettings } from '@/hooks/useSettings'
import {
  useCartStore,
  selectSubtotal,
  selectItemCount,
} from '@/stores/cartStore'
import { computeBreakdown } from '@/lib/pricing'

const DEFAULT_CUSTOMER_ID = 1 // Consumidor Final

/**
 * Vista POS. Conecta products/sales/customers via hooks; estado de carrito
 * en Zustand; combobox de cliente con quick-create. Total autoritativo
 * calculado por el main (el cliente no lo envia).
 */
export default function POSPage() {
  const [query, setQuery] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)

  const { data: products = [], isLoading, isError, error, refetch } = useSearchProducts(query)

  const items       = useCartStore((s) => s.items)
  const addItem     = useCartStore((s) => s.addItem)
  const removeItem  = useCartStore((s) => s.removeItem)
  const updateQty   = useCartStore((s) => s.updateQuantity)
  const clearCart   = useCartStore((s) => s.clear)
  const itemCount   = useCartStore(selectItemCount)
  const rawSum      = useCartStore(selectSubtotal)

  const { rate: taxRate, included: taxIncluded } = useTaxSettings()
  const { decimals } = useCurrencySettings()
  const breakdown = computeBreakdown(rawSum, taxRate, taxIncluded, decimals)

  const createSale = useCreateSale()

  return (
    <div className="p-6">
      <PageHeader
        title="Facturacion"
        subtitle="Venta de repuestos y cobro de ordenes de trabajo"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por codigo o nombre del producto/servicio..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <ProductList
              products={products}
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={() => refetch()}
              onAdd={addItem}
            />
          </CardContent>
        </Card>

        <Card className="flex flex-col lg:sticky lg:top-6 lg:max-h-[calc(100vh-8rem)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-destructive" />
              Detalle de factura
              {itemCount > 0 && <Badge variant="secondary">{itemCount} items</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <EmptyState
                  icon={<ShoppingCart className="h-10 w-10" />}
                  title="Carrito vacio"
                  description="Agrega productos desde el panel izquierdo."
                />
              ) : (
                <ul className="space-y-3">
                  {items.map((it) => (
                    <li key={it.productId} className="rounded-md border p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{it.name}</p>
                          <p className="text-xs text-muted-foreground">
                            <MoneyDisplay amount={it.price} /> c/u
                          </p>
                        </div>
                        <MoneyDisplay
                          amount={it.price * it.qty}
                          className="text-sm font-bold text-primary"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateQty(it.productId, it.qty - 1)}
                            aria-label="Disminuir cantidad"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <Input
                            type="number"
                            value={it.qty}
                            onChange={(e) =>
                              updateQty(it.productId, parseInt(e.target.value, 10) || 1)
                            }
                            className="h-6 w-12 border-0 bg-transparent p-0 text-center text-sm shadow-none focus-visible:ring-0"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateQty(it.productId, it.qty + 1)}
                            aria-label="Aumentar cantidad"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          onClick={() => removeItem(it.productId)}
                          aria-label="Quitar del carrito"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <MoneyDisplay amount={breakdown.subtotal} />
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>IVA ({Math.round(taxRate * 100)}%)</span>
                <MoneyDisplay amount={breakdown.taxAmount} />
              </div>
              <div className="flex items-center justify-between pt-1 text-base font-bold">
                <span>Total</span>
                <MoneyDisplay amount={breakdown.total} className="text-primary" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={items.length === 0 || createSale.isPending}
                onClick={() => clearCart()}
              >
                <X className="mr-1 h-4 w-4" /> Limpiar
              </Button>
              <Button
                variant="destructive"
                className="flex-[2]"
                disabled={items.length === 0 || createSale.isPending}
                onClick={() => setCheckoutOpen(true)}
              >
                Procesar pago
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        previewTotal={breakdown.total}
        isSubmitting={createSale.isPending}
        onConfirm={(customerId) => {
          createSale.mutate(
            {
              items: items.map((i) => ({ id: i.productId, qty: i.qty, price: i.price })),
              customerId,
            },
            {
              onSuccess: () => {
                clearCart()
                setCheckoutOpen(false)
              },
            }
          )
        }}
      />
    </div>
  )
}

/**
 * @param {{
 *   products: import('@/schemas/product.schema.js').ProductList,
 *   isLoading: boolean,
 *   isError: boolean,
 *   error: unknown,
 *   onRetry: () => void,
 *   onAdd: (p: import('@/schemas/product.schema.js').Product) => void,
 * }} props
 */
function ProductList({ products, isLoading, isError, error, onRetry, onAdd }) {
  if (isLoading) {
    return <LoadingSpinner label="Cargando productos..." className="justify-center py-10" />
  }

  if (isError) {
    return (
      <EmptyState
        title="No se pudo cargar el catalogo"
        description={error instanceof Error ? error.message : 'Error desconocido'}
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    )
  }

  if (products.length === 0) {
    return <EmptyState title="Sin resultados" description="Ajusta los terminos de busqueda." />
  }

  return (
    <div className="rounded-md border">
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b bg-muted/40 text-left">
          <tr>
            <th className="h-10 px-3 font-medium text-muted-foreground">Codigo</th>
            <th className="h-10 px-3 font-medium text-muted-foreground">Descripcion</th>
            <th className="h-10 px-3 font-medium text-muted-foreground">Precio</th>
            <th className="h-10 px-3 font-medium text-muted-foreground">Stock</th>
            <th className="h-10 px-3" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
              <td className="p-3">
                <Badge variant="outline" className="font-mono">{p.code}</Badge>
              </td>
              <td className="p-3 font-medium">{p.name}</td>
              <td className="p-3"><MoneyDisplay amount={p.price} /></td>
              <td className="p-3">
                {p.stock > 100 ? (
                  <Badge variant="secondary">Ilimitado</Badge>
                ) : p.stock > 0 ? (
                  <span>{p.stock}</span>
                ) : (
                  <Badge variant="destructive">Sin stock</Badge>
                )}
              </td>
              <td className="p-3 text-right">
                <Button
                  size="sm"
                  disabled={p.stock <= 0}
                  onClick={() => {
                    onAdd(p)
                    toast.success(`Agregado: ${p.name}`)
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Dialog de confirmacion de pago con combobox de cliente.
 *
 * @param {{
 *   open: boolean,
 *   onOpenChange: (v: boolean) => void,
 *   previewTotal: number,
 *   isSubmitting: boolean,
 *   onConfirm: (customerId: number) => void,
 * }} props
 */
function CheckoutDialog({ open, onOpenChange, previewTotal, isSubmitting, onConfirm }) {
  const [customerId, setCustomerId] = useState(/** @type {number | null} */ (DEFAULT_CUSTOMER_ID))
  const [paymentMethod, setPaymentMethod] = useState('cash')

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        // Al cerrar el dialog, no reseteamos customer/payment; el operador
        // suele cobrar varias ventas al mismo cliente seguido.
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar venta</DialogTitle>
          <DialogDescription>
            Total estimado: <MoneyDisplay amount={previewTotal} className="font-semibold text-foreground" />
            <br />
            <span className="text-xs">El monto final lo determina el servidor.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Cliente</Label>
            <CustomerCombobox value={customerId} onChange={setCustomerId} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="paymentMethod">Metodo de pago</Label>
            <select
              id="paymentMethod"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="cash">Efectivo</option>
              <option value="card">Tarjeta</option>
              <option value="transfer">Transferencia</option>
            </select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isSubmitting || customerId == null}
            onClick={() => onConfirm(customerId ?? DEFAULT_CUSTOMER_ID)}
          >
            {isSubmitting ? 'Procesando...' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
