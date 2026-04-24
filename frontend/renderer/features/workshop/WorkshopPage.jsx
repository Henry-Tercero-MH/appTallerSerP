import { useState } from 'react';
import { MdAdd, MdBuild, MdCheckCircle, MdEdit, MdDirectionsCar } from 'react-icons/md';

const MOCK_ORDERS = [
  { id: 'OT-001', plate: 'P-123ABC', client: 'Juan Perez', car: 'Toyota Hilux 2018', status: 'En Reparación', mechanic: 'Carlos Ruiz', date: '2026-04-23' },
  { id: 'OT-002', plate: 'M-456DEF', client: 'Maria Gomez', car: 'Honda Civic 2020', status: 'Esperando Repuesto', mechanic: 'Sin Asignar', date: '2026-04-22' },
  { id: 'OT-003', plate: 'C-789GHI', client: 'Empresa SA', car: 'Ford CRV 2015', status: 'Listo para Entrega', mechanic: 'Roberto Paz', date: '2026-04-21' },
];

export default function WorkshopPage() {
  const [activeTab, setActiveTab] = useState('orders');

  const getStatusBadge = (status) => {
    switch (status) {
      case 'En Reparación': return <span className="badge badge-active" style={{ background: '#fff3cd', color: '#856404', borderColor: '#ffeeba' }}>{status}</span>;
      case 'Listo para Entrega': return <span className="badge badge-active">{status}</span>;
      case 'Esperando Repuesto': return <span className="badge badge-inactive" style={{ background: '#f8d7da', color: '#721c24', borderColor: '#f5c6cb' }}>{status}</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de Taller</h1>
          <p className="page-subtitle">Recepción de vehículos y seguimiento de reparaciones</p>
        </div>
        <button className="btn btn-primary" style={{ background: 'var(--red-600)' }}>
          <MdAdd /> Nueva Orden
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--blue-600)' }}>3</span>
          <span className="stat-label">Vehículos en Taller</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--red-600)' }}>1</span>
          <span className="stat-label">Esperando Repuesto</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--green-600)' }}>1</span>
          <span className="stat-label">Listos para Entrega</span>
        </div>
      </div>

      <div className="card-container">
        <div className="tabs">
          <button className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`} onClick={() => setActiveTab('orders')}>
            <MdBuild size={18} /> Órdenes Activas
          </button>
          <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
            <MdCheckCircle size={18} /> Historial Completado
          </button>
        </div>

        <div className="tab-container">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>No. Orden</th>
                  <th>Vehículo</th>
                  <th>Cliente</th>
                  <th>Mecánico</th>
                  <th>Estado</th>
                  <th>Ingreso</th>
                  <th style={{ width: '80px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {activeTab === 'history' ? (
                  <tr><td colSpan={7} className="empty-row">No hay historial para mostrar.</td></tr>
                ) : (
                  MOCK_ORDERS.map(o => (
                    <tr key={o.id}>
                      <td><span className="code-badge" style={{ fontSize: '13px' }}>{o.id}</span></td>
                      <td>
                        <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MdDirectionsCar color="var(--gray-500)"/> {o.plate}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--gray-500)' }}>{o.car}</div>
                      </td>
                      <td>{o.client}</td>
                      <td>{o.mechanic}</td>
                      <td>{getStatusBadge(o.status)}</td>
                      <td>{o.date}</td>
                      <td>
                        <button className="btn btn-sm btn-ghost"><MdEdit /> Detalle</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
