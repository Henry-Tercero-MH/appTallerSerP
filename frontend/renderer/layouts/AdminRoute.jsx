import { Outlet, Navigate } from 'react-router-dom'
import { useAuthContext } from '../features/auth/AuthContext'
import { ROUTES } from '../lib/constants'

export default function AdminRoute() {
  const { user } = useAuthContext()
  if (user?.role !== 'admin') return <Navigate to={ROUTES.DASHBOARD} replace />
  return <Outlet />
}
