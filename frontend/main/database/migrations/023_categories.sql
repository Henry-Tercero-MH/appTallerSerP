-- 023_categories.sql
-- Tabla de categorias de productos. Reemplaza el arreglo hardcodeado en ProductForm.
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Semilla: categorias que estaban hardcodeadas en el frontend
INSERT OR IGNORE INTO categories (name) VALUES
  ('Aceites y lubricantes'),
  ('Frenos e hidráulico'),
  ('Filtros'),
  ('Bujías y encendido'),
  ('Químicos y aerosoles'),
  ('Refrigeración'),
  ('Eléctrico'),
  ('Servicios'),
  ('Otro');
