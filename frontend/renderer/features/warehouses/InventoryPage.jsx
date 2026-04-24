import { useState } from 'react';
import { useInventoryStore } from './inventoryStore';
import ProductForm from './ProductForm';
import StockMovementModal from './StockMovementModal';
import Modal from '../../components/Modal';

export default function InventoryPage() {
  const { products, movements, lowStockProducts, createProduct, updateProduct, removeProduct, restoreProduct, addMovement } = useInventoryStore();
  const [modal, setModal] = useState(null); // null | 'productCreate' | { productEdit: p } | { mvtEntry: p } | { mvtExit: p } | { confirmDeact: p }
  const [activeTab, setActiveTab] = useState('inventory'); // 'inventory' | 'movements'
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [toast, setToast] = useState(null);

  const showMessage = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleProductSave = (data) => {
    if (modal?.productEdit) {
      updateProduct(modal.productEdit.id, data);
      showMessage('Producto actualizado correctamente');
    } else {
      createProduct(data);
      showMessage('Producto agregado al inventario');
    }
    setModal(null);
  };

  const handleMovementSave = (mvtData) => {
    addMovement(mvtData);
    showMessage(`Movimiento de ${mvtData.type === 'entry' ? 'entrada' : 'salida'} registrado`);
    setModal(null);
  };

  const handleDelete = (p) => {
    removeProduct(p.id);
    showMessage(`Producto "${p.name}" desactivado`, 'warning');
    setModal(null);
  };

  const filteredProducts = products.filter(p => {
    if (!showInactive && !p.isActive) return false;
    if (search) {
      const qs = search.toLowerCase();
      return p.name.toLowerCase().includes(qs) || p.code.toLowerCase().includes(qs) || p.category.toLowerCase().includes(qs);
    }
    return true;
  });

  const totalStockStr = products.reduce((acc, p) => acc + (p.isActive ? p.stock : 0), 0);

  return (
    <div className="page print-friendly">
      <div className="page-header no-print">
        <div>
          <h1 className="page-title">Bodega Central</h1>
          <p className="page-subtitle">Gestión de inventario del taller</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost" onClick={() => window.print()}>🖨️ Imprimir Reporte</button>
          <button className="btn btn-primary" onClick={() => setModal('productCreate')}>+ Nuevo Producto</button>
        </div>
      </div>

      <div className="stats-row no-print">
        <div className="stat-card">
          <span className="stat-value">{products.filter(p => p.isActive).length}</span>
          <span className="stat-label">Items Activos</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{totalStockStr}</span>
          <span className="stat-label">Unidades Totales</span>
        </div>
        <div className="stat-card" style={lowStockProducts.length > 0 ? { borderLeft: '4px solid var(--red-600)' } : {}}>
          <span className="stat-value" style={lowStockProducts.length > 0 ? { color: 'var(--red-600)' } : {}}>
            {lowStockProducts.length}
          </span>
          <span className="stat-label">Items con Stock Bajo</span>
        </div>
      </div>

      <div className="card-container no-print">
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === 'inventory' ? 'active' : ''}`} 
            onClick={() => setActiveTab('inventory')}
          >
            📊 Listado de Inventario
          </button>
          <button 
            className={`tab-btn ${activeTab === 'movements' ? 'active' : ''}`} 
            onClick={() => setActiveTab('movements')}
          >
            📋 Historial de Movimientos
          </button>
        </div>

      {activeTab === 'inventory' && (
        <div className="tab-container">
          <div className="toolbar no-print">
            <input
              className="search-input"
              type="text"
              placeholder="Buscar por código, nombre o categoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="toggle-label toggle-switch" style={{ marginLeft: 'auto' }}>
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Mostrar inactivos
            </label>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Ubicación</th>
                  <th>Stock</th>
                  <th className="no-print">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={6} className="empty-row">No hay productos que coincidan con la búsqueda.</td></tr>
                )}
                {filteredProducts.map(p => (
                  <tr key={p.id} className={!p.isActive ? 'row-inactive' : (p.stock <= p.minStock ? 'row-warning' : '')}>
                    <td><span className="code-badge">{p.code}</span></td>
                    <td>
                      <div style={{ fontWeight: '600' }}>{p.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{p.brand} | {p.condition}</div>
                    </td>
                    <td>{p.category}</td>
                    <td>{p.location}</td>
                    <td>
                      <strong style={{ color: p.stock <= p.minStock ? 'var(--red-600)' : 'inherit', fontSize: '16px' }}>
                        {p.stock}
                      </strong>
                    </td>
                    <td className="no-print">
                      <div className="action-btns" style={{ display: 'flex', gap: '4px' }}>
                        {p.isActive ? (
                          <>
                            <button className="btn btn-sm btn-primary" style={{ padding: '4px 8px' }} onClick={() => setModal({ mvtEntry: p })}>+</button>
                            <button className="btn btn-sm" style={{ padding: '4px 8px', backgroundColor: '#e0e0e0', color: '#333' }} onClick={() => setModal({ mvtExit: p })}>-</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => setModal({ productEdit: p })}>Editar</button>
                            <button className="btn btn-sm btn-danger-ghost" onClick={() => setModal({ confirmDeact: p })}>Desactivar</button>
                          </>
                        ) : (
                          <button className="btn btn-sm btn-ghost" onClick={() => restoreProduct(p.id)}>Activar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'movements' && (
        <div className="tab-container">
          <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Tipo</th>
                <th>Producto (Ref)</th>
                <th>Cant.</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 && (
                <tr><td colSpan={5} className="empty-row">No hay movimientos registrados.</td></tr>
              )}
              {movements.map(m => (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(m.createdAt).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${m.type === 'entry' ? 'badge-active' : 'badge-inactive'}`} style={{ backgroundColor: m.type === 'entry' ? '#e2f5e9' : '#ffebee', color: m.type === 'entry' ? '#1b5e20' : '#c62828' }}>
                      {m.type === 'entry' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td style={{ fontWeight: '500' }}>{m.productName}</td>
                  <td>
                    <strong style={{ color: m.type === 'entry' ? '#2e7d32' : '#c62828' }}>
                      {m.type === 'entry' ? '+' : '-'}{m.qty}
                    </strong>
                  </td>
                  <td style={{ color: '#555', fontSize: '14px' }}>{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
      </div>

      {/* Modales */}
      {(modal === 'productCreate' || modal?.productEdit) && (
        <Modal title={modal === 'productCreate' ? 'Ingresar Nuevo Producto' : 'Editar Producto'} onClose={() => setModal(null)}>
          <ProductForm initial={modal?.productEdit ?? null} onSave={handleProductSave} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {(modal?.mvtEntry || modal?.mvtExit) && (
        <Modal title={modal.mvtEntry ? 'Registrar Entrada' : 'Registrar Salida'} onClose={() => setModal(null)}>
          <StockMovementModal 
            product={modal.mvtEntry || modal.mvtExit} 
            isEntry={!!modal.mvtEntry} 
            onSave={handleMovementSave} 
            onCancel={() => setModal(null)} 
          />
        </Modal>
      )}

      {modal?.confirmDeact && (
        <Modal title="Confirmar Acción" onClose={() => setModal(null)}>
          <p className="confirm-text">¿Seguro que deseas desactivar el producto <strong>{modal.confirmDeact.name}</strong>? Ya no aparecerá en las listas activas.</p>
          <div className="form-actions">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-danger" onClick={() => handleDelete(modal.confirmDeact)}>Desactivar Producto</button>
          </div>
        </Modal>
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}
