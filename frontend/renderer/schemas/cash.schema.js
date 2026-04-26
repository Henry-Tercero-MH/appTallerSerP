import { z } from 'zod'

export const cashSessionSchema = z.object({
  id:              z.number(),
  opened_by:       z.number(),
  opened_by_name:  z.string(),
  opened_at:       z.string(),
  opening_amount:  z.number(),
  closed_by:       z.number().nullable(),
  closed_by_name:  z.string().nullable(),
  closed_at:       z.string().nullable(),
  closing_amount:  z.number().nullable(),
  expected_amount: z.number().nullable(),
  difference:      z.number().nullable(),
  notes:           z.string().nullable(),
  status:          z.enum(['open', 'closed']),
})

export const cashMovementSchema = z.object({
  id:         z.number(),
  session_id: z.number(),
  type:       z.enum(['in', 'out']),
  amount:     z.number(),
  concept:    z.string(),
  created_by: z.number().nullable(),
  created_at: z.string(),
})

export const cashSessionDetailSchema = z.object({
  session:    cashSessionSchema,
  movements:  z.array(cashMovementSchema),
  salesTotal: z.number(),
})

export const cashSessionListSchema = z.array(cashSessionSchema)
