import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../features/auth/AuthContext';
import { ROUTES, APP_NAME } from '../lib/constants';
import {
  MdPointOfSale,
  MdInventory,
  MdPeopleOutline,
  MdInsertChartOutlined,
  MdReceiptLong,
  MdExitToApp
} from 'react-icons/md';

const NAV = [
  { to: ROUTES.POS, label: 'Facturar', icon: MdPointOfSale },
  { to: ROUTES.HISTORY, label: 'Historial', icon: MdReceiptLong },
  { to: ROUTES.INVENTORY, label: 'Productos / Stock', icon: MdInventory },
  { to: ROUTES.CLIENTS, label: 'Clientes', icon: MdPeopleOutline },
  { to: ROUTES.DASHBOARD, label: 'Reportes', icon: MdInsertChartOutlined, disabled: true },
];

export default function AppLayout() {
  const { user, logout } = useAuthContext();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate(ROUTES.LOGIN);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">▦</span>
          <span className="brand-name">{APP_NAME}</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, disabled }) =>
            disabled ? (
              <span key={to} className="nav-item nav-item-disabled" title="Próximamente">
                <Icon className="nav-icon" />
                <span className="nav-label">{label}</span>
                <span className="soon-badge">Pronto</span>
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `nav-item${isActive ? ' nav-item-active' : ''}`
                }
              >
                <Icon className="nav-icon" />
                <span className="nav-label">{label}</span>
              </NavLink>
            )
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{user?.fullName?.[0] ?? 'Y'}</div>
            <div className="user-details">
              <span className="user-name">{user?.fullName || 'Yeison Alvarado'}</span>
              <span className="user-role">{user?.role || 'Admin'}</span>
            </div>
          </div>
          <button className="btn-logout-full" onClick={handleLogout}>
            <MdExitToApp className="logout-icon" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
