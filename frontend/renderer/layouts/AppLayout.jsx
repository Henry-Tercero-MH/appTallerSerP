import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../features/auth/AuthContext';
import { useBusinessSettings } from '../hooks/useSettings';
import { ROUTES } from '../lib/constants';
import {
  MdDashboard,
  MdPointOfSale,
  MdInventory,
  MdPeopleOutline,
  MdInsertChartOutlined,
  MdReceiptLong,
  MdBuild,
  MdExitToApp,
  MdManageAccounts,
  MdSettings,
  MdChevronLeft,
  MdChevronRight,
  MdShield,
} from 'react-icons/md';
import { Landmark, ShoppingCart, Wallet, FileText } from 'lucide-react';

const NAV = [
  { to: ROUTES.DASHBOARD, label: 'Dashboard',         icon: MdDashboard },
  { to: ROUTES.POS,       label: 'Facturar',          icon: MdPointOfSale },
  { to: ROUTES.HISTORY,   label: 'Historial',         icon: MdReceiptLong },
  { to: ROUTES.INVENTORY, label: 'Productos / Stock', icon: MdInventory },
  { to: ROUTES.CLIENTS,   label: 'Clientes',          icon: MdPeopleOutline },
  { to: ROUTES.REPORTS,   label: 'Reportes',          icon: MdInsertChartOutlined },
];

const ADMIN_NAV = [
  { to: ROUTES.CASH,      label: 'Caja',           icon: Landmark },
  { to: ROUTES.PURCHASES,   label: 'Compras',            icon: ShoppingCart },
  { to: ROUTES.RECEIVABLES, label: 'Cuentas por Cobrar', icon: Wallet },
  { to: ROUTES.QUOTES,      label: 'Cotizaciones',       icon: FileText },
  { to: ROUTES.USERS,     label: 'Usuarios',        icon: MdManageAccounts },
  { to: ROUTES.SETTINGS,  label: 'Configuración',   icon: MdSettings },
  { to: ROUTES.AUDIT,     label: 'Bitácora',        icon: MdShield },
];

/** @returns {[boolean, () => void]} */
function useCollapsed() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );
  function toggle() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }
  return /** @type {[boolean, () => void]} */ ([collapsed, toggle]);
}

export default function AppLayout() {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();
  const [collapsed, toggleCollapsed] = useCollapsed();

  function handleLogout() {
    logout();
    navigate(ROUTES.LOGIN);
  }

  const isAdmin = user?.role === 'admin';
  const { name: appName, logo } = useBusinessSettings();

  return (
    <div className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          {!collapsed && (
            logo
              ? <img src={logo} alt={appName} className="brand-logo" />
              : <span className="brand-icon">▦</span>
          )}
          {!collapsed && <span className="brand-name">{appName}</span>}
          <button
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? <MdChevronRight /> : <MdChevronLeft />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `nav-item${isActive ? ' nav-item-active' : ''}${collapsed ? ' nav-item-collapsed' : ''}`
              }
            >
              <Icon className="nav-icon" />
              {!collapsed && <span className="nav-label">{label}</span>}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              {!collapsed && <div className="nav-section-label">Administración</div>}
              {collapsed && <div className="nav-section-divider" />}
              {ADMIN_NAV.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    `nav-item${isActive ? ' nav-item-active' : ''}${collapsed ? ' nav-item-collapsed' : ''}`
                  }
                >
                  <Icon className="nav-icon" />
                  {!collapsed && <span className="nav-label">{label}</span>}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="btn-logout-full" onClick={handleLogout} title={collapsed ? 'Cerrar sesión' : undefined}>
            <MdExitToApp className="logout-icon" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="main-wrapper">
        {/* ── Topbar ── */}
        <header className="topbar">
          <div className="topbar-left">
            {/* Título de la página actual lo pone cada página vía PageHeader */}
          </div>
          <div className="topbar-right">
            <div className="topbar-user">
              <div className="topbar-avatar">
                {user?.avatar
                  ? <img src={user.avatar} alt={user.full_name} className="topbar-avatar-img" />
                  : (user?.full_name?.[0]?.toUpperCase() ?? '?')
                }
              </div>
              <div className="topbar-user-info">
                <span className="topbar-user-name">{user?.full_name ?? '—'}</span>
                <span className="topbar-user-role">{user?.role ?? ''}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
