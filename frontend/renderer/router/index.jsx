import { createHashRouter, Navigate } from 'react-router-dom';
// Hash en lugar de Browser: Electron empaquetado carga desde file://, donde
// createBrowserRouter no puede resolver rutas tipo /ventas. Con hash pasan
// a /#/ventas y funcionan igual en dev (http) y prod (file).
import AuthLayout from '../layouts/AuthLayout';
import ProtectedLayout from '../layouts/ProtectedLayout';
import AppLayout from '../layouts/AppLayout';
import LoginPage from '../features/auth/LoginPage';
import InventoryPage from '../features/warehouses/InventoryPage';

// Nuevos módulos para Taller
import POSPage from '../features/pos/POSPage';
import WorkshopPage from '../features/workshop/WorkshopPage';
import ClientsPage from '../features/clients/ClientsPage';
import SalesHistoryPage from '../features/sales/SalesHistoryPage';

// Modulos Legacy Bodega (Mantener solo por seguridad si los necesitan las sub-rutas de bodega, aunque las ocultamos)
import WarehouseLandingPage from '../features/warehouses/WarehouseLandingPage';
import WarehousesPage from '../features/warehouses/WarehousesPage';
import DashboardPage from '../features/warehouses/DashboardPage';
import MovementsPage from '../features/warehouses/MovementsPage';
import AlertsPage from '../features/warehouses/AlertsPage';

import { ROUTES } from '../lib/constants';

export const router = createHashRouter([
  {
    element: <AuthLayout />,
    children: [{ path: ROUTES.LOGIN, element: <LoginPage /> }],
  },
  {
    element: <ProtectedLayout />,
    children: [
      {
        element: <AppLayout />,
        children: [
          // Flujo Principal Taller
          { path: ROUTES.POS, element: <POSPage /> },
          { path: ROUTES.HISTORY, element: <SalesHistoryPage /> },
          { path: ROUTES.WORKSHOP, element: <WorkshopPage /> },
          { path: ROUTES.INVENTORY, element: <InventoryPage /> },
          { path: ROUTES.CLIENTS, element: <ClientsPage /> },
          { path: ROUTES.DASHBOARD, element: <Navigate to={ROUTES.POS} replace /> },

          // Vistas Antiguas Bodegas (siguen funcionando si acceden por URL directa)
          { path: ROUTES.WAREHOUSES, element: <WarehouseLandingPage /> },
          { path: '/bodegas/gestion', element: <WarehousesPage /> },
          { path: '/bodegas/dashboard', element: <DashboardPage /> },
          { path: '/bodegas/inventario', element: <InventoryPage /> },
          { path: '/bodegas/movimientos', element: <MovementsPage /> },
          { path: '/bodegas/alertas', element: <AlertsPage /> },
        ],
      },
    ],
  },
]);
