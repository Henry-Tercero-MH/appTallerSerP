import { useState, useEffect } from 'react';

const EMPTY = { code: '', name: '', description: '', address: '' };

export default function WarehouseForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(initial ? { ...EMPTY, ...initial } : EMPTY);
    setErrors({});
  }, [initial]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' }));
  }

  function validate() {
    const errs = {};
    if (!form.code.trim()) errs.code = 'El código es requerido';
    else if (!/^[A-Z]{2,4}-\d{3,}$/.test(form.code.trim()))
      errs.code = 'Formato: BDG-001';
    if (!form.name.trim()) errs.name = 'El nombre es requerido';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({ ...form, code: form.code.toUpperCase().trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="warehouse-form">
      <div className="form-row">
        <div className="field-group">
          <label htmlFor="code">Código *</label>
          <input
            id="code"
            name="code"
            value={form.code}
            onChange={handleChange}
            placeholder="BDG-001"
            disabled={!!initial}
          />
          {errors.code && <span className="field-error">{errors.code}</span>}
        </div>

        <div className="field-group field-grow">
          <label htmlFor="name">Nombre *</label>
          <input
            id="name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Bodega Central"
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>
      </div>

      <div className="field-group">
        <label htmlFor="description">Descripción</label>
        <textarea
          id="description"
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Descripción opcional"
          rows={2}
        />
      </div>

      <div className="field-group">
        <label htmlFor="address">Dirección</label>
        <input
          id="address"
          name="address"
          value={form.address}
          onChange={handleChange}
          placeholder="Dirección de la bodega"
        />
      </div>

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary">
          {initial ? 'Guardar cambios' : 'Crear bodega'}
        </button>
      </div>
    </form>
  );
}
