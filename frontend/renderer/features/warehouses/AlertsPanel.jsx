export default function AlertsPanel({ lowStockProducts }) {
  if (!lowStockProducts || lowStockProducts.length === 0) {
    return null;
  }

  return (
    <div className="alerts-panel card-container" style={{ backgroundColor: 'var(--red-50)', padding: '20px', borderLeft: '4px solid var(--red-600)', marginBottom: '24px' }}>
      <h3 style={{ color: 'var(--red-600)', marginTop: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        ⚠️ Alerta de Stock Bajo
      </h3>
      <p style={{ margin: 0, marginBottom: '16px', color: '#444' }}>
        Los siguientes productos están por agotarse:
      </p>
      
      <div className="table-wrapper" style={{ backgroundColor: '#fff', borderRadius: '6px', border: '1px solid #f5d6d6', overflow: 'hidden' }}>
        <table className="data-table" style={{ margin: 0 }}>
          <thead>
            <tr style={{ backgroundColor: '#fdf2f2' }}>
              <th style={{ color: 'var(--red-600)', borderBottom: '1px solid #f5d6d6' }}>Código</th>
              <th style={{ color: 'var(--red-600)', borderBottom: '1px solid #f5d6d6' }}>Producto</th>
              <th style={{ color: 'var(--red-600)', borderBottom: '1px solid #f5d6d6' }}>Marca</th>
              <th style={{ color: 'var(--red-600)', borderBottom: '1px solid #f5d6d6' }}>Stock Actual</th>
            </tr>
          </thead>
          <tbody>
            {lowStockProducts.map(p => (
              <tr key={p.id}>
                <td><span className="code-badge" style={{ backgroundColor: '#fff', color: '#333', border: '1px solid #eee' }}>{p.code}</span></td>
                <td style={{ fontWeight: '600', color: '#111' }}>{p.name}</td>
                <td style={{ color: '#555' }}>{p.brand}</td>
                <td><strong style={{ color: 'var(--red-600)', fontSize: '15px' }}>{p.stock}</strong> unidades</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
