import { z } from 'zod'

/**
 * Formulario minimo de checkout: identifica al cliente y confirma metodo
 * de pago. Se mantiene simple porque el modelo de cliente real aun no existe.
 * Cuando haya tabla `customers`, reemplazar `customerName/customerNit` por
 * `customer_id` y validar contra un fetch.
 */
export const checkoutSchema = z.object({
  customerName: z.string().trim().max(120).optional().default(''),
  customerNit:  z.string().trim().max(20).optional().default(''),
  paymentMethod: z.enum(['cash', 'card', 'transfer']).default('cash'),
})

/** @typedef {z.infer<typeof checkoutSchema>} CheckoutForm */
