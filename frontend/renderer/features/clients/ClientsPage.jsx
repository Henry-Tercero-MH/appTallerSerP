import { useState } from 'react';
import { MdAdd, MdPerson, MdEmail, MdPhone, MdDirectionsCar, MdEdit } from 'react-icons/md';

const MOCK_CLIENTS = [
  { id: 'CLI-001', name: 'Juan Perez', email: 'juan@demo.com', phone: '555-0101', cars: 2, status: 'Activo' },
  { id: 'CLI-002', name: 'Maria Gomez', email: 'maria@demo.com', phone: '555-0102', cars: 1, status: 'Activo' },
  { id: 'CLI-003', name: 'Empresa SA', email: 'contacto@empresa.com', phone: '555-0103', cars: 5, status: 'Empresa' },
  { id: 'CLI-004', name: 'Luis Torres', email: 'luis@demo.com', phone: '555-0104', cars: 0, status: 'Inactivo' },
];

export default function ClientsPage() {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredClients = MOCK_CLIENTS.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Directorio de Clientes</h1>
          <p className="page-subtitle">Gestión de clientes y sus vehículos asociados</p>
        </div>
        <button className="btn btn-primary" style={{ background: 'var(--red-600)' }}>
          <MdAdd /> Nuevo Cliente
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--blue-600)' }}>248</span>
          <span className="stat-label">Total Clientes</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--green-600)' }}>15</span>
          <span className="stat-label">Nuevos este mes</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--red-600)' }}>342</span>
          <span className="stat-label">Vehículos Registrados</span>
        </div>
      </div>

      <div className="card-container">
        <div className="search-bar" style={{ padding: '16px', borderBottom: '1px solid var(--gray-200)' }}>
          <input 
            type="text" 
            placeholder="Buscar por nombre o correo electrónico..." 
            className="input-field" 
            style={{ width: '100%', maxWidth: '400px' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID Cliente</th>
                <th>Datos Personales</th>
                <th>Contacto</th>
                <th>Vehículos</th>
                <th>Estado</th>
                <th style={{ width: '80px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr><td colSpan={6} className="empty-row">No se encontraron clientes.</td></tr>
              ) : (
                filteredClients.map(c => (
                  <tr key={c.id}>
                    <td><span className="code-badge">{c.id}</span></td>
                    <td>
                      <div style={{ fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MdPerson color="var(--gray-500)"/> {c.name}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', color: 'var(--gray-600)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MdEmail /> {c.email}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MdPhone /> {c.phone}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500' }}>
                        <MdDirectionsCar color="var(--gray-500)"/> {c.cars} registrados
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${c.status === 'Inactivo' ? 'badge-inactive' : 'badge-active'}`}>
                        {c.status}
                      </span>
                    </td>
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
  );
}
