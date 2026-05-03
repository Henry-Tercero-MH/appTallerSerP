import { useState } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { Card }   from '@/components/ui/card'
import { BRAND_NAME, BRAND_LOGO } from '../../lib/brand'

export default function ActivationPage({ onActivated }) {
  const [token,   setToken]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleActivate(e) {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    try {
      const res = await window.api.license.activate(token.trim())
      if (!res.ok) {
        toast.error(res.error.message)
        return
      }
      toast.success('Aplicación activada correctamente')
      onActivated?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--background)',
      padding: '1rem',
    }}>
      <Card style={{ width: '100%', maxWidth: 420, padding: '2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          {BRAND_LOGO && (
            <img src={BRAND_LOGO} alt={BRAND_NAME}
              style={{ height: 64, margin: '0 auto 1rem', objectFit: 'contain' }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <ShieldCheck size={22} style={{ color: 'var(--primary)' }} />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Activación de Licencia</h1>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', margin: 0 }}>
            Ingresa el token de activación para comenzar a usar {BRAND_NAME}.
          </p>
        </div>

        <form onSubmit={handleActivate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label htmlFor="token">Token de activación</Label>
            <div style={{ position: 'relative' }}>
              <KeyRound size={16} style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--muted-foreground)',
              }} />
              <Input
                id="token"
                value={token}
                onChange={e => setToken(e.target.value.toUpperCase())}
                placeholder="MDS-XXXX-XXXX-XXXX"
                style={{ paddingLeft: 32, fontFamily: 'monospace', letterSpacing: '0.05em' }}
                autoFocus
              />
            </div>
          </div>

          <Button type="submit" disabled={loading || !token.trim()} style={{ width: '100%' }}>
            {loading ? 'Verificando...' : 'Activar'}
          </Button>
        </form>

        <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
          ¿No tienes un token? Contacta al desarrollador para obtener uno.
        </p>
      </Card>
    </div>
  )
}
