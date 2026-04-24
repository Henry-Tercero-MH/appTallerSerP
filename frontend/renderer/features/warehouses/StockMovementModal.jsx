import { useState } from 'react';

export default function StockMovementModal({ product, isEntry, onSave, onCancel }) {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState('');
  
  const typeLabel = isEntry ? 'Entrada' : 'Salida';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isEntry && qty > product.stock) {
      alert('Error: La cantidad de salida no puede ser mayor al stock actual.');
      return;
    }
    onSave({
      productId: product.id,
      type: isEntry ? 'entry' : 'exit',
      qty,
      notes
    });
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-group" style={{ marginBottom: '16px' }}>
        <p style={{ margin: 0, marginBottom: '8px', color: '#555' }}>
          Registrar <strong>{typeLabel.toLowerCase()}</strong> para:
        </p>
        <p style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>
          {product.name} — {product.brand}
        </p>
        <p style={{ fontSize: '14px', color: '#777', marginTop: '4px' }}>
          Código: {product.code} | Stock actual: {product.stock}
        </p>
      </div>

      <div className="form-group">
        <label>Cantidad de {typeLabel.toLowerCase()} *</label>
        <input 
          type="number" 
          className="form-control" 
          value={qty} 
          onChange={(e) => setQty(Number(e.target.value))} 
          min="1" 
          max={isEntry ? 9999 : product.stock}
          required 
        />
      </div>

      <div className="form-group" style={{ marginBottom: '24px' }}>
        <label>Notas / Motivo *</label>
        <textarea 
          className="form-control" 
          value={notes} 
          onChange={(e) => setNotes(e.target.value)} 
          placeholder={isEntry ? "Ej. Compra a proveedor..." : "Ej. O.T. #123 ó venta directa..."}
          required 
          rows={3}
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={`btn ${isEntry ? 'btn-primary' : 'btn-danger'}`}>
          Confirmar {typeLabel}
        </button>
      </div>
    </form>
  );
}