import { createHashRouter, Navigate } from 'react-router-dom';
import AuthLayout from '../layouts/AuthLayout';
import ProtectedLayout from '../layouts/ProtectedLayout';
import AppLayout from '../layouts/AppLayout';
import LoginPage from '../features/auth/LoginPage';
import { useAuthContext } from '../features/auth/AuthContext';

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
import PurchasesPage from '../features/purchases/PurchasesPage';
import ReceivablesPage from '../features/receivables/ReceivablesPage';
import QuotesPage from '../features/quotes/QuotesPage';
import ExpensesPage from '../features/expenses/ExpensesPage';
import SuppliersPage from '../features/purchases/SuppliersPage';
import AdminRoute from '../layouts/AdminRoute';

import { ROUTES } from '../lib/constants';

function RoleIndex() {
  const { user } = useAuthContext();
  if (user?.role === 'admin') return <SystemDashboard />;
  return <Navigate to={ROUTES.POS} replace />;
}

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
          { index: true,             element: <RoleIndex /> },
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
              { path: ROUTES.USERS,       element: <UsersPage /> },
              { path: ROUTES.SETTINGS,    element: <SettingsPage /> },
              { path: ROUTES.AUDIT,       element: <AuditLogPage /> },
              { path: ROUTES.CASH,        element: <CashRegisterPage /> },
              { path: ROUTES.PURCHASES,   element: <PurchasesPage /> },
              { path: ROUTES.RECEIVABLES, element: <ReceivablesPage /> },
              { path: ROUTES.QUOTES,      element: <QuotesPage /> },
              { path: ROUTES.EXPENSES,    element: <ExpensesPage /> },
              { path: ROUTES.SUPPLIERS,   element: <SuppliersPage /> },
            ],
          },
          { path: '*', element: <Navigate to={ROUTES.POS} replace /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={ROUTES.LOGIN} replace /> },
]);
