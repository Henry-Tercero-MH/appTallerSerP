-- 010_sales_void_audit.sql
-- Anulación de ventas + bitácora general de la aplicación.

-- 1. Estado de la venta (activa / anulada)
ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'voided'));

-- 2. Registro de anulaciones (quién anuló, por qué y cuándo)
CREATE TABLE IF NOT EXISTS sale_voids (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL REFERENCES sales(id),
  reason     TEXT    NOT NULL,
  voided_by  INTEGER REFERENCES users(id),
  voided_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

-- 3. Bitácora general de eventos del sistema
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT NOT NULL,           -- 'sale_voided', 'sale_created', 'settings_changed', etc.
  entity       TEXT,                    -- 'sale', 'product', 'user', ...
  entity_id    INTEGER,
  description  TEXT,                    -- texto legible del evento
  payload_json TEXT,                    -- datos extra en JSON (opcional)
  user_id      INTEGER REFERENCES users(id),
  user_name    TEXT,                    -- snapshot del nombre al momento del evento
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity     ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
