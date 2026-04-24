import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, LogIn, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { useAuthContext } from './AuthContext'
import { ROUTES, APP_NAME } from '../../lib/constants'

const loginSchema = z.object({
  email:    z.string().trim().email('Email invalido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

/**
 * Login migrado a tokens semanticos + shadcn. Sin CSS legacy.
 * La logica de auth (mock con MOCK_USERS) no se toca: sigue siendo
 * responsabilidad de useAuth/AuthContext.
 */
export default function LoginPage() {
  const { login } = useAuthContext()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState(/** @type {string | null} */ (null))
  const [submitting, setSubmitting] = useState(false)

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  /** @param {z.infer<typeof loginSchema>} values */
  const onSubmit = async (values) => {
    setAuthError(null)
    setSubmitting(true)
    try {
      login(values.email, values.password)
      // Ruta post-login: POS, que es el flujo principal de la app.
      // Si mañana hay roles, redirigir segun rol desde useAuth.
      navigate(ROUTES.POS)
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Error al ingresar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-950 p-6">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-md bg-destructive text-destructive-foreground shadow-md">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">{APP_NAME}</CardTitle>
          <CardDescription>Sistema de Gestion — Taller &amp; POS</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email">Correo electronico</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                {...form.register('email')}
                aria-invalid={form.formState.errors.email ? 'true' : 'false'}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...form.register('password')}
                aria-invalid={form.formState.errors.password ? 'true' : 'false'}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>

            {authError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="destructive"
              className="w-full"
              disabled={submitting}
            >
              <LogIn className="mr-2 h-4 w-4" />
              {submitting ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

          <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
            Demo: <span className="font-medium text-foreground">admin@empresa.com</span>
            {' / '}
            <span className="font-medium text-foreground">admin123</span>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
