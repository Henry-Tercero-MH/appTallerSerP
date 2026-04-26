-- 013_purchases.sql
-- Proveedores y órdenes de compra.

CREATE TABLE IF NOT EXISTS suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  status       TEXT    NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','received','cancelled')),
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_by_name TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  received_at  TEXT,
  total_cost   REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id   INTEGER REFERENCES products(id),
  product_name TEXT    NOT NULL,
  product_code TEXT,
  qty_ordered  REAL    NOT NULL CHECK (qty_ordered > 0),
  qty_received REAL    NOT NULL DEFAULT 0,
  unit_cost    REAL    NOT NULL DEFAULT 0
);

-- Costo de compra en productos (para calcular margen)
ALTER TABLE products ADD COLUMN cost REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status   ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_items_order     ON purchase_items(order_id);
