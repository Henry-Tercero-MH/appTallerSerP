import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdDashboard,
  MdInventory,
  MdWarehouse,
  MdSwapHoriz,
  MdWarning,
} from 'react-icons/md';

const WAREHOUSE_MENU_OPTIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard General',
    icon: MdDashboard,
    path: '/bodegas/dashboard',
  },
  {
    id: 'warehouses',
    label: 'Gestión de Bodegas',
    icon: MdWarehouse,
    path: '/bodegas/gestion',
  },
  {
    id: 'inventory',
    label: 'Control de Inventario',
    icon: MdInventory,
    path: '/bodegas/inventario',
  },
  {
    id: 'movements',
    label: 'Movimientos',
    icon: MdSwapHoriz,
    path: '/bodegas/movimientos',
  },
  {
    id: 'alerts',
    label: 'Alertas de Stock',
    icon: MdWarning,
    path: '/bodegas/alertas',
  },
];

export default function WarehouseLandingPage() {
  const [activeMenu, setActiveMenu] = useState(null);
  const navigate = useNavigate();

  const handleMenuClick = (path, id) => {
    setActiveMenu(id);
    // Añadimos un pequeño delay para que se vea el estado activo antes de navegar
    setTimeout(() => {
      navigate(path);
    }, 150);
  };

  return (
    <div className="landing-container">
      <h2 className="menu-title">Menú Bodegas</h2>

      <div className="menu-grid">
        {WAREHOUSE_MENU_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = activeMenu === option.id;

          return (
            <button
              key={option.id}
              className={`menu-card ${isActive ? 'active' : ''}`}
              onClick={() => handleMenuClick(option.path, option.id)}
            >
              <div className="icon-wrapper">
                <Icon className="menu-icon" />
              </div>
              <span className="menu-label">{option.label}</span>
            </button>
          );
        })}
      </div>

      <style>{`
        .landing-container {
          padding: 2rem;
          min-height: 100%;
          background-color: #f8fafc;
        }

        .menu-title {
          text-align: center;
          color: var(--blue-900, #0d1733);
          font-size: 1.5rem;
          font-weight: 700;
          margin-bottom: 3rem;
        }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 1.5rem;
          max-width: 1200px;
          margin: 0 auto;
        }

        .menu-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
          gap: 1rem;
        }

        .menu-card:hover {
          background-color: var(--blue-50, #eef1f8);
        }

        .menu-card.active {
          background-color: var(--blue-50, #eef1f8);
          border-color: #cbd5e1;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }

        .icon-wrapper {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background-color: var(--blue-900, #0d1733);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease;
        }

        .menu-card:hover .icon-wrapper {
          transform: scale(1.05);
        }

        .menu-icon {
          font-size: 40px;
          color: white;
        }

        .menu-label {
          color: var(--blue-900, #0d1733);
          font-weight: 600;
          font-size: 1rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
