import { useState } from 'react';

export default function ProductForm({ initial, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    code: initial?.code || '',
    name: initial?.name || '',
    category: initial?.category || 'Aceites y lubricantes',
    description: initial?.description || '',
    brand: initial?.brand || '',
    price: initial?.price || 0,
    stock: initial?.stock || 0,
    location: initial?.location || '',
    condition: initial?.condition || 'Nuevo',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Código SKU *</label>
        <input 
          type="text" 
          name="code" 
          className="form-control" 
          value={formData.code} 
          onChange={handleChange} 
          required 
        />
      </div>

      <div className="form-group">
        <label>Nombre del Producto *</label>
        <input 
          type="text" 
          name="name" 
          className="form-control" 
          value={formData.name} 
          onChange={handleChange} 
          required 
        />
      </div>

      <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Categoría</label>
          <select name="category" className="form-control" value={formData.category} onChange={handleChange}>
            <option>Aceites y lubricantes</option>
            <option>Frenos e hidráulico</option>
            <option>Filtros</option>
            <option>Bujías y encendido</option>
            <option>Químicos y aerosoles</option>
            <option>Refrigeración</option>
            <option>Eléctrico</option>
            <option>Otro</option>
          </select>
        </div>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Marca</label>
          <input 
            type="text" 
            name="brand" 
            className="form-control" 
            value={formData.brand} 
            onChange={handleChange} 
          />
        </div>
      </div>

      <div className="form-group">
        <label>Descripción / Compatible con</label>
        <input 
          type="text" 
          name="description" 
          className="form-control" 
          value={formData.description} 
          onChange={handleChange} 
        />
      </div>

      <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Precio Unitario Q</label>
          <input 
            type="number" 
            name="price" 
            className="form-control" 
            value={formData.price} 
            onChange={handleChange} 
            min="0" 
            step="0.01"
          />
        </div>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Stock Inicial</label>
          <input 
            type="number" 
            name="stock" 
            className="form-control" 
            value={formData.stock} 
            onChange={handleChange} 
            min="0"
            disabled={!!initial}
          />
        </div>
      </div>

      <div className="form-row" style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Ubicación (Estante/Fila)</label>
          <input 
            type="text" 
            name="location" 
            className="form-control" 
            value={formData.location} 
            onChange={handleChange} 
          />
        </div>
        <div className="form-group" style={{ flex: 1, margin: 0 }}>
          <label>Condición</label>
          <select name="condition" className="form-control" value={formData.condition} onChange={handleChange}>
            <option>Nuevo</option>
            <option>Seminuevo</option>
            <option>Antiguo</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          {initial ? 'Actualizar Producto' : 'Guardar Producto'}
        </button>
      </div>
    </form>
  );
}
