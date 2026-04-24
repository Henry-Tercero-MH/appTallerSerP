-- 001_init.sql
-- Preserva el esquema actual (products, sales, sale_items) y la data semilla.
-- No cambia estructura: solo mueve la creacion a una migracion versionada.
-- Los redisenios de negocio iran en migraciones posteriores.

CREATE TABLE IF NOT EXISTS products (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  code  TEXT    NOT NULL UNIQUE,
  name  TEXT    NOT NULL,
  price REAL    NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL    NOT NULL,
  date  TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  price      REAL    NOT NULL,
  FOREIGN KEY (sale_id)    REFERENCES sales(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Data semilla. INSERT OR IGNORE garantiza idempotencia si alguna instalacion
-- ya la tuviera (por ejemplo una DB preexistente del bootstrap antiguo).
INSERT OR IGNORE INTO products (code, name, price, stock) VALUES
  ('ACE-001', 'Aceite de Motor 10W40 Chevron',    45.00,  12),
  ('FIL-002', 'Filtro de Aceite ECOBREX',         15.50,   5),
  ('FRE-003', 'Pastillas de Freno Ceramicas',    120.00,   8),
  ('BAT-004', 'Bateria 12V 70Ah LTH',            650.00,   2),
  ('SRV-001', 'Servicio de Diagnostico Escaner', 150.00, 999);
