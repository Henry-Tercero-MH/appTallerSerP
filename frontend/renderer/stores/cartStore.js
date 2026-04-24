import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * @typedef {import('@/schemas/cart-item.schema.js').CartItem} CartItem
 * @typedef {{ id: number, name: string } | null} Customer
 */

/**
 * Persistencia: sessionStorage, NO localStorage.
 *
 * Trade-off considerado:
 *  - localStorage: el carrito sobrevive a cerrar la app. Riesgo real de
 *    "ventas zombie": el operador de la mañana deja un carrito a medias, el
 *    de la tarde abre la app y encuentra items que no agrego. Para un POS
 *    esto es una contingencia operativa seria.
 *  - sin persistencia: una recarga accidental (F5, crash del renderer) pierde
 *    todo. En una venta con 20 items eso es inaceptable.
 *  - sessionStorage: sobrevive a recargas pero muere al cerrar la ventana.
 *    Mejor balance: protege contra accidentes dentro de la sesion sin
 *    arrastrar estado entre turnos.
 */

const storage = typeof window !== 'undefined'
  ? createJSONStorage(() => window.sessionStorage)
  : undefined

/**
 * @typedef {Object} CartState
 * @property {CartItem[]} items
 * @property {Customer} customer
 * @property {(product: { id: number, code: string, name: string, price: number, stock: number }) => void} addItem
 * @property {(productId: number) => void} removeItem
 * @property {(productId: number, qty: number) => void} updateQuantity
 * @property {() => void} clear
 * @property {(customer: Customer) => void} setCustomer
 */

/** @type {import('zustand').UseBoundStore<import('zustand').StoreApi<CartState>>} */
export const useCartStore = create(
  persist(
    (set) => ({
      items: /** @type {CartItem[]} */ ([]),
      customer: /** @type {Customer} */ (null),

      addItem: (product) =>
        set((state) => {
          const existing = state.items.find((i) => i.productId === product.id)
          if (existing) {
            const nextQty = existing.qty + 1
            // Tope por stock visible; el main valida la verdad autoritativa.
            if (nextQty > product.stock && product.stock < 1000) return state
            return {
              items: state.items.map((i) =>
                i.productId === product.id ? { ...i, qty: nextQty } : i
              ),
            }
          }
          return {
            items: [
              ...state.items,
              {
                productId: product.id,
                code:      product.code,
                name:      product.name,
                price:     product.price,
                qty:       1,
                maxStock:  product.stock,
              },
            ],
          }
        }),

      removeItem: (productId) =>
        set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),

      updateQuantity: (productId, qty) =>
        set((state) => {
          if (qty < 1) {
            return { items: state.items.filter((i) => i.productId !== productId) }
          }
          return {
            items: state.items.map((i) =>
              i.productId === productId
                ? { ...i, qty: Math.min(qty, i.maxStock >= 1000 ? qty : i.maxStock) }
                : i
            ),
          }
        }),

      clear: () => set({ items: [], customer: null }),
      setCustomer: (customer) => set({ customer }),
    }),
    {
      name: 'cart-store',
      storage,
      // Persistir solo estado, no acciones (zustand ya lo hace pero explicitar).
      partialize: (state) => ({ items: state.items, customer: state.customer }),
    }
  )
)

/* ───────────── Selectores ─────────────
   Usar con useCartStore(selector) para evitar rerenders innecesarios.
   Nota: todos los montos se calculan en unidades de moneda (el backend
   guarda REAL). Cuando se migre a centavos, cambiar el tipo aqui. */

/** @param {CartState} state */
export const selectItemCount = (state) => state.items.reduce((acc, i) => acc + i.qty, 0)

/** @param {CartState} state */
export const selectSubtotal = (state) =>
  state.items.reduce((acc, i) => acc + i.price * i.qty, 0)

/**
 * Total sin impuesto (igual a subtotal hoy; cuando main aplique tax_rate
 * snapshotado, este selector dejara de usarse para el total final).
 * @param {CartState} state
 */
export const selectTotal = (state) => selectSubtotal(state)
