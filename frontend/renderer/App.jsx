import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './features/auth/AuthContext';
import { router } from './router';
import LicenseGuard from './layouts/LicenseGuard';

export default function App() {
  return (
    <LicenseGuard>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LicenseGuard>
  );
}
