import { useState } from 'react';
import { useWarehouseStore } from './warehouseStore';
import WarehouseForm from './WarehouseForm';
import Modal from '../../components/Modal';

export default function WarehousesPage() {
  const { warehouses, create, update, remove, restore } = useWarehouseStore();
  const [modal, setModal] = useState(null); // null | 'create' | { edit: w } | { confirm: w }
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [toast, setToast] = useState(null);

  const showMessage = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = (data) => {
    if (modal?.edit) {
      update(modal.edit.id, data);
      showMessage('Bodega actualizada correctamente');
    } else {
      create(data);
      showMessage('Bodega creada exitosamente');
    }
    setModal(null);
  };

  const handleDelete = (w) => {
    remove(w.id);
    showMessage(`Bodega "${w.name}" desactivada`, 'warning');
    setModal(null);
  };

  const filteredWarehouses = warehouses.filter(w => {
    if (!showInactive && !w.isActive) return false;
    if (search) {
      const qs = search.toLowerCase();
      return w.name.toLowerCase().includes(qs) || w.code.toLowerCase().includes(qs);
    }
    return true;
  });

  return (
    <div className="page print-friendly">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Gestión de Bodegas</h1>
          <p className="page-subtitle">Administra las ubicaciones físicas del inventario</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={() => window.print()}>🖨️ Imprimir</button>
          <button className="btn btn-primary" onClick={() => setModal('create')}>+ Nueva Bodega</button>
        </div>
      </div>

      <div className="toolbar no-print">
        <input
          className="search-input"
          type="text"
          placeholder="Buscar por código o nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="toggle-label">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inactivas
        </label>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Dirección</th>
              <th>Descripción</th>
              <th>Estado</th>
              <th className="no-print">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredWarehouses.length === 0 && (
              <tr><td colSpan={6} className="empty-row">No hay bodegas registradas.</td></tr>
            )}
            {filteredWarehouses.map(w => (
              <tr key={w.id} className={!w.isActive ? 'row-inactive' : ''}>
                <td><span className="code-badge">{w.code}</span></td>
                <td style={{ fontWeight: '600' }}>{w.name}</td>
                <td>{w.address || '-'}</td>
                <td style={{ color: '#666' }}>{w.description || '-'}</td>
                <td>
                  <span className={`badge ${w.isActive ? 'badge-active' : 'badge-inactive'}`} style={{ backgroundColor: w.isActive ? '#e2f5e9' : '#ffebee', color: w.isActive ? '#1b5e20' : '#c62828', padding: '2px 8px', borderRadius: '12px' }}>
                    {w.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </td>
                <td className="no-print">
                  <div className="action-btns" style={{ display: 'flex', gap: '4px' }}>
                    {w.isActive ? (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => setModal({ edit: w })}>Editar</button>
                        <button className="btn btn-sm btn-danger-ghost" onClick={() => setModal({ confirm: w })}>Desactivar</button>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-ghost" onClick={() => restore(w.id)}>Activar</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      {(modal === 'create' || modal?.edit) && (
        <Modal title={modal === 'create' ? 'Registrar Nueva Bodega' : 'Editar Bodega'} onClose={() => setModal(null)}>
          <WarehouseForm initial={modal?.edit ?? null} onSave={handleSave} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {modal?.confirm && (
        <Modal title="Confirmar Acción" onClose={() => setModal(null)}>
          <p className="confirm-text">¿Seguro que deseas desactivar la bodega <strong>{modal.confirm.name}</strong>?</p>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={() => handleDelete(modal.confirm)}>Desactivar</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
