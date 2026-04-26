import { z } from 'zod'

export const auditRowSchema = z.object({
  id:           z.number().int().positive(),
  action:       z.string(),
  entity:       z.string().nullable(),
  entity_id:    z.number().int().nullable(),
  description:  z.string().nullable(),
  payload_json: z.string().nullable(),
  user_id:      z.number().int().nullable(),
  user_name:    z.string().nullable(),
  created_at:   z.string(),
})

/** @typedef {z.infer<typeof auditRowSchema>} AuditRow */

export const auditListSchema = z.object({
  data:     z.array(auditRowSchema),
  total:    z.number().int().nonnegative(),
  page:     z.number().int().positive(),
  pageSize: z.number().int().positive(),
})

/** @typedef {z.infer<typeof auditListSchema>} AuditList */

export const voidSaleInputSchema = z.object({
  saleId:   z.number().int().positive(),
  reason:   z.string().min(5, 'El motivo debe tener al menos 5 caracteres'),
  userId:   z.number().int().positive().optional(),
  userName: z.string().optional(),
})

export const voidSaleResultSchema = z.object({
  voided: z.boolean(),
  saleId: z.number().int().positive(),
})

/** @typedef {z.infer<typeof voidSaleResultSchema>} VoidSaleResult */
