import { Outlet, Navigate } from 'react-router-dom';
import { useAuthContext } from '../features/auth/AuthContext';
import { ROUTES } from '../lib/constants';

export default function ProtectedLayout() {
  const { user, loading } = useAuthContext();
  if (loading) return null;
  if (!user) return <Navigate to={ROUTES.LOGIN} replace />;
  return <Outlet />;
}
