import { useState, useEffect } from 'react'
import ActivationPage from '../features/activation/ActivationPage'

export default function LicenseGuard({ children }) {
  const [status, setStatus] = useState('checking') // 'checking' | 'active' | 'inactive'

  useEffect(() => {
    window.api.license.status().then(res => {
      setStatus(res.ok && res.data.activated ? 'active' : 'inactive')
    }).catch(() => setStatus('inactive'))
  }, [])

  if (status === 'checking') return null
  if (status === 'inactive') return <ActivationPage onActivated={() => setStatus('active')} />
  return children
}
