import { z } from 'zod'

export const ROLES = ['admin', 'cashier', 'mechanic', 'warehouse']

export const ROLE_LABELS = {
  admin:     'Administrador',
  cashier:   'Cajero',
  mechanic:  'Mecánico',
  warehouse: 'Bodeguero',
}

export const userSchema = z.object({
  id:         z.number().int().positive(),
  email:      z.string().email(),
  full_name:  z.string().min(1),
  role:       z.enum(['admin', 'cashier', 'mechanic', 'warehouse']),
  active:     z.number().int().min(0).max(1),
  avatar:     z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

/** @typedef {z.infer<typeof userSchema>} User */

export const userListSchema = z.array(userSchema)

export const userInputSchema = z.object({
  email:     z.string().trim().email('Email inválido'),
  full_name: z.string().trim().min(1, 'Nombre requerido'),
  role:      z.enum(['admin', 'cashier', 'mechanic', 'warehouse'], { message: 'Rol inválido' }),
  password:  z.string().min(6, 'Mínimo 6 caracteres'),
})

export const userPatchSchema = z.object({
  full_name: z.string().trim().min(1, 'Nombre requerido').optional(),
  role:      z.enum(['admin', 'cashier', 'mechanic', 'warehouse']).optional(),
})

export const changePasswordSchema = z.object({
  password:        z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string().min(6, 'Mínimo 6 caracteres'),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})
