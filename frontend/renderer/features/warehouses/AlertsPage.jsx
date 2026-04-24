import { useInventoryStore } from './inventoryStore';
import AlertsPanel from './AlertsPanel';

export default function AlertsPage() {
  const { lowStockProducts } = useInventoryStore();

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Alertas de Stock</h1>
          <p className="page-subtitle">Avisos por bajo inventario y productos por vencer</p>
        </div>
      </div>
      
      {lowStockProducts?.length > 0 ? (
        <AlertsPanel lowStockProducts={lowStockProducts} />
      ) : (
        <div className="table-wrapper card-container" style={{ padding: '4rem', textAlign: 'center', color: '#666' }}>
          <p style={{ fontSize: '1.2rem', marginBottom: '8px' }}>✅ Todo está en orden</p>
          <p>No hay alertas de stock bajo en este momento.</p>
        </div>
      )}
    </div>
  );
}
