import { z } from 'zod'

/**
 * Formulario de checkout. `customerId` siempre presente: el combobox
 * garantiza un id seleccionado (default = 1 Consumidor Final si el
 * operador no toca nada).
 */
export const checkoutSchema = z.object({
  customerId:    z.number().int().positive(),
  paymentMethod: z.enum(['cash', 'card', 'transfer']).default('cash'),
})

/** @typedef {z.infer<typeof checkoutSchema>} CheckoutForm */
