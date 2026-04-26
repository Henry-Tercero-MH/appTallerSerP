import { createHashRouter, Navigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import ProtectedLayout from '../layouts/ProtectedLayout';
import AppLayout from '../layouts/AppLayout';
import LoginPage from '../features/auth/LoginPage';

import POSPage from '../features/pos/POSPage';
import WorkshopPage from '../features/workshop/WorkshopPage';
import ClientsPage from '../features/clients/ClientsPage';
import SalesHistoryPage from '../features/sales/SalesHistoryPage';
import ReportsPage from '../features/sales/ReportsPage';
import InventoryPage from '../features/warehouses/InventoryPage';
import SystemDashboard from '../features/dashboard/SystemDashboard';
import UsersPage from '../features/users/UsersPage';
import SettingsPage from '../features/settings/SettingsPage';
import AuditLogPage from '../features/audit/AuditLogPage';
import CashRegisterPage from '../features/cash/CashRegisterPage';
import AdminRoute from '../layouts/AdminRoute';

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
          { index: true,             element: <SystemDashboard /> },
          { path: ROUTES.DASHBOARD,  element: <SystemDashboard /> },
          { path: ROUTES.POS,        element: <POSPage /> },
          { path: ROUTES.HISTORY,    element: <SalesHistoryPage /> },
          { path: ROUTES.WORKSHOP,   element: <WorkshopPage /> },
          { path: ROUTES.INVENTORY,  element: <InventoryPage /> },
          { path: ROUTES.CLIENTS,    element: <ClientsPage /> },
          { path: ROUTES.REPORTS,    element: <ReportsPage /> },
          {
            element: <AdminRoute />,
            children: [
              { path: ROUTES.USERS,    element: <UsersPage /> },
              { path: ROUTES.SETTINGS, element: <SettingsPage /> },
              { path: ROUTES.AUDIT,    element: <AuditLogPage /> },
              { path: ROUTES.CASH,     element: <CashRegisterPage /> },
            ],
          },
          { path: '*', element: <Navigate to={ROUTES.DASHBOARD} replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={ROUTES.LOGIN} replace /> },
]);
