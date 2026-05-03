import _electron from "electron";
import path, { join } from "node:path";
import path$1 from "path";
import Database from "better-sqlite3";
import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
const __vite_glob_0_0 = "-- 001_init.sql\n-- Preserva el esquema actual (products, sales, sale_items) y la data semilla.\n-- No cambia estructura: solo mueve la creacion a una migracion versionada.\n-- Los redisenios de negocio iran en migraciones posteriores.\n\nCREATE TABLE IF NOT EXISTS products (\n  id    INTEGER PRIMARY KEY AUTOINCREMENT,\n  code  TEXT    NOT NULL UNIQUE,\n  name  TEXT    NOT NULL,\n  price REAL    NOT NULL,\n  stock INTEGER NOT NULL DEFAULT 0\n);\n\nCREATE TABLE IF NOT EXISTS sales (\n  id    INTEGER PRIMARY KEY AUTOINCREMENT,\n  total REAL    NOT NULL,\n  date  TEXT    DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS sale_items (\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  sale_id    INTEGER NOT NULL,\n  product_id INTEGER NOT NULL,\n  qty        INTEGER NOT NULL,\n  price      REAL    NOT NULL,\n  FOREIGN KEY (sale_id)    REFERENCES sales(id),\n  FOREIGN KEY (product_id) REFERENCES products(id)\n);\n\n";
const __vite_glob_0_1 = "-- 002_settings.sql\n-- Tabla de configuracion parametrica. `type` restringe los valores que el\n-- service aceptara y como deserializa `value` (que siempre se almacena TEXT).\n-- CHECK evita que la capa de datos quede en estado invalido incluso si alguien\n-- escribe sin pasar por el service.\n\nCREATE TABLE IF NOT EXISTS settings (\n  key         TEXT PRIMARY KEY,\n  value       TEXT NOT NULL,\n  type        TEXT NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'json')),\n  category    TEXT NOT NULL,\n  description TEXT NOT NULL DEFAULT '',\n  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n);\n\nCREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);\n\n-- Valores por defecto. INSERT OR IGNORE para no sobrescribir nada que el\n-- usuario haya editado antes (ej. tras reinstalar con DB preservada).\n-- Booleans se almacenan como '0'/'1' por consistencia con el serializador.\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\n  ('tax_rate',               '0.12',  'number',  'tax',      'IVA aplicado a ventas (decimal, ej. 0.12 = 12%)'),\n  ('tax_included_in_price',  '0',     'boolean', 'tax',      'Si los precios ya incluyen IVA'),\n  ('currency_code',          'GTQ',   'string',  'currency', 'Codigo ISO 4217 de la moneda'),\n  ('currency_symbol',        'Q',     'string',  'currency', 'Simbolo que se muestra en UI/tickets'),\n  ('decimal_places',         '2',     'number',  'currency', 'Decimales para mostrar importes'),\n  ('allow_negative_stock',   '0',     'boolean', 'inventory','Permitir vender sin stock disponible'),\n  ('business_name',          '',      'string',  'business', 'Razon social / nombre comercial'),\n  ('business_nit',           '',      'string',  'business', 'NIT del emisor'),\n  ('business_address',       '',      'string',  'business', 'Direccion fiscal'),\n  ('business_phone',         '',      'string',  'business', 'Telefono de contacto');\n";
const __vite_glob_0_2 = `-- 003_sales_tax_snapshot.sql
-- Snapshotea impuesto y moneda al momento de la venta. Motivo: reimprimir
-- un ticket mañana con la tasa vigente hoy da totales distintos al cobrado,
-- lo cual es legalmente y contablemente invalido. Ver Prompt 1, seccion
-- "Snapshot de impuestos en ventas".

ALTER TABLE sales ADD COLUMN subtotal         REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_rate_applied REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_amount       REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN currency_code    TEXT NOT NULL DEFAULT 'GTQ';

-- Backfill dev: filas pre-migracion no tienen desglose historico. Asumimos
-- total == subtotal con tax_amount=0 para que la suma cuadre. Esto NO es
-- fielmente historico; en una migracion de produccion habria que coordinar
-- con contabilidad un criterio acordado (ej. retro-aplicar tax_rate actual).
UPDATE sales SET subtotal = total WHERE subtotal = 0;
`;
const __vite_glob_0_3 = `-- 004_customers.sql
-- Tabla de clientes + enlace desde sales con snapshot de nombre/NIT.
--
-- Motivo snapshot: un cliente puede renombrarse o darse de baja despues de
-- emitir la venta. La reimpresion del ticket/factura debe mostrar el nombre
-- y NIT tal como estaban al momento del cobro. Misma logica que tax_rate
-- (ver migracion 003).
--
-- Sobre NIT: en Guatemala "C/F" (Consumidor Final) es un NIT valido y se
-- repite, asi que NO hay UNIQUE sobre la columna. Validacion fina queda en
-- la capa de servicio si se requiere.

CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nit         TEXT    NOT NULL DEFAULT 'C/F',
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  address     TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_nit  ON customers(nit);

-- Seed del cliente "Consumidor Final". id=1 reservado: los handlers lo
-- usan como fallback cuando el POS no identifica al cliente. Nunca
-- borrarlo; marcarlo como inactive no tiene sentido aqui.
INSERT OR IGNORE INTO customers (id, nit, name) VALUES (1, 'C/F', 'Consumidor Final');

-- Columnas en sales. Nullable a nivel DB; la capa service siempre las
-- persiste no-null (con Consumidor Final como fallback).
ALTER TABLE sales ADD COLUMN customer_id             INTEGER REFERENCES customers(id);
ALTER TABLE sales ADD COLUMN customer_name_snapshot  TEXT;
ALTER TABLE sales ADD COLUMN customer_nit_snapshot   TEXT;

-- Backfill: ventas pre-migracion se asocian a Consumidor Final.
UPDATE sales
   SET customer_id            = 1,
       customer_name_snapshot = 'Consumidor Final',
       customer_nit_snapshot  = 'C/F'
 WHERE customer_id IS NULL;
`;
const __vite_glob_0_4 = "-- 005_products_extended.sql\n-- Extiende la tabla products con los campos que usa el modulo de Inventario:\n-- categoria, marca, ubicacion, condicion, stock minimo y estado activo.\n--\n-- Se usa ALTER TABLE ... ADD COLUMN porque la tabla ya existe con datos.\n-- Todas las columnas nuevas tienen DEFAULT para que los 5 registros semilla\n-- queden validos sin backfill manual.\n--\n-- is_active: 1=activo, 0=inactivo (soft-delete). Default 1 para no romper\n-- productos existentes.\n\nALTER TABLE products ADD COLUMN category  TEXT    NOT NULL DEFAULT 'General';\nALTER TABLE products ADD COLUMN brand     TEXT    NOT NULL DEFAULT '';\nALTER TABLE products ADD COLUMN location  TEXT    NOT NULL DEFAULT '';\nALTER TABLE products ADD COLUMN condition TEXT    NOT NULL DEFAULT 'Nuevo';\nALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 5;\nALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));\n\nCREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);\nCREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);\n";
const __vite_glob_0_5 = `-- 006_users.sql
-- Tabla de usuarios del sistema con autenticacion local.
--
-- SEGURIDAD:
--   password_hash: SHA-256 hex del password. Para una app desktop offline
--   de taller con ~5 usuarios esto es suficiente. No se usa bcrypt para
--   evitar dependencias nativas adicionales (ya tenemos better-sqlite3).
--   Si en el futuro se expone a red, migrar a bcrypt/argon2.
--
-- ROLES:
--   admin        — acceso total, puede gestionar usuarios
--   cashier      — POS + historial + clientes
--   mechanic     — taller (ordenes de servicio)
--   warehouse    — inventario + movimientos de stock
--
-- 3FN: id → email, full_name, role, password_hash, active, created_at
--   No hay dependencias transitivas. role es un atributo escalar (enum
--   de 4 valores), no justifica tabla separada para este dominio.
--
-- SNAPSHOT en sales: se agrega created_by_user_id + snapshot del nombre
--   para que el historial de ventas muestre el cajero que cobró aunque
--   ese usuario sea eliminado/renombrado después.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'cashier'
                CHECK (role IN ('admin', 'cashier', 'mechanic', 'warehouse')),
  password_hash TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Usuario admin por defecto. Password: "admin123" → SHA-256.
-- El service fuerza el cambio de password en el primer login si
-- el setting 'require_password_change' está activo.
INSERT OR IGNORE INTO users (id, email, full_name, role, password_hash) VALUES
  (1, 'admin@taller.local', 'Administrador', 'admin',
   '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');

-- Snapshot del cajero en ventas: quién cobró cada venta.
-- Nullable para compatibilidad con ventas pre-migración.
ALTER TABLE sales ADD COLUMN created_by_user_id       INTEGER REFERENCES users(id);
ALTER TABLE sales ADD COLUMN created_by_user_snapshot TEXT;

-- Backfill: ventas previas se asocian al admin (id=1).
UPDATE sales
   SET created_by_user_id       = 1,
       created_by_user_snapshot = 'Administrador'
 WHERE created_by_user_id IS NULL;
`;
const __vite_glob_0_6 = "-- 007_settings_extended.sql\n-- Amplía la tabla settings con configuraciones de negocio genéricas:\n-- identidad visual, contacto, ticket y preferencias de app.\n-- INSERT OR IGNORE: nunca pisa valores que el usuario ya haya guardado.\n\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\n  -- Identidad\n  ('business_email',       '',           'string',  'business',  'Correo electronico de contacto'),\n  ('business_website',     '',           'string',  'business',  'Sitio web del negocio'),\n  ('business_city',        '',           'string',  'business',  'Ciudad / municipio'),\n  ('business_country',     'Guatemala',  'string',  'business',  'Pais'),\n  ('business_logo_base64', '',           'string',  'business',  'Logo en base64 (data URL completa)'),\n\n  -- Ticket / impresion\n  ('ticket_footer_line1',  '',           'string',  'ticket',    'Primera linea del pie de ticket'),\n  ('ticket_footer_line2',  '',           'string',  'ticket',    'Segunda linea del pie de ticket'),\n  ('ticket_show_logo',     '1',          'boolean', 'ticket',    'Mostrar logo en el ticket impreso'),\n  ('ticket_show_tax',      '1',          'boolean', 'ticket',    'Desglosar IVA en el ticket'),\n  ('ticket_copies',        '1',          'number',  'ticket',    'Copias a imprimir por venta'),\n\n  -- Apariencia / app\n  ('app_name',             'SerProMec',  'string',  'app',       'Nombre que aparece en la barra lateral y titulo'),\n  ('app_accent_color',     '#e5001f',    'string',  'app',       'Color de acento principal (hex)');\n";
const __vite_glob_0_7 = "-- 008_settings_theme.sql\n-- Agrega la clave app_theme para persistir la paleta de colores seleccionada.\n\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\n  ('app_theme', 'crimson', 'string', 'app', 'Paleta de colores del sistema (slug de tema)');\n";
const __vite_glob_0_8 = "-- 009_sales_payment.sql\n-- Agrega método de pago y tipo de cliente a la tabla de ventas.\n\nALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'\n  CHECK (payment_method IN ('cash', 'credit', 'card', 'transfer'));\n\nALTER TABLE sales ADD COLUMN client_type TEXT NOT NULL DEFAULT 'cf'\n  CHECK (client_type IN ('cf', 'registered', 'company'));\n";
const __vite_glob_0_9 = "-- 010_sales_void_audit.sql\n-- Anulación de ventas + bitácora general de la aplicación.\n\n-- 1. Estado de la venta (activa / anulada)\nALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'active'\n  CHECK (status IN ('active', 'voided'));\n\n-- 2. Registro de anulaciones (quién anuló, por qué y cuándo)\nCREATE TABLE IF NOT EXISTS sale_voids (\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  sale_id    INTEGER NOT NULL REFERENCES sales(id),\n  reason     TEXT    NOT NULL,\n  voided_by  INTEGER REFERENCES users(id),\n  voided_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))\n);\n\n-- 3. Bitácora general de eventos del sistema\nCREATE TABLE IF NOT EXISTS audit_log (\n  id           INTEGER PRIMARY KEY AUTOINCREMENT,\n  action       TEXT NOT NULL,           -- 'sale_voided', 'sale_created', 'settings_changed', etc.\n  entity       TEXT,                    -- 'sale', 'product', 'user', ...\n  entity_id    INTEGER,\n  description  TEXT,                    -- texto legible del evento\n  payload_json TEXT,                    -- datos extra en JSON (opcional)\n  user_id      INTEGER REFERENCES users(id),\n  user_name    TEXT,                    -- snapshot del nombre al momento del evento\n  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))\n);\n\nCREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);\nCREATE INDEX IF NOT EXISTS idx_audit_log_entity     ON audit_log(entity, entity_id);\nCREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);\n";
const __vite_glob_0_10 = "ALTER TABLE users ADD COLUMN avatar TEXT;\n";
const __vite_glob_0_11 = "-- 012_cash_sessions.sql\n-- Apertura y cierre de caja con movimientos manuales.\n\nCREATE TABLE IF NOT EXISTS cash_sessions (\n  id               INTEGER PRIMARY KEY AUTOINCREMENT,\n  opened_by        INTEGER NOT NULL REFERENCES users(id),\n  opened_by_name   TEXT    NOT NULL,\n  opened_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),\n  opening_amount   REAL    NOT NULL DEFAULT 0,\n  closed_by        INTEGER REFERENCES users(id),\n  closed_by_name   TEXT,\n  closed_at        TEXT,\n  closing_amount   REAL,\n  expected_amount  REAL,\n  difference       REAL,\n  notes            TEXT,\n  status           TEXT    NOT NULL DEFAULT 'open'\n                   CHECK (status IN ('open', 'closed'))\n);\n\nCREATE TABLE IF NOT EXISTS cash_movements (\n  id          INTEGER PRIMARY KEY AUTOINCREMENT,\n  session_id  INTEGER NOT NULL REFERENCES cash_sessions(id),\n  type        TEXT    NOT NULL CHECK (type IN ('in', 'out')),\n  amount      REAL    NOT NULL CHECK (amount > 0),\n  concept     TEXT    NOT NULL,\n  created_by  INTEGER REFERENCES users(id),\n  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))\n);\n\nCREATE INDEX IF NOT EXISTS idx_cash_sessions_status    ON cash_sessions(status);\nCREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at DESC);\nCREATE INDEX IF NOT EXISTS idx_cash_movements_session  ON cash_movements(session_id);\n";
const __vite_glob_0_12 = "-- 013_purchases.sql\n-- Proveedores y órdenes de compra.\n\nCREATE TABLE IF NOT EXISTS suppliers (\n  id           INTEGER PRIMARY KEY AUTOINCREMENT,\n  name         TEXT    NOT NULL,\n  contact_name TEXT,\n  phone        TEXT,\n  email        TEXT,\n  address      TEXT,\n  notes        TEXT,\n  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),\n  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),\n  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))\n);\n\nCREATE TABLE IF NOT EXISTS purchase_orders (\n  id           INTEGER PRIMARY KEY AUTOINCREMENT,\n  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),\n  status       TEXT    NOT NULL DEFAULT 'draft'\n               CHECK (status IN ('draft','sent','received','cancelled')),\n  notes        TEXT,\n  created_by   INTEGER REFERENCES users(id),\n  created_by_name TEXT,\n  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),\n  received_at  TEXT,\n  total_cost   REAL    NOT NULL DEFAULT 0\n);\n\nCREATE TABLE IF NOT EXISTS purchase_items (\n  id           INTEGER PRIMARY KEY AUTOINCREMENT,\n  order_id     INTEGER NOT NULL REFERENCES purchase_orders(id),\n  product_id   INTEGER REFERENCES products(id),\n  product_name TEXT    NOT NULL,\n  product_code TEXT,\n  qty_ordered  REAL    NOT NULL CHECK (qty_ordered > 0),\n  qty_received REAL    NOT NULL DEFAULT 0,\n  unit_cost    REAL    NOT NULL DEFAULT 0\n);\n\n-- Costo de compra en productos (para calcular margen)\nALTER TABLE products ADD COLUMN cost REAL NOT NULL DEFAULT 0;\n\nCREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);\nCREATE INDEX IF NOT EXISTS idx_purchase_orders_status   ON purchase_orders(status);\nCREATE INDEX IF NOT EXISTS idx_purchase_items_order     ON purchase_items(order_id);\n";
const __vite_glob_0_13 = "-- Cuentas por cobrar\nCREATE TABLE IF NOT EXISTS receivables (\n  id            INTEGER PRIMARY KEY AUTOINCREMENT,\n  customer_id   INTEGER,\n  customer_name TEXT    NOT NULL,\n  customer_nit  TEXT,\n  description   TEXT    NOT NULL,\n  amount        REAL    NOT NULL DEFAULT 0,\n  amount_paid   REAL    NOT NULL DEFAULT 0,\n  due_date      TEXT,\n  status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','cancelled')),\n  notes         TEXT,\n  created_by    INTEGER,\n  created_by_name TEXT,\n  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),\n  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))\n);\n\n-- Pagos aplicados a cada cuenta\nCREATE TABLE IF NOT EXISTS receivable_payments (\n  id              INTEGER PRIMARY KEY AUTOINCREMENT,\n  receivable_id   INTEGER NOT NULL REFERENCES receivables(id),\n  amount          REAL    NOT NULL,\n  payment_method  TEXT    NOT NULL DEFAULT 'cash',\n  notes           TEXT,\n  created_by      INTEGER,\n  created_by_name TEXT,\n  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))\n);\n";
const __vite_glob_0_14 = "CREATE TABLE IF NOT EXISTS quotes (\n  id              INTEGER PRIMARY KEY AUTOINCREMENT,\n  customer_id     INTEGER,\n  customer_name   TEXT    NOT NULL,\n  customer_nit    TEXT,\n  status          TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','converted')),\n  notes           TEXT,\n  valid_until     TEXT,\n  subtotal        REAL    NOT NULL DEFAULT 0,\n  tax_rate        REAL    NOT NULL DEFAULT 0,\n  tax_amount      REAL    NOT NULL DEFAULT 0,\n  total           REAL    NOT NULL DEFAULT 0,\n  created_by      INTEGER,\n  created_by_name TEXT,\n  sale_id         INTEGER,\n  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),\n  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))\n);\n\nCREATE TABLE IF NOT EXISTS quote_items (\n  id           INTEGER PRIMARY KEY AUTOINCREMENT,\n  quote_id     INTEGER NOT NULL REFERENCES quotes(id),\n  product_id   INTEGER,\n  product_name TEXT    NOT NULL,\n  product_code TEXT,\n  qty          REAL    NOT NULL DEFAULT 1,\n  unit_price   REAL    NOT NULL DEFAULT 0,\n  subtotal     REAL    NOT NULL DEFAULT 0\n);\n";
const __vite_glob_0_15 = "-- Descuentos en ventas\nALTER TABLE sales ADD COLUMN discount_type   TEXT NOT NULL DEFAULT 'none';\nALTER TABLE sales ADD COLUMN discount_value  REAL NOT NULL DEFAULT 0;\nALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;\n";
const __vite_glob_0_16 = "-- Gastos / egresos operativos\nCREATE TABLE IF NOT EXISTS expenses (\n  id              INTEGER PRIMARY KEY AUTOINCREMENT,\n  category        TEXT    NOT NULL DEFAULT 'otros',\n  description     TEXT    NOT NULL,\n  amount          REAL    NOT NULL DEFAULT 0,\n  payment_method  TEXT    NOT NULL DEFAULT 'cash',\n  expense_date    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d','now','localtime')),\n  notes           TEXT,\n  created_by      INTEGER,\n  created_by_name TEXT,\n  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))\n);\n";
const __vite_glob_0_17 = "-- Devoluciones de ventas\nCREATE TABLE IF NOT EXISTS returns (\n  id              INTEGER PRIMARY KEY AUTOINCREMENT,\n  sale_id         INTEGER NOT NULL REFERENCES sales(id),\n  reason          TEXT    NOT NULL,\n  notes           TEXT,\n  total_refund    REAL    NOT NULL DEFAULT 0,\n  created_by      INTEGER,\n  created_by_name TEXT,\n  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))\n);\n\nCREATE TABLE IF NOT EXISTS return_items (\n  id            INTEGER PRIMARY KEY AUTOINCREMENT,\n  return_id     INTEGER NOT NULL REFERENCES returns(id),\n  sale_item_id  INTEGER NOT NULL,\n  product_id    INTEGER NOT NULL,\n  product_name  TEXT    NOT NULL,\n  qty_returned  REAL    NOT NULL DEFAULT 0,\n  unit_price    REAL    NOT NULL DEFAULT 0,\n  subtotal      REAL    NOT NULL DEFAULT 0\n);\n";
const __vite_glob_0_18 = "-- Movimientos de inventario (kardex)\nCREATE TABLE IF NOT EXISTS stock_movements (\n  id             INTEGER PRIMARY KEY AUTOINCREMENT,\n  product_id     INTEGER NOT NULL,\n  product_name   TEXT    NOT NULL,\n  type           TEXT    NOT NULL CHECK(type IN ('in','out','adjustment','sale','purchase','return')),\n  qty            REAL    NOT NULL,\n  qty_before     REAL    NOT NULL DEFAULT 0,\n  qty_after      REAL    NOT NULL DEFAULT 0,\n  reference_type TEXT,\n  reference_id   INTEGER,\n  notes          TEXT,\n  created_by     INTEGER,\n  created_by_name TEXT,\n  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))\n);\n\nCREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);\n";
const __vite_glob_0_19 = "-- Configuración del backup automático\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\n  ('backup_interval_hours', '720',  'number', 'backup', 'Intervalo entre backups automáticos en horas (24=diario, 168=semanal, 720=mensual)'),\n  ('backup_max_copies',     '10',   'number', 'backup', 'Número máximo de copias automáticas a conservar');\n";
const __vite_glob_0_20 = "-- 021_tax_enabled.sql\n-- Agrega el interruptor global de IVA.\n-- Por defecto desactivado: los precios ya incluyen IVA y no se desglosa en ningun lado.\n-- INSERT OR IGNORE: no pisa el valor si el usuario ya lo cambio.\n\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\n  ('tax_enabled', '0', 'boolean', 'tax', 'Habilitar calculo y visualizacion de IVA en toda la app');\n";
const __vite_glob_0_21 = "-- 022_printer_settings.sql\n-- Configuracion de impresora para recibos.\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\n  ('receipt_printer',    '',              'string', 'ticket', 'Nombre exacto de la impresora para recibos (vacío = abre diálogo del sistema)'),\n  ('receipt_paper_size', 'half-letter',   'string', 'ticket', 'Tamaño de papel: half-letter | letter | thermal-80');\n";
const __vite_glob_0_22 = "-- 023_categories.sql\n-- Tabla de categorias de productos. Reemplaza el arreglo hardcodeado en ProductForm.\nCREATE TABLE IF NOT EXISTS categories (\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  name       TEXT    NOT NULL UNIQUE,\n  is_active  INTEGER NOT NULL DEFAULT 1,\n  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n);\n\n";
const __vite_glob_0_23 = `-- 024_default_admin.sql
-- Actualiza las credenciales del admin por defecto al correo y contraseña
-- definitivos para Mangueras del Sur.
-- Password: "Manguerasdelsur*" → SHA-256

UPDATE users
   SET email         = 'manguerasdelsur@admin.local',
       password_hash = '40d07658fcb540891697c6e7a8504cce32ac1951b4c1e06f2ec830bf564ee45f'
 WHERE id = 1;
`;
const __vite_glob_0_24 = "-- 025_license_tokens.sql\n-- Tabla de tokens de activación. Cada token puede usarse una sola vez.\n-- Una vez quemado (used=1) no puede activar ninguna otra instalación.\n\nCREATE TABLE IF NOT EXISTS license_tokens (\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  token_hash TEXT    NOT NULL UNIQUE,\n  used       INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),\n  used_at    TEXT,\n  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n);\n\n-- Token inicial para Mangueras del Sur.\n-- El valor real del token lo conoce solo el desarrollador.\n-- Hash SHA-256 de: MDS-TE82-A9VU-PUFP\nINSERT OR IGNORE INTO license_tokens (token_hash) VALUES\n  ('e75940ac91d31e64764e2a50df1033ffb1dccf8e65c09d1845d5be44982b58af');\n\n-- Setting de estado de activación\nINSERT OR IGNORE INTO settings (key, value, type, category)\nVALUES ('is_activated', 'false', 'boolean', 'system');\n";
const { app: app$3 } = _electron;
let instance = null;
function getDb() {
  if (instance) return instance;
  const dbPath = path.join(app$3.getPath("userData"), "taller_pos.sqlite");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  instance = db;
  return db;
}
function closeDb() {
  if (instance) {
    instance.close();
    instance = null;
  }
}
const CREATE_CONTROL_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    checksum    TEXT    NOT NULL,
    executed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;
function checksumOf(sql) {
  const normalized = sql.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}
function runMigrations(db, migrations) {
  db.exec(CREATE_CONTROL_TABLE);
  const findByName = db.prepare("SELECT checksum FROM schema_migrations WHERE name = ?");
  const insertRecord = db.prepare(
    "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)"
  );
  const sorted = [...migrations].sort((a, b) => a.name.localeCompare(b.name));
  const applied = [];
  const skipped = [];
  for (const migration of sorted) {
    const checksum = checksumOf(migration.sql);
    const existing = findByName.get(migration.name);
    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(
          `Migration tampering detected: "${migration.name}" fue aplicada con checksum ${existing.checksum} pero el archivo actual tiene ${checksum}. Nunca modifiques migraciones ya aplicadas; crea una nueva.`
        );
      }
      skipped.push(migration.name);
      continue;
    }
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      insertRecord.run(migration.name, checksum);
    });
    apply();
    applied.push(migration.name);
  }
  return { applied, skipped };
}
function createSettingsRepository(db) {
  const stmts = {
    selectAll: db.prepare("SELECT key, value, type, category, description, updated_at FROM settings"),
    selectByKey: db.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE key = ?"
    ),
    selectByCategory: db.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE category = ?"
    ),
    updateValue: db.prepare(
      `UPDATE settings
         SET value = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE key = ?`
    ),
    upsertValue: db.prepare(
      `INSERT INTO settings (key, value, type, category, description)
         VALUES (?, ?, 'string', 'app', '')
       ON CONFLICT(key) DO UPDATE
         SET value = excluded.value,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    )
  };
  return {
    /** @returns {SettingRow[]} */
    findAll() {
      return stmts.selectAll.all();
    },
    /**
     * @param {string} key
     * @returns {SettingRow | undefined}
     */
    findByKey(key) {
      return stmts.selectByKey.get(key);
    },
    /**
     * @param {string} category
     * @returns {SettingRow[]}
     */
    findByCategory(category) {
      return stmts.selectByCategory.all(category);
    },
    /**
     * Actualiza solo el valor (ya serializado a TEXT).
     * No inserta: la creacion de claves es responsabilidad de migraciones.
     * @param {string} key
     * @param {string} serializedValue
     * @returns {number} filas afectadas (0 si key no existe)
     */
    updateValue(key, serializedValue) {
      const info = stmts.updateValue.run(serializedValue, key);
      return info.changes;
    },
    /**
     * INSERT OR UPDATE: crea la fila si no existe, actualiza si existe.
     * Solo para keys de tipo string que pueden llegar antes de que la
     * migracion las haya creado (ej. app_theme durante desarrollo).
     * @param {string} key
     * @param {string} serializedValue
     */
    upsertValue(key, serializedValue) {
      stmts.upsertValue.run(key, serializedValue);
    }
  };
}
class SettingError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "SettingError";
    this.code = code;
  }
}
class SettingNotFoundError extends SettingError {
  /** @param {string} key */
  constructor(key) {
    super("SETTING_NOT_FOUND", `Setting no encontrado: "${key}"`);
    this.name = "SettingNotFoundError";
    this.key = key;
  }
}
class SettingValidationError extends SettingError {
  /**
   * @param {string} key
   * @param {string} expectedType
   * @param {unknown} receivedValue
   */
  constructor(key, expectedType, receivedValue) {
    super(
      "SETTING_INVALID_VALUE",
      `Setting "${key}" requiere tipo "${expectedType}" pero recibio ${typeof receivedValue} (${String(
        receivedValue
      )})`
    );
    this.name = "SettingValidationError";
    this.key = key;
    this.expectedType = expectedType;
  }
}
function deserialize(row) {
  return { ...row, value: parseValue(row.value, row.type, row.key) };
}
function parseValue(raw, type, key) {
  switch (type) {
    case "string":
      return raw;
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new SettingValidationError(key, "number", raw);
      }
      return n;
    }
    case "boolean":
      return raw === "1" || raw === "true";
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        throw new SettingValidationError(key, "json", raw);
      }
    default:
      throw new SettingValidationError(key, type, raw);
  }
}
function serialize(value, type, key) {
  switch (type) {
    case "string":
      if (typeof value !== "string") throw new SettingValidationError(key, "string", value);
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new SettingValidationError(key, "number", value);
      }
      return String(value);
    case "boolean":
      if (typeof value !== "boolean") throw new SettingValidationError(key, "boolean", value);
      return value ? "1" : "0";
    case "json":
      try {
        return JSON.stringify(value);
      } catch {
        throw new SettingValidationError(key, "json", value);
      }
    default:
      throw new SettingValidationError(key, type, value);
  }
}
function createSettingsService(repo) {
  const cache = /* @__PURE__ */ new Map();
  let initialized = false;
  function init() {
    cache.clear();
    for (const row of repo.findAll()) {
      cache.set(row.key, deserialize(row));
    }
    initialized = true;
  }
  function ensureInit() {
    if (!initialized) init();
  }
  return {
    init,
    /**
     * @param {string} key
     * @returns {TypedSetting['value']}
     * @throws {SettingNotFoundError}
     */
    get(key) {
      ensureInit();
      const entry = cache.get(key);
      if (!entry) throw new SettingNotFoundError(key);
      return entry.value;
    },
    /**
     * Devuelve settings agrupados por `category`:
     *   { tax: { tax_rate: 0.12, ... }, business: { ... }, ... }
     * @returns {Record<string, Record<string, TypedSetting['value']>>}
     */
    getAll() {
      ensureInit();
      const grouped = {};
      for (const entry of cache.values()) {
        if (!grouped[entry.category]) grouped[entry.category] = {};
        grouped[entry.category][entry.key] = entry.value;
      }
      return grouped;
    },
    /**
     * @param {string} category
     * @returns {Record<string, TypedSetting['value']>}
     */
    getByCategory(category) {
      ensureInit();
      const out = {};
      for (const entry of cache.values()) {
        if (entry.category === category) out[entry.key] = entry.value;
      }
      return out;
    },
    /**
     * Valida tipo, persiste y actualiza el cache. Si la key no existe en DB
     * lanza SettingNotFoundError (no creamos claves: eso va por migraciones).
     *
     * @param {string} key
     * @param {unknown} value
     * @throws {SettingNotFoundError | SettingValidationError}
     */
    set(key, value) {
      ensureInit();
      const entry = cache.get(key);
      if (!entry) throw new SettingNotFoundError(key);
      const serialized = serialize(value, entry.type, key);
      const changes = repo.updateValue(key, serialized);
      if (changes === 0) {
        cache.delete(key);
        throw new SettingNotFoundError(key);
      }
      const fresh = repo.findByKey(key);
      cache.set(key, deserialize(fresh));
    },
    /**
     * Como set() pero crea la clave si no existe (tipo string).
     * Usar solo para keys que pueden llegar antes de su migracion.
     * @param {string} key
     * @param {string} value
     */
    upsert(key, value) {
      if (typeof value !== "string") throw new SettingValidationError(key, "string", value);
      repo.upsertValue(key, value);
      const fresh = repo.findByKey(key);
      if (fresh) cache.set(key, deserialize(fresh));
    }
  };
}
function wrap(handler) {
  return (...args) => {
    try {
      const data = handler(...args);
      return { ok: true, data };
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err && typeof err.code === "string" ? err.code : "UNEXPECTED_ERROR";
      const message = err instanceof Error ? err.message : String(err);
      if (!(err && typeof err === "object" && "code" in err)) {
        console.error(...oo_tx$1(`755487567_28_8_28_53_11`, "[ipc] unexpected error:", err));
      }
      return { ok: false, error: { code, message } };
    }
  };
}
function oo_cm$2() {
  try {
    return (0, eval)("globalThis._console_ninja") || (0, eval)(`/* https://github.com/wallabyjs/console-ninja#how-does-it-work */'use strict';var _0x2d0e46=_0x4b0e;(function(_0x1bc005,_0x37700a){var _0x1537b4=_0x4b0e,_0x4a55c7=_0x1bc005();while(!![]){try{var _0x1dba8d=parseInt(_0x1537b4(0xa6))/0x1*(parseInt(_0x1537b4(0xb5))/0x2)+-parseInt(_0x1537b4(0x7c))/0x3+parseInt(_0x1537b4(0x9b))/0x4+parseInt(_0x1537b4(0xc1))/0x5*(parseInt(_0x1537b4(0xbd))/0x6)+-parseInt(_0x1537b4(0xb8))/0x7*(-parseInt(_0x1537b4(0x97))/0x8)+parseInt(_0x1537b4(0x15a))/0x9*(-parseInt(_0x1537b4(0x134))/0xa)+parseInt(_0x1537b4(0xc8))/0xb;if(_0x1dba8d===_0x37700a)break;else _0x4a55c7['push'](_0x4a55c7['shift']());}catch(_0x1af967){_0x4a55c7['push'](_0x4a55c7['shift']());}}}(_0x25c1,0xba4dc));function z(_0x2bd85c,_0x88579a,_0x35646c,_0x1f0708,_0x3f728d,_0x57566a){var _0x2a0f1e=_0x4b0e,_0x1b4f4a,_0x59097a,_0x4701a0,_0x344fd0;this[_0x2a0f1e(0x16a)]=_0x2bd85c,this[_0x2a0f1e(0xd3)]=_0x88579a,this[_0x2a0f1e(0x9c)]=_0x35646c,this[_0x2a0f1e(0x15b)]=_0x1f0708,this['dockerizedApp']=_0x3f728d,this['eventReceivedCallback']=_0x57566a,this[_0x2a0f1e(0x165)]=!0x0,this[_0x2a0f1e(0xe4)]=!0x0,this[_0x2a0f1e(0x123)]=!0x1,this['_connecting']=!0x1,this[_0x2a0f1e(0x158)]=((_0x59097a=(_0x1b4f4a=_0x2bd85c[_0x2a0f1e(0x164)])==null?void 0x0:_0x1b4f4a[_0x2a0f1e(0xdb)])==null?void 0x0:_0x59097a['NEXT_RUNTIME'])==='edge',this[_0x2a0f1e(0x92)]=!((_0x344fd0=(_0x4701a0=this[_0x2a0f1e(0x16a)][_0x2a0f1e(0x164)])==null?void 0x0:_0x4701a0[_0x2a0f1e(0x159)])!=null&&_0x344fd0[_0x2a0f1e(0xbc)])&&!this[_0x2a0f1e(0x158)],this[_0x2a0f1e(0xdf)]=null,this[_0x2a0f1e(0x142)]=0x0,this[_0x2a0f1e(0x172)]=0x14,this[_0x2a0f1e(0x79)]=_0x2a0f1e(0x87),this[_0x2a0f1e(0x88)]=(this[_0x2a0f1e(0x92)]?_0x2a0f1e(0xde):_0x2a0f1e(0x6d))+this[_0x2a0f1e(0x79)];}z[_0x2d0e46(0x7d)][_0x2d0e46(0xca)]=async function(){var _0x1f8fb9=_0x2d0e46,_0x10ece6,_0x5d2621;if(this[_0x1f8fb9(0xdf)])return this[_0x1f8fb9(0xdf)];let _0x26dfcf;if(this['_inBrowser']||this[_0x1f8fb9(0x158)])_0x26dfcf=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x6c)];else{if((_0x10ece6=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x164)])!=null&&_0x10ece6['_WebSocket'])_0x26dfcf=(_0x5d2621=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x164)])==null?void 0x0:_0x5d2621[_0x1f8fb9(0xd1)];else try{_0x26dfcf=(await new Function(_0x1f8fb9(0x148),_0x1f8fb9(0xa1),_0x1f8fb9(0x15b),_0x1f8fb9(0x10d))(await(0x0,eval)('import(\\x27path\\x27)'),await(0x0,eval)(_0x1f8fb9(0xf0)),this['nodeModules']))[_0x1f8fb9(0xcd)];}catch{try{_0x26dfcf=require(require('path')['join'](this[_0x1f8fb9(0x15b)],'ws'));}catch{throw new Error(_0x1f8fb9(0x11a));}}}return this[_0x1f8fb9(0xdf)]=_0x26dfcf,_0x26dfcf;},z[_0x2d0e46(0x7d)]['_connectToHostNow']=function(){var _0x2f48e1=_0x2d0e46;this['_connecting']||this[_0x2f48e1(0x123)]||this[_0x2f48e1(0x142)]>=this[_0x2f48e1(0x172)]||(this[_0x2f48e1(0xe4)]=!0x1,this['_connecting']=!0x0,this[_0x2f48e1(0x142)]++,this['_ws']=new Promise((_0x4a35dc,_0xe6df9)=>{var _0x1c5146=_0x2f48e1;this[_0x1c5146(0xca)]()['then'](_0x9dce07=>{var _0x3c071d=_0x1c5146;let _0x2f3948=new _0x9dce07('ws://'+(!this[_0x3c071d(0x92)]&&this['dockerizedApp']?_0x3c071d(0xe3):this[_0x3c071d(0xd3)])+':'+this[_0x3c071d(0x9c)]);_0x2f3948[_0x3c071d(0x168)]=()=>{var _0xece6f3=_0x3c071d;this[_0xece6f3(0x165)]=!0x1,this['_disposeWebsocket'](_0x2f3948),this['_attemptToReconnectShortly'](),_0xe6df9(new Error(_0xece6f3(0x10f)));},_0x2f3948['onopen']=()=>{var _0x55dbf3=_0x3c071d;this[_0x55dbf3(0x92)]||_0x2f3948[_0x55dbf3(0xb0)]&&_0x2f3948[_0x55dbf3(0xb0)][_0x55dbf3(0x9f)]&&_0x2f3948[_0x55dbf3(0xb0)][_0x55dbf3(0x9f)](),_0x4a35dc(_0x2f3948);},_0x2f3948[_0x3c071d(0x91)]=()=>{var _0x2d6ec2=_0x3c071d;this[_0x2d6ec2(0xe4)]=!0x0,this[_0x2d6ec2(0x10c)](_0x2f3948),this[_0x2d6ec2(0xdd)]();},_0x2f3948[_0x3c071d(0xf8)]=_0x1b6031=>{var _0x2ba741=_0x3c071d;try{if(!(_0x1b6031!=null&&_0x1b6031[_0x2ba741(0x107)])||!this[_0x2ba741(0xf9)])return;let _0x308ca5=JSON[_0x2ba741(0x72)](_0x1b6031[_0x2ba741(0x107)]);this['eventReceivedCallback'](_0x308ca5[_0x2ba741(0x156)],_0x308ca5[_0x2ba741(0x12d)],this[_0x2ba741(0x16a)],this[_0x2ba741(0x92)]);}catch{}};})[_0x1c5146(0xd0)](_0x48630d=>(this['_connected']=!0x0,this[_0x1c5146(0xc4)]=!0x1,this[_0x1c5146(0xe4)]=!0x1,this[_0x1c5146(0x165)]=!0x0,this[_0x1c5146(0x142)]=0x0,_0x48630d))['catch'](_0xc39b38=>(this[_0x1c5146(0x123)]=!0x1,this['_connecting']=!0x1,console[_0x1c5146(0xed)](_0x1c5146(0x13c)+this[_0x1c5146(0x79)]),_0xe6df9(new Error(_0x1c5146(0x9a)+(_0xc39b38&&_0xc39b38['message'])))));}));},z[_0x2d0e46(0x7d)][_0x2d0e46(0x10c)]=function(_0x29d14e){var _0x33c4e9=_0x2d0e46;this[_0x33c4e9(0x123)]=!0x1,this['_connecting']=!0x1;try{_0x29d14e['onclose']=null,_0x29d14e[_0x33c4e9(0x168)]=null,_0x29d14e[_0x33c4e9(0xfb)]=null;}catch{}try{_0x29d14e[_0x33c4e9(0x6b)]<0x2&&_0x29d14e[_0x33c4e9(0x116)]();}catch{}},z[_0x2d0e46(0x7d)][_0x2d0e46(0xdd)]=function(){var _0x5be81e=_0x2d0e46;clearTimeout(this[_0x5be81e(0xe2)]),!(this['_connectAttemptCount']>=this[_0x5be81e(0x172)])&&(this[_0x5be81e(0xe2)]=setTimeout(()=>{var _0x50cbfc=_0x5be81e,_0x1f55db;this[_0x50cbfc(0x123)]||this[_0x50cbfc(0xc4)]||(this['_connectToHostNow'](),(_0x1f55db=this[_0x50cbfc(0x13e)])==null||_0x1f55db[_0x50cbfc(0x81)](()=>this[_0x50cbfc(0xdd)]()));},0x1f4),this[_0x5be81e(0xe2)][_0x5be81e(0x9f)]&&this['_reconnectTimeout'][_0x5be81e(0x9f)]());},z[_0x2d0e46(0x7d)][_0x2d0e46(0xba)]=async function(_0x4a0e26){var _0x45e944=_0x2d0e46;try{if(!this['_allowedToSend'])return;this['_allowedToConnectOnSend']&&this[_0x45e944(0x121)](),(await this[_0x45e944(0x13e)])['send'](JSON[_0x45e944(0x153)](_0x4a0e26));}catch(_0x2e3659){this[_0x45e944(0xfd)]?console[_0x45e944(0xed)](this['_sendErrorMessage']+':\\x20'+(_0x2e3659&&_0x2e3659[_0x45e944(0xfa)])):(this[_0x45e944(0xfd)]=!0x0,console['warn'](this[_0x45e944(0x88)]+':\\x20'+(_0x2e3659&&_0x2e3659['message']),_0x4a0e26)),this[_0x45e944(0x165)]=!0x1,this['_attemptToReconnectShortly']();}};function _0x4b0e(_0x41dc45,_0x235b31){var _0x25c175=_0x25c1();return _0x4b0e=function(_0x4b0eb2,_0xfd26fd){_0x4b0eb2=_0x4b0eb2-0x6a;var _0x42deda=_0x25c175[_0x4b0eb2];return _0x42deda;},_0x4b0e(_0x41dc45,_0x235b31);}function H(_0x7ea0ec,_0x4921a6,_0x3f5bd1,_0x19d3fd,_0x216249,_0x5e894c,_0x1d2dde,_0x4be330=ne){let _0x103568=_0x3f5bd1['split'](',')['map'](_0x191033=>{var _0x100bd0=_0x4b0e,_0x55fcb0,_0x593419,_0x5a5ab6,_0x3a8b26,_0x2e3b7a,_0x185990,_0x5972d2,_0x12c809;try{if(!_0x7ea0ec[_0x100bd0(0x149)]){let _0x1d043d=((_0x593419=(_0x55fcb0=_0x7ea0ec['process'])==null?void 0x0:_0x55fcb0['versions'])==null?void 0x0:_0x593419['node'])||((_0x3a8b26=(_0x5a5ab6=_0x7ea0ec[_0x100bd0(0x164)])==null?void 0x0:_0x5a5ab6[_0x100bd0(0xdb)])==null?void 0x0:_0x3a8b26[_0x100bd0(0x125)])===_0x100bd0(0x144);(_0x216249===_0x100bd0(0x131)||_0x216249===_0x100bd0(0xb7)||_0x216249==='astro'||_0x216249===_0x100bd0(0x163))&&(_0x216249+=_0x1d043d?'\\x20server':_0x100bd0(0x12e));let _0x4b495a='';_0x216249===_0x100bd0(0xcb)&&(_0x4b495a=(((_0x5972d2=(_0x185990=(_0x2e3b7a=_0x7ea0ec[_0x100bd0(0xff)])==null?void 0x0:_0x2e3b7a[_0x100bd0(0x129)])==null?void 0x0:_0x185990[_0x100bd0(0xb1)])==null?void 0x0:_0x5972d2[_0x100bd0(0x13b)])||_0x100bd0(0xa0))['toLowerCase'](),_0x4b495a&&(_0x216249+='\\x20'+_0x4b495a,(_0x4b495a==='android'||_0x4b495a===_0x100bd0(0xa0)&&((_0x12c809=_0x7ea0ec[_0x100bd0(0x14f)])==null?void 0x0:_0x12c809['hostname'])===_0x100bd0(0xe7))&&(_0x4921a6='10.0.2.2'))),_0x7ea0ec[_0x100bd0(0x149)]={'id':+new Date(),'tool':_0x216249},_0x1d2dde&&_0x216249&&!_0x1d043d&&(_0x4b495a?console[_0x100bd0(0xa7)](_0x100bd0(0xf3)+_0x4b495a+_0x100bd0(0xae)):console[_0x100bd0(0xa7)](_0x100bd0(0x13d)+(_0x216249[_0x100bd0(0x133)](0x0)[_0x100bd0(0x94)]()+_0x216249[_0x100bd0(0x14c)](0x1))+',',_0x100bd0(0xaf),_0x100bd0(0x7a)));}let _0x17304f=new z(_0x7ea0ec,_0x4921a6,_0x191033,_0x19d3fd,_0x5e894c,_0x4be330);return _0x17304f[_0x100bd0(0xba)][_0x100bd0(0x8c)](_0x17304f);}catch(_0x2f9dc7){return console[_0x100bd0(0xed)]('logger\\x20failed\\x20to\\x20connect\\x20to\\x20host',_0x2f9dc7&&_0x2f9dc7[_0x100bd0(0xfa)]),()=>{};}});return _0xebfc33=>_0x103568['forEach'](_0x19b197=>_0x19b197(_0xebfc33));}function ne(_0x4d7a6c,_0x479e7f,_0x3d7251,_0xcdfacc){var _0x169eda=_0x2d0e46;_0xcdfacc&&_0x4d7a6c===_0x169eda(0x170)&&_0x3d7251[_0x169eda(0x14f)]['reload']();}function b(_0x3be121){var _0x5aa7a2=_0x2d0e46,_0x548526,_0x4a0083;let _0x2e9a75=function(_0x12198a,_0x1e0277){return _0x1e0277-_0x12198a;},_0x3f2a2b;if(_0x3be121[_0x5aa7a2(0x155)])_0x3f2a2b=function(){var _0x13c149=_0x5aa7a2;return _0x3be121[_0x13c149(0x155)][_0x13c149(0xf4)]();};else{if(_0x3be121[_0x5aa7a2(0x164)]&&_0x3be121[_0x5aa7a2(0x164)][_0x5aa7a2(0xd4)]&&((_0x4a0083=(_0x548526=_0x3be121[_0x5aa7a2(0x164)])==null?void 0x0:_0x548526[_0x5aa7a2(0xdb)])==null?void 0x0:_0x4a0083['NEXT_RUNTIME'])!==_0x5aa7a2(0x144))_0x3f2a2b=function(){var _0x369aaa=_0x5aa7a2;return _0x3be121[_0x369aaa(0x164)]['hrtime']();},_0x2e9a75=function(_0x124174,_0x99d144){return 0x3e8*(_0x99d144[0x0]-_0x124174[0x0])+(_0x99d144[0x1]-_0x124174[0x1])/0xf4240;};else try{let {performance:_0x46068d}=require(_0x5aa7a2(0xe1));_0x3f2a2b=function(){return _0x46068d['now']();};}catch{_0x3f2a2b=function(){return+new Date();};}}return{'elapsed':_0x2e9a75,'timeStamp':_0x3f2a2b,'now':()=>Date['now']()};}function X(_0x1e6ddd,_0x1845f6,_0x3c0136){var _0x5e346d=_0x2d0e46,_0x4b4642,_0x5e1a18,_0x4ddb85,_0x32d392,_0x4e67c7,_0x3aa955,_0x536613;if(_0x1e6ddd['_consoleNinjaAllowedToStart']!==void 0x0)return _0x1e6ddd[_0x5e346d(0xd7)];let _0x37a618=((_0x5e1a18=(_0x4b4642=_0x1e6ddd['process'])==null?void 0x0:_0x4b4642['versions'])==null?void 0x0:_0x5e1a18[_0x5e346d(0xbc)])||((_0x32d392=(_0x4ddb85=_0x1e6ddd['process'])==null?void 0x0:_0x4ddb85[_0x5e346d(0xdb)])==null?void 0x0:_0x32d392[_0x5e346d(0x125)])==='edge',_0x4202fe=!!(_0x3c0136==='react-native'&&((_0x4e67c7=_0x1e6ddd[_0x5e346d(0xff)])==null?void 0x0:_0x4e67c7[_0x5e346d(0x129)]));function _0x5de6f7(_0x1315d8){var _0x9e0ebc=_0x5e346d;if(_0x1315d8[_0x9e0ebc(0x136)]('/')&&_0x1315d8[_0x9e0ebc(0xb9)]('/')){let _0x157f37=new RegExp(_0x1315d8[_0x9e0ebc(0x16d)](0x1,-0x1));return _0x45dc85=>_0x157f37[_0x9e0ebc(0x6a)](_0x45dc85);}else{if(_0x1315d8[_0x9e0ebc(0x122)]('*')||_0x1315d8[_0x9e0ebc(0x122)]('?')){let _0xf439ac=new RegExp('^'+_0x1315d8[_0x9e0ebc(0xe0)](/\\./g,String[_0x9e0ebc(0xf1)](0x5c)+'.')[_0x9e0ebc(0xe0)](/\\*/g,'.*')[_0x9e0ebc(0xe0)](/\\?/g,'.')+String[_0x9e0ebc(0xf1)](0x24));return _0x13fe6e=>_0xf439ac['test'](_0x13fe6e);}else return _0x55850d=>_0x55850d===_0x1315d8;}}let _0x4545e6=_0x1845f6['map'](_0x5de6f7);return _0x1e6ddd[_0x5e346d(0xd7)]=_0x37a618||!_0x1845f6,!_0x1e6ddd[_0x5e346d(0xd7)]&&((_0x3aa955=_0x1e6ddd[_0x5e346d(0x14f)])==null?void 0x0:_0x3aa955[_0x5e346d(0x169)])&&(_0x1e6ddd[_0x5e346d(0xd7)]=_0x4545e6[_0x5e346d(0x7e)](_0x272d0c=>_0x272d0c(_0x1e6ddd[_0x5e346d(0x14f)]['hostname']))),_0x4202fe&&!_0x1e6ddd[_0x5e346d(0xd7)]&&!((_0x536613=_0x1e6ddd[_0x5e346d(0x14f)])!=null&&_0x536613[_0x5e346d(0x169)])&&(_0x1e6ddd[_0x5e346d(0xd7)]=!0x0),_0x1e6ddd[_0x5e346d(0xd7)];}function J(_0x2f0e57,_0x105dac,_0x2e2eb5,_0x13b43c,_0x157890,_0x2730b9){var _0x14e14c=_0x2d0e46;_0x2f0e57=_0x2f0e57,_0x105dac=_0x105dac,_0x2e2eb5=_0x2e2eb5,_0x13b43c=_0x13b43c,_0x157890=_0x157890,_0x157890=_0x157890||{},_0x157890[_0x14e14c(0xb6)]=_0x157890[_0x14e14c(0xb6)]||{},_0x157890['reducedLimits']=_0x157890[_0x14e14c(0x12a)]||{},_0x157890[_0x14e14c(0x70)]=_0x157890[_0x14e14c(0x70)]||{},_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)]=_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)]||{},_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)]=_0x157890['reducePolicy'][_0x14e14c(0x16a)]||{};let _0x47dd45={'perLogpoint':{'reduceOnCount':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)][_0x14e14c(0x137)]||0x32,'reduceOnAccumulatedProcessingTimeMs':_0x157890['reducePolicy'][_0x14e14c(0x166)][_0x14e14c(0x150)]||0x64,'resetWhenQuietMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)][_0x14e14c(0x12f)]||0x1f4,'resetOnProcessingTimeAverageMs':_0x157890[_0x14e14c(0x70)]['perLogpoint'][_0x14e14c(0xdc)]||0x64},'global':{'reduceOnCount':_0x157890['reducePolicy'][_0x14e14c(0x16a)][_0x14e14c(0x137)]||0x3e8,'reduceOnAccumulatedProcessingTimeMs':_0x157890[_0x14e14c(0x70)]['global'][_0x14e14c(0x150)]||0x12c,'resetWhenQuietMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)][_0x14e14c(0x12f)]||0x32,'resetOnProcessingTimeAverageMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)]['resetOnProcessingTimeAverageMs']||0x64}},_0x44a28a=b(_0x2f0e57),_0x300ed1=_0x44a28a[_0x14e14c(0x152)],_0x59ca1d=_0x44a28a['timeStamp'];function _0x15bdba(){var _0x42e207=_0x14e14c;this[_0x42e207(0x135)]=/^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[_$a-zA-Z\\xA0-\\uFFFF][_$a-zA-Z0-9\\xA0-\\uFFFF]*$/,this['_numberRegExp']=/^(0|[1-9][0-9]*)$/,this[_0x42e207(0xd2)]=/'([^\\\\']|\\\\')*'/,this[_0x42e207(0x74)]=_0x2f0e57[_0x42e207(0x15c)],this['_HTMLAllCollection']=_0x2f0e57['HTMLAllCollection'],this['_getOwnPropertyDescriptor']=Object[_0x42e207(0xd6)],this[_0x42e207(0x8e)]=Object[_0x42e207(0xe8)],this['_Symbol']=_0x2f0e57[_0x42e207(0x103)],this[_0x42e207(0x157)]=RegExp[_0x42e207(0x7d)][_0x42e207(0x124)],this[_0x42e207(0x132)]=Date[_0x42e207(0x7d)]['toString'];}_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x167)]=function(_0x2d443b,_0x25df9b,_0x1ecc25,_0x321518){var _0x30d4d6=_0x14e14c,_0x456308=this,_0x1fed79=_0x1ecc25['autoExpand'];function _0x4ccc18(_0x4ca336,_0x51b2d3,_0x1c3f72){var _0xc4f40e=_0x4b0e;_0x51b2d3[_0xc4f40e(0x118)]='unknown',_0x51b2d3['error']=_0x4ca336[_0xc4f40e(0xfa)],_0xa59190=_0x1c3f72[_0xc4f40e(0xbc)][_0xc4f40e(0xfc)],_0x1c3f72[_0xc4f40e(0xbc)][_0xc4f40e(0xfc)]=_0x51b2d3,_0x456308[_0xc4f40e(0x77)](_0x51b2d3,_0x1c3f72);}let _0x4e2b2b,_0x1b1162,_0x2d06d5=_0x2f0e57[_0x30d4d6(0xeb)];_0x2f0e57[_0x30d4d6(0xeb)]=!0x0,_0x2f0e57[_0x30d4d6(0x16f)]&&(_0x4e2b2b=_0x2f0e57[_0x30d4d6(0x16f)]['error'],_0x1b1162=_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)],_0x4e2b2b&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0x126)]=function(){}),_0x1b1162&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)]=function(){}));try{try{_0x1ecc25['level']++,_0x1ecc25[_0x30d4d6(0x82)]&&_0x1ecc25['autoExpandPreviousObjects'][_0x30d4d6(0x93)](_0x25df9b);var _0x343ffc,_0x15df46,_0x560771,_0x5b85a5,_0x4cff0b=[],_0x245b72=[],_0xde939b,_0x59a348=this[_0x30d4d6(0x114)](_0x25df9b),_0x367a40=_0x59a348===_0x30d4d6(0x13a),_0x2149ae=!0x1,_0x494b62=_0x59a348===_0x30d4d6(0x117),_0x3109b2=this[_0x30d4d6(0xea)](_0x59a348),_0xa55274=this[_0x30d4d6(0x102)](_0x59a348),_0x18447e=_0x3109b2||_0xa55274,_0x494779={},_0x373035=0x0,_0x2b7529=!0x1,_0xa59190,_0x11eb64=/^(([1-9]{1}[0-9]*)|0)$/;if(_0x1ecc25[_0x30d4d6(0x98)]){if(_0x367a40){if(_0x15df46=_0x25df9b['length'],_0x15df46>_0x1ecc25['elements']){for(_0x560771=0x0,_0x5b85a5=_0x1ecc25[_0x30d4d6(0x11b)],_0x343ffc=_0x560771;_0x343ffc<_0x5b85a5;_0x343ffc++)_0x245b72['push'](_0x456308[_0x30d4d6(0xc3)](_0x4cff0b,_0x25df9b,_0x59a348,_0x343ffc,_0x1ecc25));_0x2d443b[_0x30d4d6(0x119)]=!0x0;}else{for(_0x560771=0x0,_0x5b85a5=_0x15df46,_0x343ffc=_0x560771;_0x343ffc<_0x5b85a5;_0x343ffc++)_0x245b72['push'](_0x456308['_addProperty'](_0x4cff0b,_0x25df9b,_0x59a348,_0x343ffc,_0x1ecc25));}_0x1ecc25['autoExpandPropertyCount']+=_0x245b72[_0x30d4d6(0x145)];}if(!(_0x59a348==='null'||_0x59a348===_0x30d4d6(0x15c))&&!_0x3109b2&&_0x59a348!==_0x30d4d6(0x151)&&_0x59a348!==_0x30d4d6(0x13f)&&_0x59a348!==_0x30d4d6(0x108)){var _0x4524d5=_0x321518[_0x30d4d6(0x162)]||_0x1ecc25[_0x30d4d6(0x162)];if(this[_0x30d4d6(0x7f)](_0x25df9b)?(_0x343ffc=0x0,_0x25df9b[_0x30d4d6(0xee)](function(_0x3bc31f){var _0x2c0772=_0x30d4d6;if(_0x373035++,_0x1ecc25[_0x2c0772(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;return;}if(!_0x1ecc25[_0x2c0772(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x2c0772(0xcc)]>_0x1ecc25[_0x2c0772(0x16c)]){_0x2b7529=!0x0;return;}_0x245b72[_0x2c0772(0x93)](_0x456308[_0x2c0772(0xc3)](_0x4cff0b,_0x25df9b,'Set',_0x343ffc++,_0x1ecc25,function(_0x377ded){return function(){return _0x377ded;};}(_0x3bc31f)));})):this[_0x30d4d6(0x15e)](_0x25df9b)&&_0x25df9b['forEach'](function(_0x393122,_0x2eeb8a){var _0x4b9651=_0x30d4d6;if(_0x373035++,_0x1ecc25['autoExpandPropertyCount']++,_0x373035>_0x4524d5){_0x2b7529=!0x0;return;}if(!_0x1ecc25['isExpressionToEvaluate']&&_0x1ecc25[_0x4b9651(0x82)]&&_0x1ecc25[_0x4b9651(0xcc)]>_0x1ecc25[_0x4b9651(0x16c)]){_0x2b7529=!0x0;return;}var _0x4ce1af=_0x2eeb8a['toString']();_0x4ce1af[_0x4b9651(0x145)]>0x64&&(_0x4ce1af=_0x4ce1af[_0x4b9651(0x16d)](0x0,0x64)+_0x4b9651(0x16b)),_0x245b72['push'](_0x456308['_addProperty'](_0x4cff0b,_0x25df9b,_0x4b9651(0xab),_0x4ce1af,_0x1ecc25,function(_0x2ade18){return function(){return _0x2ade18;};}(_0x393122)));}),!_0x2149ae){try{for(_0xde939b in _0x25df9b)if(!(_0x367a40&&_0x11eb64[_0x30d4d6(0x6a)](_0xde939b))&&!this[_0x30d4d6(0x14d)](_0x25df9b,_0xde939b,_0x1ecc25)){if(_0x373035++,_0x1ecc25[_0x30d4d6(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;break;}if(!_0x1ecc25[_0x30d4d6(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x30d4d6(0xcc)]>_0x1ecc25[_0x30d4d6(0x16c)]){_0x2b7529=!0x0;break;}_0x245b72[_0x30d4d6(0x93)](_0x456308['_addObjectProperty'](_0x4cff0b,_0x494779,_0x25df9b,_0x59a348,_0xde939b,_0x1ecc25));}}catch{}if(_0x494779[_0x30d4d6(0xa9)]=!0x0,_0x494b62&&(_0x494779[_0x30d4d6(0x14a)]=!0x0),!_0x2b7529){var _0x2e47fb=[][_0x30d4d6(0x90)](this['_getOwnPropertyNames'](_0x25df9b))['concat'](this[_0x30d4d6(0xb2)](_0x25df9b));for(_0x343ffc=0x0,_0x15df46=_0x2e47fb[_0x30d4d6(0x145)];_0x343ffc<_0x15df46;_0x343ffc++)if(_0xde939b=_0x2e47fb[_0x343ffc],!(_0x367a40&&_0x11eb64['test'](_0xde939b[_0x30d4d6(0x124)]()))&&!this[_0x30d4d6(0x14d)](_0x25df9b,_0xde939b,_0x1ecc25)&&!_0x494779[typeof _0xde939b!='symbol'?_0x30d4d6(0x10e)+_0xde939b['toString']():_0xde939b]){if(_0x373035++,_0x1ecc25[_0x30d4d6(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;break;}if(!_0x1ecc25[_0x30d4d6(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x30d4d6(0xcc)]>_0x1ecc25[_0x30d4d6(0x16c)]){_0x2b7529=!0x0;break;}_0x245b72[_0x30d4d6(0x93)](_0x456308[_0x30d4d6(0xac)](_0x4cff0b,_0x494779,_0x25df9b,_0x59a348,_0xde939b,_0x1ecc25));}}}}}if(_0x2d443b['type']=_0x59a348,_0x18447e?(_0x2d443b[_0x30d4d6(0xcf)]=_0x25df9b[_0x30d4d6(0x101)](),this[_0x30d4d6(0x110)](_0x59a348,_0x2d443b,_0x1ecc25,_0x321518)):_0x59a348===_0x30d4d6(0xd5)?_0x2d443b[_0x30d4d6(0xcf)]=this[_0x30d4d6(0x132)]['call'](_0x25df9b):_0x59a348==='bigint'?_0x2d443b[_0x30d4d6(0xcf)]=_0x25df9b['toString']():_0x59a348===_0x30d4d6(0x8d)?_0x2d443b[_0x30d4d6(0xcf)]=this[_0x30d4d6(0x157)][_0x30d4d6(0xbf)](_0x25df9b):_0x59a348==='symbol'&&this[_0x30d4d6(0x11e)]?_0x2d443b['value']=this[_0x30d4d6(0x11e)][_0x30d4d6(0x7d)]['toString'][_0x30d4d6(0xbf)](_0x25df9b):!_0x1ecc25['depth']&&!(_0x59a348===_0x30d4d6(0x84)||_0x59a348==='undefined')&&(delete _0x2d443b[_0x30d4d6(0xcf)],_0x2d443b[_0x30d4d6(0xc5)]=!0x0),_0x2b7529&&(_0x2d443b[_0x30d4d6(0xad)]=!0x0),_0xa59190=_0x1ecc25['node'][_0x30d4d6(0xfc)],_0x1ecc25[_0x30d4d6(0xbc)][_0x30d4d6(0xfc)]=_0x2d443b,this[_0x30d4d6(0x77)](_0x2d443b,_0x1ecc25),_0x245b72[_0x30d4d6(0x145)]){for(_0x343ffc=0x0,_0x15df46=_0x245b72[_0x30d4d6(0x145)];_0x343ffc<_0x15df46;_0x343ffc++)_0x245b72[_0x343ffc](_0x343ffc);}_0x4cff0b[_0x30d4d6(0x145)]&&(_0x2d443b[_0x30d4d6(0x162)]=_0x4cff0b);}catch(_0x30245c){_0x4ccc18(_0x30245c,_0x2d443b,_0x1ecc25);}this[_0x30d4d6(0x139)](_0x25df9b,_0x2d443b),this['_treeNodePropertiesAfterFullValue'](_0x2d443b,_0x1ecc25),_0x1ecc25[_0x30d4d6(0xbc)][_0x30d4d6(0xfc)]=_0xa59190,_0x1ecc25[_0x30d4d6(0x80)]--,_0x1ecc25['autoExpand']=_0x1fed79,_0x1ecc25[_0x30d4d6(0x82)]&&_0x1ecc25[_0x30d4d6(0x112)]['pop']();}finally{_0x4e2b2b&&(_0x2f0e57[_0x30d4d6(0x16f)]['error']=_0x4e2b2b),_0x1b1162&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)]=_0x1b1162),_0x2f0e57['ninjaSuppressConsole']=_0x2d06d5;}return _0x2d443b;},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xb2)]=function(_0x3bb38d){var _0x1f9976=_0x14e14c;return Object[_0x1f9976(0x161)]?Object[_0x1f9976(0x161)](_0x3bb38d):[];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x7f)]=function(_0x296b7f){var _0xeb9306=_0x14e14c;return!!(_0x296b7f&&_0x2f0e57[_0xeb9306(0xa4)]&&this[_0xeb9306(0x8b)](_0x296b7f)===_0xeb9306(0x89)&&_0x296b7f[_0xeb9306(0xee)]);},_0x15bdba[_0x14e14c(0x7d)]['_blacklistedProperty']=function(_0x4e9662,_0x26026d,_0x2f539d){var _0x155232=_0x14e14c;if(!_0x2f539d[_0x155232(0xaa)]){let _0x3e8726=this[_0x155232(0x154)](_0x4e9662,_0x26026d);if(_0x3e8726&&_0x3e8726['get'])return!0x0;}return _0x2f539d[_0x155232(0x171)]?typeof _0x4e9662[_0x26026d]==_0x155232(0x117):!0x1;},_0x15bdba[_0x14e14c(0x7d)]['_type']=function(_0x124a0a){var _0x4d86a1=_0x14e14c,_0x401f2c='';return _0x401f2c=typeof _0x124a0a,_0x401f2c==='object'?this[_0x4d86a1(0x8b)](_0x124a0a)==='[object\\x20Array]'?_0x401f2c='array':this[_0x4d86a1(0x8b)](_0x124a0a)==='[object\\x20Date]'?_0x401f2c='date':this[_0x4d86a1(0x8b)](_0x124a0a)===_0x4d86a1(0x96)?_0x401f2c=_0x4d86a1(0x108):_0x124a0a===null?_0x401f2c=_0x4d86a1(0x84):_0x124a0a[_0x4d86a1(0xf7)]&&(_0x401f2c=_0x124a0a[_0x4d86a1(0xf7)][_0x4d86a1(0x86)]||_0x401f2c):_0x401f2c===_0x4d86a1(0x15c)&&this['_HTMLAllCollection']&&_0x124a0a instanceof this['_HTMLAllCollection']&&(_0x401f2c=_0x4d86a1(0x106)),_0x401f2c;},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x8b)]=function(_0x23e27b){var _0x11677b=_0x14e14c;return Object['prototype'][_0x11677b(0x124)][_0x11677b(0xbf)](_0x23e27b);},_0x15bdba['prototype']['_isPrimitiveType']=function(_0x48fd2d){var _0x2288a3=_0x14e14c;return _0x48fd2d==='boolean'||_0x48fd2d===_0x2288a3(0xe9)||_0x48fd2d===_0x2288a3(0x115);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x102)]=function(_0x43de66){var _0x54cdd5=_0x14e14c;return _0x43de66==='Boolean'||_0x43de66==='String'||_0x43de66===_0x54cdd5(0x143);},_0x15bdba['prototype'][_0x14e14c(0xc3)]=function(_0x258228,_0x4b4132,_0x4d9b21,_0x49b0b3,_0x464217,_0x5dc81a){var _0x17c832=this;return function(_0x4b3d78){var _0x19dd14=_0x4b0e,_0x5a116f=_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xfc)],_0x12a1bb=_0x464217[_0x19dd14(0xbc)]['index'],_0xbf4ca9=_0x464217['node'][_0x19dd14(0xc2)];_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xc2)]=_0x5a116f,_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xe5)]=typeof _0x49b0b3=='number'?_0x49b0b3:_0x4b3d78,_0x258228[_0x19dd14(0x93)](_0x17c832[_0x19dd14(0x160)](_0x4b4132,_0x4d9b21,_0x49b0b3,_0x464217,_0x5dc81a)),_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xc2)]=_0xbf4ca9,_0x464217['node'][_0x19dd14(0xe5)]=_0x12a1bb;};},_0x15bdba['prototype'][_0x14e14c(0xac)]=function(_0x5c1cd0,_0x23b2b3,_0x44c77c,_0x48ea48,_0x589029,_0x5156f9,_0x29ac29){var _0x1e74c4=_0x14e14c,_0x391ed0=this;return _0x23b2b3[typeof _0x589029!=_0x1e74c4(0x12b)?_0x1e74c4(0x10e)+_0x589029[_0x1e74c4(0x124)]():_0x589029]=!0x0,function(_0x21b666){var _0x375d93=_0x1e74c4,_0x474373=_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xfc)],_0x153c66=_0x5156f9['node'][_0x375d93(0xe5)],_0x235695=_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)];_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)]=_0x474373,_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xe5)]=_0x21b666,_0x5c1cd0[_0x375d93(0x93)](_0x391ed0[_0x375d93(0x160)](_0x44c77c,_0x48ea48,_0x589029,_0x5156f9,_0x29ac29)),_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)]=_0x235695,_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xe5)]=_0x153c66;};},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x160)]=function(_0x1aa386,_0x3078fc,_0x1639a4,_0x42fb22,_0x3ae094){var _0x4f95ad=_0x14e14c,_0x506e3d=this;_0x3ae094||(_0x3ae094=function(_0x364050,_0x484f7a){return _0x364050[_0x484f7a];});var _0x25af09=_0x1639a4[_0x4f95ad(0x124)](),_0x84ef6d=_0x42fb22[_0x4f95ad(0x11d)]||{},_0x52f17e=_0x42fb22[_0x4f95ad(0x98)],_0xf4fa20=_0x42fb22[_0x4f95ad(0x95)];try{var _0x4d0558=this[_0x4f95ad(0x15e)](_0x1aa386),_0x4225ae=_0x25af09;_0x4d0558&&_0x4225ae[0x0]==='\\x27'&&(_0x4225ae=_0x4225ae[_0x4f95ad(0x14c)](0x1,_0x4225ae[_0x4f95ad(0x145)]-0x2));var _0x20c2c6=_0x42fb22['expressionsToEvaluate']=_0x84ef6d[_0x4f95ad(0x10e)+_0x4225ae];_0x20c2c6&&(_0x42fb22[_0x4f95ad(0x98)]=_0x42fb22[_0x4f95ad(0x98)]+0x1),_0x42fb22[_0x4f95ad(0x95)]=!!_0x20c2c6;var _0x1ac563=typeof _0x1639a4==_0x4f95ad(0x12b),_0x429d6a={'name':_0x1ac563||_0x4d0558?_0x25af09:this[_0x4f95ad(0xa8)](_0x25af09)};if(_0x1ac563&&(_0x429d6a[_0x4f95ad(0x12b)]=!0x0),!(_0x3078fc===_0x4f95ad(0x13a)||_0x3078fc===_0x4f95ad(0x9d))){var _0x521078=this['_getOwnPropertyDescriptor'](_0x1aa386,_0x1639a4);if(_0x521078&&(_0x521078[_0x4f95ad(0x8a)]&&(_0x429d6a[_0x4f95ad(0xc6)]=!0x0),_0x521078[_0x4f95ad(0xf2)]&&!_0x20c2c6&&!_0x42fb22[_0x4f95ad(0xaa)]))return _0x429d6a['getter']=!0x0,this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22),_0x429d6a;}var _0x3677ff;try{_0x3677ff=_0x3ae094(_0x1aa386,_0x1639a4);}catch(_0xd1b5ff){return _0x429d6a={'name':_0x25af09,'type':_0x4f95ad(0x83),'error':_0xd1b5ff['message']},this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22),_0x429d6a;}var _0x14b6b1=this['_type'](_0x3677ff),_0x1cdb28=this[_0x4f95ad(0xea)](_0x14b6b1);if(_0x429d6a[_0x4f95ad(0x118)]=_0x14b6b1,_0x1cdb28)this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22,_0x3677ff,function(){var _0x524e07=_0x4f95ad;_0x429d6a[_0x524e07(0xcf)]=_0x3677ff['valueOf'](),!_0x20c2c6&&_0x506e3d[_0x524e07(0x110)](_0x14b6b1,_0x429d6a,_0x42fb22,{});});else{var _0x2b6e95=_0x42fb22['autoExpand']&&_0x42fb22['level']<_0x42fb22['autoExpandMaxDepth']&&_0x42fb22[_0x4f95ad(0x112)][_0x4f95ad(0x73)](_0x3677ff)<0x0&&_0x14b6b1!=='function'&&_0x42fb22[_0x4f95ad(0xcc)]<_0x42fb22[_0x4f95ad(0x16c)];_0x2b6e95||_0x42fb22[_0x4f95ad(0x80)]<_0x52f17e||_0x20c2c6?this[_0x4f95ad(0x167)](_0x429d6a,_0x3677ff,_0x42fb22,_0x20c2c6||{}):this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22,_0x3677ff,function(){var _0x4e4218=_0x4f95ad;_0x14b6b1===_0x4e4218(0x84)||_0x14b6b1===_0x4e4218(0x15c)||(delete _0x429d6a['value'],_0x429d6a[_0x4e4218(0xc5)]=!0x0);});}return _0x429d6a;}finally{_0x42fb22[_0x4f95ad(0x11d)]=_0x84ef6d,_0x42fb22[_0x4f95ad(0x98)]=_0x52f17e,_0x42fb22[_0x4f95ad(0x95)]=_0xf4fa20;}},_0x15bdba[_0x14e14c(0x7d)]['_capIfString']=function(_0x26b3ce,_0x532d93,_0x9260db,_0x2c5aae){var _0x17804f=_0x14e14c,_0x463932=_0x2c5aae[_0x17804f(0xce)]||_0x9260db[_0x17804f(0xce)];if((_0x26b3ce==='string'||_0x26b3ce===_0x17804f(0x151))&&_0x532d93[_0x17804f(0xcf)]){let _0xbd9509=_0x532d93[_0x17804f(0xcf)]['length'];_0x9260db[_0x17804f(0xbe)]+=_0xbd9509,_0x9260db[_0x17804f(0xbe)]>_0x9260db['totalStrLength']?(_0x532d93[_0x17804f(0xc5)]='',delete _0x532d93['value']):_0xbd9509>_0x463932&&(_0x532d93[_0x17804f(0xc5)]=_0x532d93['value']['substr'](0x0,_0x463932),delete _0x532d93[_0x17804f(0xcf)]);}},_0x15bdba['prototype']['_isMap']=function(_0x2f18b8){var _0x50a123=_0x14e14c;return!!(_0x2f18b8&&_0x2f0e57[_0x50a123(0xab)]&&this[_0x50a123(0x8b)](_0x2f18b8)===_0x50a123(0x10b)&&_0x2f18b8[_0x50a123(0xee)]);},_0x15bdba[_0x14e14c(0x7d)]['_propertyName']=function(_0x49bb76){var _0x4d542f=_0x14e14c;if(_0x49bb76[_0x4d542f(0xe6)](/^\\d+$/))return _0x49bb76;var _0xdb8fca;try{_0xdb8fca=JSON['stringify'](''+_0x49bb76);}catch{_0xdb8fca='\\x22'+this[_0x4d542f(0x8b)](_0x49bb76)+'\\x22';}return _0xdb8fca['match'](/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?_0xdb8fca=_0xdb8fca[_0x4d542f(0x14c)](0x1,_0xdb8fca[_0x4d542f(0x145)]-0x2):_0xdb8fca=_0xdb8fca['replace'](/'/g,'\\x5c\\x27')[_0x4d542f(0xe0)](/\\\\"/g,'\\x22')[_0x4d542f(0xe0)](/(^"|"$)/g,'\\x27'),_0xdb8fca;},_0x15bdba['prototype'][_0x14e14c(0xa3)]=function(_0x59d7f0,_0x435c19,_0x323724,_0x509245){var _0x4ce022=_0x14e14c;this['_treeNodePropertiesBeforeFullValue'](_0x59d7f0,_0x435c19),_0x509245&&_0x509245(),this[_0x4ce022(0x139)](_0x323724,_0x59d7f0),this[_0x4ce022(0x16e)](_0x59d7f0,_0x435c19);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x77)]=function(_0x37cbfb,_0x2edc5d){var _0x3be80d=_0x14e14c;this['_setNodeId'](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0x75)](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0x130)](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0xc7)](_0x37cbfb,_0x2edc5d);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xec)]=function(_0x9f184a,_0x1abd18){},_0x15bdba[_0x14e14c(0x7d)]['_setNodeQueryPath']=function(_0x109952,_0x84e307){},_0x15bdba[_0x14e14c(0x7d)]['_setNodeLabel']=function(_0x392bdd,_0x55902b){},_0x15bdba['prototype'][_0x14e14c(0x140)]=function(_0x23dc27){return _0x23dc27===this['_undefined'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x16e)]=function(_0x48382c,_0x444fa8){var _0x5bc6ef=_0x14e14c;this[_0x5bc6ef(0xc9)](_0x48382c,_0x444fa8),this['_setNodeExpandableState'](_0x48382c),_0x444fa8[_0x5bc6ef(0x6f)]&&this['_sortProps'](_0x48382c),this[_0x5bc6ef(0xd8)](_0x48382c,_0x444fa8),this[_0x5bc6ef(0xd9)](_0x48382c,_0x444fa8),this[_0x5bc6ef(0xa2)](_0x48382c);},_0x15bdba[_0x14e14c(0x7d)]['_additionalMetadata']=function(_0x5a2ca4,_0x13ba41){var _0x167e9f=_0x14e14c;try{_0x5a2ca4&&typeof _0x5a2ca4[_0x167e9f(0x145)]==_0x167e9f(0x115)&&(_0x13ba41['length']=_0x5a2ca4[_0x167e9f(0x145)]);}catch{}if(_0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x115)||_0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x143)){if(isNaN(_0x13ba41[_0x167e9f(0xcf)]))_0x13ba41[_0x167e9f(0x9e)]=!0x0,delete _0x13ba41['value'];else switch(_0x13ba41[_0x167e9f(0xcf)]){case Number[_0x167e9f(0xda)]:_0x13ba41['positiveInfinity']=!0x0,delete _0x13ba41[_0x167e9f(0xcf)];break;case Number[_0x167e9f(0x6e)]:_0x13ba41[_0x167e9f(0xf5)]=!0x0,delete _0x13ba41['value'];break;case 0x0:this[_0x167e9f(0xbb)](_0x13ba41[_0x167e9f(0xcf)])&&(_0x13ba41['negativeZero']=!0x0);break;}}else _0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x117)&&typeof _0x5a2ca4[_0x167e9f(0x86)]==_0x167e9f(0xe9)&&_0x5a2ca4[_0x167e9f(0x86)]&&_0x13ba41['name']&&_0x5a2ca4[_0x167e9f(0x86)]!==_0x13ba41['name']&&(_0x13ba41['funcName']=_0x5a2ca4[_0x167e9f(0x86)]);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xbb)]=function(_0x1e877b){return 0x1/_0x1e877b===Number['NEGATIVE_INFINITY'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xf6)]=function(_0x4fd3a6){var _0x4f85fe=_0x14e14c;!_0x4fd3a6['props']||!_0x4fd3a6[_0x4f85fe(0x162)]['length']||_0x4fd3a6[_0x4f85fe(0x118)]==='array'||_0x4fd3a6[_0x4f85fe(0x118)]===_0x4f85fe(0xab)||_0x4fd3a6[_0x4f85fe(0x118)]===_0x4f85fe(0xa4)||_0x4fd3a6[_0x4f85fe(0x162)][_0x4f85fe(0xa5)](function(_0x5c1ef5,_0x4a7ec6){var _0x221367=_0x4f85fe,_0x2ebddf=_0x5c1ef5[_0x221367(0x86)][_0x221367(0x138)](),_0x5797ad=_0x4a7ec6[_0x221367(0x86)][_0x221367(0x138)]();return _0x2ebddf<_0x5797ad?-0x1:_0x2ebddf>_0x5797ad?0x1:0x0;});},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xd8)]=function(_0x53f4c6,_0x4f8fda){var _0x4549a2=_0x14e14c;if(!(_0x4f8fda['noFunctions']||!_0x53f4c6[_0x4549a2(0x162)]||!_0x53f4c6[_0x4549a2(0x162)][_0x4549a2(0x145)])){for(var _0x32873c=[],_0xb2b825=[],_0x527dd6=0x0,_0x3292f1=_0x53f4c6['props']['length'];_0x527dd6<_0x3292f1;_0x527dd6++){var _0x32c24e=_0x53f4c6[_0x4549a2(0x162)][_0x527dd6];_0x32c24e[_0x4549a2(0x118)]===_0x4549a2(0x117)?_0x32873c[_0x4549a2(0x93)](_0x32c24e):_0xb2b825[_0x4549a2(0x93)](_0x32c24e);}if(!(!_0xb2b825['length']||_0x32873c['length']<=0x1)){_0x53f4c6[_0x4549a2(0x162)]=_0xb2b825;var _0x4a1421={'functionsNode':!0x0,'props':_0x32873c};this[_0x4549a2(0xec)](_0x4a1421,_0x4f8fda),this['_setNodeLabel'](_0x4a1421,_0x4f8fda),this[_0x4549a2(0x71)](_0x4a1421),this[_0x4549a2(0xc7)](_0x4a1421,_0x4f8fda),_0x4a1421['id']+='\\x20f',_0x53f4c6[_0x4549a2(0x162)][_0x4549a2(0x105)](_0x4a1421);}}},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xd9)]=function(_0xbd163b,_0x34b9f2){},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x71)]=function(_0x2dba9d){},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x11f)]=function(_0x139d1f){var _0x1ff41f=_0x14e14c;return Array[_0x1ff41f(0x99)](_0x139d1f)||typeof _0x139d1f==_0x1ff41f(0x15d)&&this[_0x1ff41f(0x8b)](_0x139d1f)===_0x1ff41f(0x10a);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xc7)]=function(_0x5de8d2,_0x564e51){},_0x15bdba['prototype'][_0x14e14c(0xa2)]=function(_0x419879){var _0x11162c=_0x14e14c;delete _0x419879['_hasSymbolPropertyOnItsPath'],delete _0x419879[_0x11162c(0x109)],delete _0x419879['_hasMapOnItsPath'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x130)]=function(_0x59d1c0,_0x3aa4e2){};let _0x49843c=new _0x15bdba(),_0x44933a={'props':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0x162)]||0x64,'elements':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0x11b)]||0x64,'strLength':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0xce)]||0x400*0x32,'totalStrLength':_0x157890['defaultLimits'][_0x14e14c(0x14e)]||0x400*0x32,'autoExpandLimit':_0x157890['defaultLimits']['autoExpandLimit']||0x1388,'autoExpandMaxDepth':_0x157890[_0x14e14c(0xb6)]['autoExpandMaxDepth']||0xa},_0x2434a4={'props':_0x157890['reducedLimits'][_0x14e14c(0x162)]||0x5,'elements':_0x157890[_0x14e14c(0x12a)][_0x14e14c(0x11b)]||0x5,'strLength':_0x157890[_0x14e14c(0x12a)]['strLength']||0x100,'totalStrLength':_0x157890[_0x14e14c(0x12a)][_0x14e14c(0x14e)]||0x100*0x3,'autoExpandLimit':_0x157890['reducedLimits'][_0x14e14c(0x16c)]||0x1e,'autoExpandMaxDepth':_0x157890[_0x14e14c(0x12a)]['autoExpandMaxDepth']||0x2};if(_0x2730b9){let _0x3e1b5e=_0x49843c[_0x14e14c(0x167)][_0x14e14c(0x8c)](_0x49843c);_0x49843c[_0x14e14c(0x167)]=function(_0x1652e0,_0x3cfbbf,_0x2dcdac,_0x11b90d){return _0x3e1b5e(_0x1652e0,_0x2730b9(_0x3cfbbf),_0x2dcdac,_0x11b90d);};}function _0x21f848(_0x17007d,_0x35a97d,_0x22fa88,_0x39b20f,_0x46b19e,_0x71e2b7){var _0x472084=_0x14e14c;let _0x2f7e13,_0x28c36b;try{_0x28c36b=_0x59ca1d(),_0x2f7e13=_0x2e2eb5[_0x35a97d],!_0x2f7e13||_0x28c36b-_0x2f7e13['ts']>_0x47dd45['perLogpoint'][_0x472084(0x12f)]&&_0x2f7e13[_0x472084(0xb3)]&&_0x2f7e13[_0x472084(0x76)]/_0x2f7e13[_0x472084(0xb3)]<_0x47dd45[_0x472084(0x166)][_0x472084(0xdc)]?(_0x2e2eb5[_0x35a97d]=_0x2f7e13={'count':0x0,'time':0x0,'ts':_0x28c36b},_0x2e2eb5[_0x472084(0x128)]={}):_0x28c36b-_0x2e2eb5['hits']['ts']>_0x47dd45[_0x472084(0x16a)]['resetWhenQuietMs']&&_0x2e2eb5['hits'][_0x472084(0xb3)]&&_0x2e2eb5['hits']['time']/_0x2e2eb5['hits'][_0x472084(0xb3)]<_0x47dd45['global']['resetOnProcessingTimeAverageMs']&&(_0x2e2eb5['hits']={});let _0x1e7025=[],_0x358350=_0x2f7e13['reduceLimits']||_0x2e2eb5[_0x472084(0x128)][_0x472084(0x12c)]?_0x2434a4:_0x44933a,_0x1e1be5=_0x369196=>{var _0x238243=_0x472084;let _0x1f647e={};return _0x1f647e[_0x238243(0x162)]=_0x369196[_0x238243(0x162)],_0x1f647e[_0x238243(0x11b)]=_0x369196['elements'],_0x1f647e['strLength']=_0x369196[_0x238243(0xce)],_0x1f647e['totalStrLength']=_0x369196[_0x238243(0x14e)],_0x1f647e[_0x238243(0x16c)]=_0x369196[_0x238243(0x16c)],_0x1f647e['autoExpandMaxDepth']=_0x369196['autoExpandMaxDepth'],_0x1f647e[_0x238243(0x6f)]=!0x1,_0x1f647e[_0x238243(0x171)]=!_0x105dac,_0x1f647e[_0x238243(0x98)]=0x1,_0x1f647e[_0x238243(0x80)]=0x0,_0x1f647e[_0x238243(0xb4)]='root_exp_id',_0x1f647e['rootExpression']=_0x238243(0x11c),_0x1f647e[_0x238243(0x82)]=!0x0,_0x1f647e[_0x238243(0x112)]=[],_0x1f647e[_0x238243(0xcc)]=0x0,_0x1f647e['resolveGetters']=_0x157890[_0x238243(0xaa)],_0x1f647e[_0x238243(0xbe)]=0x0,_0x1f647e[_0x238243(0xbc)]={'current':void 0x0,'parent':void 0x0,'index':0x0},_0x1f647e;};for(var _0x46d82b=0x0;_0x46d82b<_0x46b19e[_0x472084(0x145)];_0x46d82b++)_0x1e7025['push'](_0x49843c[_0x472084(0x167)]({'timeNode':_0x17007d===_0x472084(0x76)||void 0x0},_0x46b19e[_0x46d82b],_0x1e1be5(_0x358350),{}));if(_0x17007d==='trace'||_0x17007d===_0x472084(0x126)){let _0x61389a=Error[_0x472084(0xfe)];try{Error[_0x472084(0xfe)]=0x1/0x0,_0x1e7025['push'](_0x49843c['serialize']({'stackNode':!0x0},new Error()[_0x472084(0x15f)],_0x1e1be5(_0x358350),{'strLength':0x1/0x0}));}finally{Error[_0x472084(0xfe)]=_0x61389a;}}return{'method':_0x472084(0xa7),'version':_0x13b43c,'args':[{'ts':_0x22fa88,'session':_0x39b20f,'args':_0x1e7025,'id':_0x35a97d,'context':_0x71e2b7}]};}catch(_0x70970b){return{'method':'log','version':_0x13b43c,'args':[{'ts':_0x22fa88,'session':_0x39b20f,'args':[{'type':_0x472084(0x83),'error':_0x70970b&&_0x70970b['message']}],'id':_0x35a97d,'context':_0x71e2b7}]};}finally{try{if(_0x2f7e13&&_0x28c36b){let _0x12cb09=_0x59ca1d();_0x2f7e13[_0x472084(0xb3)]++,_0x2f7e13[_0x472084(0x76)]+=_0x300ed1(_0x28c36b,_0x12cb09),_0x2f7e13['ts']=_0x12cb09,_0x2e2eb5[_0x472084(0x128)]['count']++,_0x2e2eb5['hits'][_0x472084(0x76)]+=_0x300ed1(_0x28c36b,_0x12cb09),_0x2e2eb5[_0x472084(0x128)]['ts']=_0x12cb09,(_0x2f7e13[_0x472084(0xb3)]>_0x47dd45[_0x472084(0x166)][_0x472084(0x137)]||_0x2f7e13[_0x472084(0x76)]>_0x47dd45['perLogpoint']['reduceOnAccumulatedProcessingTimeMs'])&&(_0x2f7e13[_0x472084(0x12c)]=!0x0),(_0x2e2eb5[_0x472084(0x128)][_0x472084(0xb3)]>_0x47dd45[_0x472084(0x16a)][_0x472084(0x137)]||_0x2e2eb5[_0x472084(0x128)][_0x472084(0x76)]>_0x47dd45[_0x472084(0x16a)]['reduceOnAccumulatedProcessingTimeMs'])&&(_0x2e2eb5[_0x472084(0x128)][_0x472084(0x12c)]=!0x0);}}catch{}}}return _0x21f848;}function G(_0x3be696){var _0x46c6d9=_0x2d0e46;if(_0x3be696&&typeof _0x3be696==_0x46c6d9(0x15d)&&_0x3be696[_0x46c6d9(0xf7)])switch(_0x3be696[_0x46c6d9(0xf7)]['name']){case _0x46c6d9(0x147):return _0x3be696['hasOwnProperty'](Symbol[_0x46c6d9(0x127)])?Promise[_0x46c6d9(0xef)]():_0x3be696;case _0x46c6d9(0x100):return Promise['resolve']();}return _0x3be696;}function _0x25c1(){var _0x23e53f=['584FNhvcu','depth','isArray','failed\\x20to\\x20connect\\x20to\\x20host:\\x20','181696WbLlCU','port','Error','nan','unref','emulator','url','_cleanNode','_processTreeNodeResult','Set','sort','1HmYSRt','log','_propertyName','_p_length','resolveGetters','Map','_addObjectProperty','cappedProps',',\\x20see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','background:\\x20rgb(30,30,30);\\x20color:\\x20rgb(255,213,92)','_socket','ExpoDevice','_getOwnPropertySymbols','count','expId','406426XGONyb','defaultLimits','remix','67669xJppUN','endsWith','send','_isNegativeZero','node','194070ShBIXL','allStrLength','call','33763','5FsGXyE','parent','_addProperty','_connecting','capped','setter','_setNodePermissions','15179373iCDJWQ','_setNodeLabel','getWebSocketClass','react-native','autoExpandPropertyCount','default','strLength','value','then','_WebSocket','_quotedRegExp','host','hrtime','date','getOwnPropertyDescriptor','_consoleNinjaAllowedToStart','_addFunctionsNode','_addLoadNode','POSITIVE_INFINITY','env','resetOnProcessingTimeAverageMs','_attemptToReconnectShortly','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20refreshing\\x20the\\x20page\\x20may\\x20help;\\x20also\\x20see\\x20','_WebSocketClass','replace','perf_hooks','_reconnectTimeout','gateway.docker.internal','_allowedToConnectOnSend','index','match','10.0.2.2','getOwnPropertyNames','string','_isPrimitiveType','ninjaSuppressConsole','_setNodeId','warn','forEach','resolve','import(\\x27url\\x27)','fromCharCode','get','Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','now','negativeInfinity','_sortProps','constructor','onmessage','eventReceivedCallback','message','onopen','current','_extendedWarning','stackTraceLimit','expo','bound\\x20Promise','valueOf','_isPrimitiveWrapperType','Symbol','_console_ninja','unshift','HTMLAllCollection','data','bigint','_hasSetOnItsPath','[object\\x20Array]','[object\\x20Map]','_disposeWebsocket','return\\x20import(url.pathToFileURL(path.join(nodeModules,\\x20\\x27ws/index.js\\x27)).toString());','_p_','logger\\x20websocket\\x20error','_capIfString','origin','autoExpandPreviousObjects','_ninjaIgnoreNextError','_type','number','close','function','type','cappedElements','failed\\x20to\\x20find\\x20and\\x20load\\x20WebSocket','elements','root_exp','expressionsToEvaluate','_Symbol','_isArray','timeStamp','_connectToHostNow','includes','_connected','toString','NEXT_RUNTIME','error','iterator','hits','modules','reducedLimits','symbol','reduceLimits','args','\\x20browser','resetWhenQuietMs','_setNodeExpressionPath','next.js','_dateToString','charAt','8013680rSmsWy','_keyStrRegExp','startsWith','reduceOnCount','toLowerCase','_additionalMetadata','array','osName','logger\\x20failed\\x20to\\x20connect\\x20to\\x20host,\\x20see\\x20','%c\\x20Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','_ws','Buffer','_isUndefined','1777834244956','_connectAttemptCount','Number','edge','length',["localhost","127.0.0.1","example.cypress.io","10.0.2.2","henry-tercero-Victus-by-HP-Gaming-Laptop-15-fa2xxx","192.168.1.82"],'Promise','path','_console_ninja_session','_p_name','disabledLog','substr','_blacklistedProperty','totalStrLength','location','reduceOnAccumulatedProcessingTimeMs','String','elapsed','stringify','_getOwnPropertyDescriptor','performance','method','_regExpToString','_inNextEdge','versions','9GpoAse','nodeModules','undefined','object','_isMap','stack','_property','getOwnPropertySymbols','props','angular','process','_allowedToSend','perLogpoint','serialize','onerror','hostname','global','...','autoExpandLimit','slice','_treeNodePropertiesAfterFullValue','console','reload','noFunctions','_maxConnectAttemptCount','test','readyState','WebSocket','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20restarting\\x20the\\x20process\\x20may\\x20help;\\x20also\\x20see\\x20','NEGATIVE_INFINITY','sortProps','reducePolicy','_setNodeExpandableState','parse','indexOf','_undefined','_setNodeQueryPath','time','_treeNodePropertiesBeforeFullValue','coverage','_webSocketErrorDocsLink','see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.',{"resolveGetters":false,"defaultLimits":{"props":100,"elements":100,"strLength":51200,"totalStrLength":51200,"autoExpandLimit":5000,"autoExpandMaxDepth":10},"reducedLimits":{"props":5,"elements":5,"strLength":256,"totalStrLength":768,"autoExpandLimit":30,"autoExpandMaxDepth":2},"reducePolicy":{"perLogpoint":{"reduceOnCount":50,"reduceOnAccumulatedProcessingTimeMs":100,"resetWhenQuietMs":500,"resetOnProcessingTimeAverageMs":100},"global":{"reduceOnCount":1000,"reduceOnAccumulatedProcessingTimeMs":300,"resetWhenQuietMs":50,"resetOnProcessingTimeAverageMs":100}}},'2406444klbbNi','prototype','some','_isSet','level','catch','autoExpand','unknown','null','trace','name','https://tinyurl.com/37x8b79t','_sendErrorMessage','[object\\x20Set]','set','_objectToString','bind','RegExp','_getOwnPropertyNames','127.0.0.1','concat','onclose','_inBrowser','push','toUpperCase','isExpressionToEvaluate','[object\\x20BigInt]'];_0x25c1=function(){return _0x23e53f;};return _0x25c1();}((_0x310788,_0x34a169,_0xda7e90,_0x2b96e0,_0xbdb288,_0xb7253e,_0x95c4a4,_0x17022f,_0x2075e1,_0x4b9be4,_0xfe705b,_0xbd257b)=>{var _0x5c26f9=_0x2d0e46;if(_0x310788[_0x5c26f9(0x104)])return _0x310788[_0x5c26f9(0x104)];let _0x5991f1={'consoleLog':()=>{},'consoleTrace':()=>{},'consoleTime':()=>{},'consoleTimeEnd':()=>{},'autoLog':()=>{},'autoLogMany':()=>{},'autoTraceMany':()=>{},'coverage':()=>{},'autoTrace':()=>{},'autoTime':()=>{},'autoTimeEnd':()=>{}};if(!X(_0x310788,_0x17022f,_0xbdb288))return _0x310788[_0x5c26f9(0x104)]=_0x5991f1,_0x310788['_console_ninja'];let _0x4b5c88=b(_0x310788),_0xb6ade8=_0x4b5c88['elapsed'],_0x47a25b=_0x4b5c88[_0x5c26f9(0x120)],_0x3e6e1e=_0x4b5c88[_0x5c26f9(0xf4)],_0x2c8192={'hits':{},'ts':{}},_0x242dc4=J(_0x310788,_0x2075e1,_0x2c8192,_0xb7253e,_0xbd257b,_0xbdb288===_0x5c26f9(0x131)?G:void 0x0),_0xa6227d=(_0x57a80d,_0x2aff63,_0x2519e5,_0x1505b7,_0x2df6ce,_0x1cd947)=>{var _0x429ab5=_0x5c26f9;let _0x20b358=_0x310788[_0x429ab5(0x104)];try{return _0x310788[_0x429ab5(0x104)]=_0x5991f1,_0x242dc4(_0x57a80d,_0x2aff63,_0x2519e5,_0x1505b7,_0x2df6ce,_0x1cd947);}finally{_0x310788[_0x429ab5(0x104)]=_0x20b358;}},_0x53c51e=_0x5ae6ca=>{_0x2c8192['ts'][_0x5ae6ca]=_0x47a25b();},_0x3a2f9a=(_0x5852d8,_0x300afc)=>{var _0x4e6575=_0x5c26f9;let _0x32dd38=_0x2c8192['ts'][_0x300afc];if(delete _0x2c8192['ts'][_0x300afc],_0x32dd38){let _0x1c1d91=_0xb6ade8(_0x32dd38,_0x47a25b());_0x15ff32(_0xa6227d(_0x4e6575(0x76),_0x5852d8,_0x3e6e1e(),_0x3cc683,[_0x1c1d91],_0x300afc));}},_0x2e42ea=_0x4e959d=>{var _0x22e95d=_0x5c26f9,_0x25cb91;return _0xbdb288===_0x22e95d(0x131)&&_0x310788[_0x22e95d(0x111)]&&((_0x25cb91=_0x4e959d==null?void 0x0:_0x4e959d[_0x22e95d(0x12d)])==null?void 0x0:_0x25cb91[_0x22e95d(0x145)])&&(_0x4e959d[_0x22e95d(0x12d)][0x0][_0x22e95d(0x111)]=_0x310788[_0x22e95d(0x111)]),_0x4e959d;};_0x310788['_console_ninja']={'consoleLog':(_0x57e34e,_0x1291ab)=>{var _0x2ca6cf=_0x5c26f9;_0x310788[_0x2ca6cf(0x16f)]['log'][_0x2ca6cf(0x86)]!==_0x2ca6cf(0x14b)&&_0x15ff32(_0xa6227d(_0x2ca6cf(0xa7),_0x57e34e,_0x3e6e1e(),_0x3cc683,_0x1291ab));},'consoleTrace':(_0x2bceca,_0x2e6407)=>{var _0x16a162=_0x5c26f9,_0x197dfe,_0x147761;_0x310788[_0x16a162(0x16f)][_0x16a162(0xa7)][_0x16a162(0x86)]!=='disabledTrace'&&((_0x147761=(_0x197dfe=_0x310788[_0x16a162(0x164)])==null?void 0x0:_0x197dfe[_0x16a162(0x159)])!=null&&_0x147761[_0x16a162(0xbc)]&&(_0x310788[_0x16a162(0x113)]=!0x0),_0x15ff32(_0x2e42ea(_0xa6227d('trace',_0x2bceca,_0x3e6e1e(),_0x3cc683,_0x2e6407))));},'consoleError':(_0x383b9b,_0x5a7771)=>{var _0x132cf8=_0x5c26f9;_0x310788[_0x132cf8(0x113)]=!0x0,_0x15ff32(_0x2e42ea(_0xa6227d(_0x132cf8(0x126),_0x383b9b,_0x3e6e1e(),_0x3cc683,_0x5a7771)));},'consoleTime':_0x3363f7=>{_0x53c51e(_0x3363f7);},'consoleTimeEnd':(_0x27785a,_0x2648d7)=>{_0x3a2f9a(_0x2648d7,_0x27785a);},'autoLog':(_0x4aebf6,_0x392081)=>{var _0x3a473f=_0x5c26f9;_0x15ff32(_0xa6227d(_0x3a473f(0xa7),_0x392081,_0x3e6e1e(),_0x3cc683,[_0x4aebf6]));},'autoLogMany':(_0x2fc044,_0x372be9)=>{var _0x39bffd=_0x5c26f9;_0x15ff32(_0xa6227d(_0x39bffd(0xa7),_0x2fc044,_0x3e6e1e(),_0x3cc683,_0x372be9));},'autoTrace':(_0x34c5e8,_0x42347d)=>{var _0x5abd64=_0x5c26f9;_0x15ff32(_0x2e42ea(_0xa6227d(_0x5abd64(0x85),_0x42347d,_0x3e6e1e(),_0x3cc683,[_0x34c5e8])));},'autoTraceMany':(_0xa13ed2,_0x156a4e)=>{_0x15ff32(_0x2e42ea(_0xa6227d('trace',_0xa13ed2,_0x3e6e1e(),_0x3cc683,_0x156a4e)));},'autoTime':(_0x40c075,_0x354404,_0x580725)=>{_0x53c51e(_0x580725);},'autoTimeEnd':(_0x169ff4,_0x1a7c4e,_0x3eadb8)=>{_0x3a2f9a(_0x1a7c4e,_0x3eadb8);},'coverage':_0xb8473d=>{var _0x5b2de5=_0x5c26f9;_0x15ff32({'method':_0x5b2de5(0x78),'version':_0xb7253e,'args':[{'id':_0xb8473d}]});}};let _0x15ff32=H(_0x310788,_0x34a169,_0xda7e90,_0x2b96e0,_0xbdb288,_0x4b9be4,_0xfe705b),_0x3cc683=_0x310788[_0x5c26f9(0x149)];return _0x310788[_0x5c26f9(0x104)];})(globalThis,_0x2d0e46(0x8f),_0x2d0e46(0xc0),"/home/henry-tercero/.vscode/extensions/wallabyjs.console-ninja-1.0.526/node_modules",'vite','1.0.0',_0x2d0e46(0x141),_0x2d0e46(0x146),'','','1',_0x2d0e46(0x7b));`);
  } catch (e) {
    console.error(e);
  }
}
function oo_tx$1(i, ...v) {
  try {
    oo_cm$2().consoleError(i, v);
  } catch (e) {
  }
  return v;
}
const { ipcMain: ipcMain$e } = _electron;
function registerSettingsIpc(service) {
  ipcMain$e.handle("settings:get-all", wrap(() => service.getAll()));
  ipcMain$e.handle("settings:get", wrap((_e, key) => service.get(key)));
  ipcMain$e.handle("settings:get-by-category", wrap((_e, category) => service.getByCategory(category)));
  ipcMain$e.handle("settings:set", wrap((_e, key, value) => {
    service.set(key, value);
    return true;
  }));
  ipcMain$e.handle("settings:upsert", wrap((_e, key, value) => {
    service.upsert(key, value);
    return true;
  }));
}
function createCategoriesRepository(db) {
  const stmts = {
    findAll: db.prepare("SELECT id, name, is_active FROM categories ORDER BY name"),
    findActive: db.prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name"),
    insert: db.prepare("INSERT INTO categories (name) VALUES (@name)"),
    update: db.prepare("UPDATE categories SET name = @name WHERE id = @id"),
    setActive: db.prepare("UPDATE categories SET is_active = @active WHERE id = @id")
  };
  return {
    /** @returns {CategoryRow[]} */
    findAll() {
      return stmts.findAll.all();
    },
    /** @returns {Pick<CategoryRow,'id'|'name'>[]} */
    findActive() {
      return stmts.findActive.all();
    },
    /** @param {string} name @returns {number} */
    create(name) {
      return Number(stmts.insert.run({ name }).lastInsertRowid);
    },
    /** @param {number} id @param {string} name */
    update(id, name) {
      stmts.update.run({ id, name });
    },
    /** @param {number} id @param {0|1} active */
    setActive(id, active) {
      stmts.setActive.run({ id, active });
    }
  };
}
function createCategoriesService(repo) {
  return {
    list() {
      return repo.findAll();
    },
    listActive() {
      return repo.findActive();
    },
    create(name) {
      const trimmed = (name ?? "").trim();
      if (!trimmed) throw new Error("El nombre de la categoría es requerido");
      const id = repo.create(trimmed);
      return { id, name: trimmed, is_active: 1 };
    },
    update(id, name) {
      const trimmed = (name ?? "").trim();
      if (!trimmed) throw new Error("El nombre de la categoría es requerido");
      repo.update(id, trimmed);
      return { id, name: trimmed, is_active: 1 };
    },
    setActive(id, active) {
      repo.setActive(id, active ? 1 : 0);
    }
  };
}
const { ipcMain: ipcMain$d } = _electron;
function registerCategoriesIpc(service) {
  ipcMain$d.handle("categories:list", wrap(() => service.list()));
  ipcMain$d.handle("categories:list-active", wrap(() => service.listActive()));
  ipcMain$d.handle("categories:create", wrap((_e, name) => service.create(name)));
  ipcMain$d.handle("categories:update", wrap((_e, id, name) => service.update(id, name)));
  ipcMain$d.handle("categories:set-active", wrap((_e, id, active) => service.setActive(id, active)));
}
const COLS$1 = "id, code, name, price, stock, category, brand, location, condition, min_stock, is_active";
function createProductsRepository(db) {
  const stmts = {
    selectAll: db.prepare(
      `SELECT ${COLS$1} FROM products ORDER BY name`
    ),
    selectActive: db.prepare(
      `SELECT ${COLS$1} FROM products WHERE is_active = 1 ORDER BY name`
    ),
    selectById: db.prepare(
      `SELECT ${COLS$1} FROM products WHERE id = ?`
    ),
    search: db.prepare(
      `SELECT ${COLS$1} FROM products
        WHERE (name LIKE ? OR code LIKE ? OR category LIKE ?)
        ORDER BY name`
    ),
    insert: db.prepare(
      `INSERT INTO products (code, name, price, stock, category, brand, location, condition, min_stock, is_active)
       VALUES (@code, @name, @price, @stock, @category, @brand, @location, @condition, @min_stock, 1)`
    ),
    update: db.prepare(
      `UPDATE products
          SET name      = @name,
              price     = @price,
              category  = @category,
              brand     = @brand,
              location  = @location,
              condition = @condition,
              min_stock = @min_stock
        WHERE id = @id`
    ),
    setActive: db.prepare(
      `UPDATE products SET is_active = @active WHERE id = @id`
    ),
    adjustStock: db.prepare(
      `UPDATE products SET stock = MAX(0, stock + @delta) WHERE id = @id`
    )
  };
  return {
    /** @returns {ProductRow[]} */
    findAll() {
      return stmts.selectAll.all();
    },
    /** @returns {ProductRow[]} */
    findActive() {
      return stmts.selectActive.all();
    },
    /**
     * @param {number} id
     * @returns {ProductRow | undefined}
     */
    findById(id) {
      return stmts.selectById.get(id);
    },
    /**
     * @param {string} query
     * @returns {ProductRow[]}
     */
    search(query) {
      const like = `%${query}%`;
      return stmts.search.all(like, like, like);
    },
    /**
     * @param {{ code: string, name: string, price: number, stock: number,
     *           category: string, brand: string, location: string,
     *           condition: string, min_stock: number }} data
     * @returns {number} new id
     */
    create(data) {
      const info = stmts.insert.run(data);
      return Number(info.lastInsertRowid);
    },
    /**
     * @param {number} id
     * @param {{ name: string, price: number, category: string, brand: string,
     *           location: string, condition: string, min_stock: number }} data
     */
    update(id, data) {
      stmts.update.run({ ...data, id });
    },
    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(id, active) {
      stmts.setActive.run({ id, active });
    },
    /**
     * @param {number} id
     * @param {number} delta  positive = entrada, negative = salida
     */
    adjustStock(id, delta) {
      stmts.adjustStock.run({ id, delta });
    }
  };
}
function createProductsService(repo) {
  function assertId(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error(`product id invalido: ${id}`), {
        code: "PRODUCT_INVALID_ID"
      });
    }
  }
  function assertExists(id) {
    assertId(id);
    const row = repo.findById(id);
    if (!row) {
      throw Object.assign(new Error(`producto no encontrado: ${id}`), {
        code: "PRODUCT_NOT_FOUND"
      });
    }
    return row;
  }
  return {
    /** Todos los productos (activos e inactivos). */
    list() {
      return repo.findAll();
    },
    /** Solo los productos activos (para POS y búsqueda rápida). */
    listActive() {
      return repo.findActive();
    },
    /** @param {string} query */
    search(query) {
      const q = typeof query === "string" ? query.trim() : "";
      if (q.length === 0) return repo.findActive();
      return repo.search(q);
    },
    /** @param {number} id */
    getById(id) {
      assertId(id);
      return repo.findById(id) ?? null;
    },
    /** @param {ProductInput} input */
    create(input) {
      const code = (input.code ?? "").trim();
      const name = (input.name ?? "").trim();
      if (!code) throw Object.assign(new Error("code requerido"), { code: "PRODUCT_MISSING_CODE" });
      if (!name) throw Object.assign(new Error("name requerido"), { code: "PRODUCT_MISSING_NAME" });
      const price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error("price invalido"), { code: "PRODUCT_INVALID_PRICE" });
      }
      const id = repo.create({
        code,
        name,
        price,
        stock: Math.max(0, Math.round(Number(input.stock) || 0)),
        category: (input.category ?? "General").trim() || "General",
        brand: (input.brand ?? "").trim(),
        location: (input.location ?? "").trim(),
        condition: (input.condition ?? "Nuevo").trim() || "Nuevo",
        min_stock: Math.max(0, Math.round(Number(input.min_stock) || 5))
      });
      return repo.findById(id);
    },
    /**
     * @param {number} id
     * @param {ProductPatch} patch
     */
    update(id, patch) {
      const row = assertExists(id);
      const name = (patch.name ?? row.name).trim();
      if (!name) throw Object.assign(new Error("name requerido"), { code: "PRODUCT_MISSING_NAME" });
      const price = patch.price !== void 0 ? Number(patch.price) : row.price;
      if (!Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error("price invalido"), { code: "PRODUCT_INVALID_PRICE" });
      }
      repo.update(id, {
        name,
        price,
        category: (patch.category ?? row.category ?? "General").trim() || "General",
        brand: (patch.brand ?? row.brand ?? "").trim(),
        location: (patch.location ?? row.location ?? "").trim(),
        condition: (patch.condition ?? row.condition ?? "Nuevo").trim() || "Nuevo",
        min_stock: patch.min_stock !== void 0 ? Math.max(0, Math.round(Number(patch.min_stock))) : row.min_stock
      });
      return repo.findById(id);
    },
    /** Soft-delete: marca is_active = 0. @param {number} id */
    remove(id) {
      assertExists(id);
      repo.setActive(id, 0);
    },
    /** Reactiva un producto. @param {number} id */
    restore(id) {
      assertExists(id);
      repo.setActive(id, 1);
    },
    /**
     * Registra un movimiento de stock.
     * @param {number} id
     * @param {'entry'|'exit'} type
     * @param {number} qty
     */
    adjustStock(id, type, qty) {
      assertExists(id);
      const numQty = Math.round(Number(qty));
      if (!Number.isFinite(numQty) || numQty <= 0) {
        throw Object.assign(new Error("qty invalido"), { code: "PRODUCT_INVALID_QTY" });
      }
      const delta = type === "entry" ? numQty : -numQty;
      repo.adjustStock(id, delta);
      return repo.findById(id);
    }
  };
}
const { ipcMain: ipcMain$c } = _electron;
function registerProductsIpc(service) {
  ipcMain$c.handle("products:list", wrap(() => service.list()));
  ipcMain$c.handle("products:list-active", wrap(() => service.listActive()));
  ipcMain$c.handle("products:search", wrap((_e, query) => service.search(query)));
  ipcMain$c.handle("products:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain$c.handle("products:create", wrap((_e, input) => service.create(input)));
  ipcMain$c.handle("products:update", wrap((_e, id, patch) => service.update(id, patch)));
  ipcMain$c.handle("products:remove", wrap((_e, id) => service.remove(id)));
  ipcMain$c.handle("products:restore", wrap((_e, id) => service.restore(id)));
  ipcMain$c.handle("products:adjust-stock", wrap((_e, id, type, qty) => service.adjustStock(id, type, qty)));
}
const COLUMNS = "id, nit, name, email, phone, address, active, created_at, updated_at";
function createCustomersRepository(db) {
  const stmts = {
    selectAllActive: db.prepare(`SELECT ${COLUMNS} FROM customers WHERE active = 1 ORDER BY name`),
    selectAllAny: db.prepare(`SELECT ${COLUMNS} FROM customers ORDER BY name`),
    selectById: db.prepare(`SELECT ${COLUMNS} FROM customers WHERE id = ?`),
    searchActive: db.prepare(
      `SELECT ${COLUMNS} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?) AND active = 1
     ORDER BY name
        LIMIT 50`
    ),
    searchAny: db.prepare(
      `SELECT ${COLUMNS} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?)
     ORDER BY name
        LIMIT 50`
    ),
    selectByNit: db.prepare(`SELECT ${COLUMNS} FROM customers WHERE nit = ?`),
    insert: db.prepare(
      `INSERT INTO customers (nit, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    ),
    setActive: db.prepare(
      `UPDATE customers
          SET active = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`
    )
  };
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    findAll(opts = {}) {
      const stmt = opts.includeInactive ? stmts.selectAllAny : stmts.selectAllActive;
      return stmt.all();
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | undefined}
     */
    findById(id) {
      return stmts.selectById.get(id);
    },
    /**
     * @param {string} nit
     * @returns {CustomerRow | undefined}
     */
    findByNit(nit) {
      return stmts.selectByNit.get(nit);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(query, opts = {}) {
      const like = `%${query}%`;
      const stmt = opts.includeInactive ? stmts.searchAny : stmts.searchActive;
      return stmt.all(like, like);
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {number|bigint} id insertado
     */
    insert(input) {
      const info = stmts.insert.run(
        input.nit,
        input.name,
        input.email ?? null,
        input.phone ?? null,
        input.address ?? null
      );
      return info.lastInsertRowid;
    },
    /**
     * UPDATE dinamico. Solo toca las columnas provistas en `patch` — evita
     * sobrescribir con undefined y requiere una unica sentencia por forma.
     *
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {number} rows affected
     */
    update(id, patch) {
      const fields = [];
      const values = [];
      for (const [key, value] of Object.entries(patch)) {
        if (value === void 0) continue;
        fields.push(`${key} = ?`);
        values.push(value);
      }
      if (fields.length === 0) return 0;
      fields.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
      const sql = `UPDATE customers SET ${fields.join(", ")} WHERE id = ?`;
      values.push(id);
      const info = db.prepare(sql).run(...values);
      return info.changes;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     * @returns {number} rows affected
     */
    setActive(id, active) {
      const info = stmts.setActive.run(active ? 1 : 0, id);
      return info.changes;
    }
  };
}
class CustomerError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "CustomerError";
    this.code = code;
  }
}
class CustomerNotFoundError extends CustomerError {
  /** @param {number} id */
  constructor(id) {
    super("CUSTOMER_NOT_FOUND", `Cliente no encontrado: #${id}`);
    this.id = id;
  }
}
class CustomerValidationError extends CustomerError {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(field, message) {
    super("CUSTOMER_INVALID", `${field}: ${message}`);
    this.field = field;
  }
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeNit(nit) {
  const trimmed = (nit ?? "").trim().toUpperCase();
  if (trimmed.length === 0) return "C/F";
  return trimmed;
}
function assertValidName(name) {
  if (typeof name !== "string" || name.trim().length < 2) {
    throw new CustomerValidationError("name", "nombre requerido (minimo 2 caracteres)");
  }
}
function assertValidEmail(email) {
  if (email == null || email === "") return;
  if (!EMAIL_RE.test(email)) {
    throw new CustomerValidationError("email", "formato de email invalido");
  }
}
function createCustomersService(repo) {
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    list(opts = {}) {
      return repo.findAll(opts);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(query, opts = {}) {
      const q = typeof query === "string" ? query.trim() : "";
      if (q.length === 0) return repo.findAll(opts);
      return repo.search(q, opts);
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | null}
     */
    getById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new CustomerValidationError("id", `id invalido: ${id}`);
      }
      const row = repo.findById(id);
      return row ?? null;
    },
    /**
     * Version "throw on not found" usada internamente por sales.service.create
     * cuando necesita snapshot garantizado (el POS ya seleccionó un cliente).
     *
     * @param {number} id
     * @returns {CustomerRow}
     * @throws {CustomerNotFoundError}
     */
    requireById(id) {
      const row = repo.findById(id);
      if (!row) throw new CustomerNotFoundError(id);
      return row;
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {CustomerRow}
     */
    create(input) {
      var _a, _b, _c;
      assertValidName(input.name);
      assertValidEmail(input.email);
      const nit = normalizeNit(input.nit);
      if (nit !== "C/F") {
        const existing = repo.findByNit(nit);
        if (existing) throw new CustomerValidationError("nit", `El NIT ${nit} ya esta registrado`);
      }
      const id = repo.insert({
        nit,
        name: input.name.trim(),
        email: ((_a = input.email) == null ? void 0 : _a.trim()) || null,
        phone: ((_b = input.phone) == null ? void 0 : _b.trim()) || null,
        address: ((_c = input.address) == null ? void 0 : _c.trim()) || null
      });
      const numericId = typeof id === "bigint" ? Number(id) : id;
      const row = repo.findById(numericId);
      if (!row) throw new Error("Cliente recien insertado no encontrado (race imposible)");
      return row;
    },
    /**
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {CustomerRow}
     */
    update(id, patch) {
      var _a, _b, _c;
      if (!Number.isInteger(id) || id <= 0) {
        throw new CustomerValidationError("id", `id invalido: ${id}`);
      }
      if (id === 1) {
        throw new CustomerValidationError("id", 'No se puede editar "Consumidor Final"');
      }
      if (patch.name !== void 0) assertValidName(patch.name);
      if (patch.email !== void 0) assertValidEmail(patch.email);
      const nit = patch.nit !== void 0 ? normalizeNit(patch.nit) : void 0;
      if (nit && nit !== "C/F") {
        const existing = repo.findByNit(nit);
        if (existing && existing.id !== id) {
          throw new CustomerValidationError("nit", `El NIT ${nit} ya esta registrado en otro cliente`);
        }
      }
      const safe = {};
      if (nit !== void 0) safe.nit = nit;
      if (patch.name !== void 0) safe.name = patch.name.trim();
      if (patch.email !== void 0) safe.email = ((_a = patch.email) == null ? void 0 : _a.trim()) || null;
      if (patch.phone !== void 0) safe.phone = ((_b = patch.phone) == null ? void 0 : _b.trim()) || null;
      if (patch.address !== void 0) safe.address = ((_c = patch.address) == null ? void 0 : _c.trim()) || null;
      if (patch.active !== void 0) safe.active = patch.active ? 1 : 0;
      const changes = repo.update(id, safe);
      if (changes === 0) throw new CustomerNotFoundError(id);
      const row = repo.findById(id);
      if (!row) throw new CustomerNotFoundError(id);
      return row;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(id, active) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new CustomerValidationError("id", `id invalido: ${id}`);
      }
      if (id === 1) {
        throw new CustomerValidationError("id", 'No se puede desactivar "Consumidor Final"');
      }
      const changes = repo.setActive(id, active);
      if (changes === 0) throw new CustomerNotFoundError(id);
      return true;
    }
  };
}
const { ipcMain: ipcMain$b } = _electron;
function registerCustomersIpc(service) {
  ipcMain$b.handle("customers:list", wrap((_e, opts) => service.list(opts)));
  ipcMain$b.handle("customers:search", wrap((_e, query, opts) => service.search(query, opts)));
  ipcMain$b.handle("customers:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain$b.handle("customers:create", wrap((_e, input) => service.create(input)));
  ipcMain$b.handle("customers:update", wrap((_e, id, patch) => service.update(id, patch)));
  ipcMain$b.handle("customers:set-active", wrap((_e, id, active) => service.setActive(id, active)));
}
const SALE_COLUMNS = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot,
  payment_method, client_type, status,
  discount_type, discount_value, discount_amount
`;
function createSalesRepository(db) {
  const stmts = {
    insertSale: db.prepare(
      `INSERT INTO sales (
         date,
         total, subtotal, tax_rate_applied, tax_amount, currency_code,
         customer_id, customer_name_snapshot, customer_nit_snapshot,
         payment_method, client_type,
         discount_type, discount_value, discount_amount,
         created_by_user_id, created_by_user_snapshot
       ) VALUES (
         strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`
    ),
    insertItem: db.prepare(
      "INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)"
    ),
    updateStock: db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?"),
    selectById: db.prepare(`SELECT ${SALE_COLUMNS} FROM sales WHERE id = ?`),
    /**
     * LEFT JOIN a products para mostrar nombre/codigo actuales. NO es
     * snapshot; para el snapshot real a nivel linea, agregar columnas
     * product_code_snapshot/product_name_snapshot a sale_items en migracion
     * futura. Hoy vive como deuda conocida.
     */
    selectItems: db.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
     ORDER BY si.id ASC`
    ),
    findPageFiltered: db.prepare(`
      SELECT ${SALE_COLUMNS}
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
         AND (@userId IS NULL OR created_by_user_id = @userId)
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset
    `),
    countFiltered: db.prepare(`
      SELECT COUNT(*) AS total
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
         AND (@userId IS NULL OR created_by_user_id = @userId)
    `),
    dailySummary: db.prepare(`
      SELECT
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(subtotal), 0)        AS subtotal,
        COALESCE(SUM(tax_amount), 0)      AS tax_amount,
        COALESCE(SUM(total), 0)           AS total,
        COALESCE(SUM(CASE WHEN COALESCE(payment_method,'cash') != 'credit' THEN total ELSE 0 END), 0) AS cash_total,
        currency_code
      FROM sales
      WHERE status = 'active'
        AND date(date) = date('now', 'localtime')
      GROUP BY currency_code
    `),
    markVoided: db.prepare(
      `UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'active'`
    ),
    insertVoid: db.prepare(
      `INSERT INTO sale_voids (sale_id, reason, voided_by) VALUES (?, ?, ?)`
    ),
    restoreStock: db.prepare(
      `UPDATE products SET stock = stock + ? WHERE id = ?`
    ),
    getProductForMove: db.prepare(
      `SELECT id, name, stock FROM products WHERE id = ?`
    ),
    insertMovement: db.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    topProducts: db.prepare(`
      SELECT
        p.id,
        p.code,
        p.name,
        SUM(si.qty)         AS units_sold,
        SUM(si.qty * si.price) AS revenue
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      JOIN  sales s ON s.id = si.sale_id
      WHERE date(s.date) = date('now', 'localtime')
      GROUP BY si.product_id
      ORDER BY units_sold DESC
      LIMIT 5
    `),
    salesByDate: db.prepare(`
      SELECT
        date(date)              AS day,
        COUNT(*)                AS sale_count,
        COALESCE(SUM(subtotal), 0) AS subtotal,
        COALESCE(SUM(total), 0)    AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY day
      ORDER BY day ASC
    `),
    topProductsRange: db.prepare(`
      SELECT
        p.id,
        p.code,
        p.name,
        SUM(si.qty)            AS units_sold,
        SUM(si.qty * si.price) AS revenue
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'active'
        AND date(s.date) >= @from
        AND date(s.date) <= @to
      GROUP BY si.product_id
      ORDER BY units_sold DESC
      LIMIT 10
    `),
    salesByHour: db.prepare(`
      SELECT
        CAST(strftime('%H', date) AS INTEGER) AS hour,
        COUNT(*)                              AS sale_count,
        COALESCE(SUM(total), 0)               AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY hour
      ORDER BY hour ASC
    `),
    salesByWeekday: db.prepare(`
      SELECT
        CAST(strftime('%w', date) AS INTEGER) AS weekday,
        COUNT(*)                              AS sale_count,
        COALESCE(SUM(total), 0)               AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY weekday
      ORDER BY weekday ASC
    `),
    salesByPaymentMethod: db.prepare(`
      SELECT
        COALESCE(payment_method, 'cash') AS method,
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(total), 0)           AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY method
      ORDER BY sale_count DESC
    `),
    salesByCashier: db.prepare(`
      SELECT
        COALESCE(created_by_user_snapshot, 'Desconocido') AS cashier_name,
        created_by_user_id                                AS cashier_id,
        COUNT(*)                                          AS sale_count,
        COALESCE(SUM(subtotal),0)                         AS subtotal,
        COALESCE(SUM(tax_amount),0)                       AS tax_amount,
        COALESCE(SUM(total),0)                            AS total
      FROM sales
      WHERE status = 'active'
        AND date >= @from || ' 00:00:00'
        AND date <= @to   || ' 23:59:59'
      GROUP BY created_by_user_id, created_by_user_snapshot
      ORDER BY total DESC
    `)
  };
  const insertSale = db.transaction((record) => {
    const info = stmts.insertSale.run(
      record.total,
      record.subtotal,
      record.taxRate,
      record.taxAmount,
      record.currencyCode,
      record.customerId,
      record.customerNameSnapshot,
      record.customerNitSnapshot,
      record.paymentMethod ?? "cash",
      record.clientType ?? "cf",
      record.discountType ?? "none",
      record.discountValue ?? 0,
      record.discountAmount ?? 0,
      record.userId ?? null,
      record.userName ?? null
    );
    const saleId = info.lastInsertRowid;
    for (const item of record.items) {
      const prod = stmts.getProductForMove.get(item.id);
      const qtyBefore = (prod == null ? void 0 : prod.stock) ?? 0;
      stmts.insertItem.run(saleId, item.id, item.qty, item.price);
      stmts.updateStock.run(item.qty, item.id);
      stmts.insertMovement.run({
        product_id: item.id,
        product_name: (prod == null ? void 0 : prod.name) ?? "",
        type: "sale",
        qty: item.qty,
        qty_before: qtyBefore,
        qty_after: qtyBefore - item.qty,
        reference_type: "sale",
        reference_id: saleId,
        notes: null,
        created_by: null,
        created_by_name: null
      });
    }
    return saleId;
  });
  return {
    insertSale,
    /**
     * Anula una venta en transacción: marca status='voided', registra en
     * sale_voids y devuelve el stock de cada item.
     * @param {VoidInput} input
     * @param {import('../sales/sales.repository.js').SaleItemRow[]} items
     * @returns {boolean} true si se anuló, false si ya estaba anulada
     */
    voidSale: db.transaction((input, items) => {
      const info = stmts.markVoided.run(input.saleId);
      if (info.changes === 0) return false;
      stmts.insertVoid.run(input.saleId, input.reason, input.userId ?? null);
      for (const item of items) {
        const prod = stmts.getProductForMove.get(item.product_id);
        const qtyBefore = (prod == null ? void 0 : prod.stock) ?? 0;
        stmts.restoreStock.run(item.qty, item.product_id);
        stmts.insertMovement.run({
          product_id: item.product_id,
          product_name: (prod == null ? void 0 : prod.name) ?? item.product_name ?? "",
          type: "in",
          qty: item.qty,
          qty_before: qtyBefore,
          qty_after: qtyBefore + item.qty,
          reference_type: "sale_void",
          reference_id: input.saleId,
          notes: `Anulación venta #${input.saleId}`,
          created_by: null,
          created_by_name: null
        });
      }
      return true;
    }),
    /**
     * @param {number} id
     * @returns {SaleRow | undefined}
     */
    findSaleById(id) {
      return stmts.selectById.get(id);
    },
    /**
     * @param {number} saleId
     * @returns {SaleItemRow[]}
     */
    findSaleItems(saleId) {
      return stmts.selectItems.all(saleId);
    },
    /**
     * @param {{ limit: number, offset: number, search?: string|null, from?: string|null, to?: string|null, status?: string|null, userId?: number|null }} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit, offset, search = null, from = null, to = null, status = null, userId = null }) {
      return stmts.findPageFiltered.all({ limit, offset, search, from, to, status, userId });
    },
    /** @param {{ search?: string|null, from?: string|null, to?: string|null, status?: string|null, userId?: number|null }} [opts] */
    countAll({ search = null, from = null, to = null, status = null, userId = null } = {}) {
      const row = (
        /** @type {{ total: number }} */
        stmts.countFiltered.get({ search, from, to, status, userId })
      );
      return row.total;
    },
    /**
     * Resumen del día actual (fecha local del servidor/electron).
     * @returns {{ sale_count: number, subtotal: number, tax_amount: number, total: number, currency_code: string } | null}
     */
    getDailySummary() {
      return (
        /** @type {any} */
        stmts.dailySummary.get() ?? null
      );
    },
    /**
     * Top 5 productos vendidos hoy por unidades.
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProducts() {
      return (
        /** @type {any[]} */
        stmts.topProducts.all()
      );
    },
    /**
     * Ventas agrupadas por día en un rango de fechas.
     * @param {{ from: string, to: string }} range  Fechas en formato YYYY-MM-DD
     * @returns {{ day: string, sale_count: number, subtotal: number, total: number }[]}
     */
    getSalesByDate({ from, to }) {
      return (
        /** @type {any[]} */
        stmts.salesByDate.all({ from, to })
      );
    },
    /**
     * Top 10 productos por unidades vendidas en un rango.
     * @param {{ from: string, to: string }} range
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProductsRange({ from, to }) {
      return (
        /** @type {any[]} */
        stmts.topProductsRange.all({ from, to })
      );
    },
    /**
     * Ventas agrupadas por hora del día (0-23).
     * @param {{ from: string, to: string }} range
     * @returns {{ hour: number, sale_count: number, total: number }[]}
     */
    getSalesByHour({ from, to }) {
      return (
        /** @type {any[]} */
        stmts.salesByHour.all({ from, to })
      );
    },
    /**
     * Ventas agrupadas por día de semana (0=Dom … 6=Sáb).
     * @param {{ from: string, to: string }} range
     * @returns {{ weekday: number, sale_count: number, total: number }[]}
     */
    getSalesByWeekday({ from, to }) {
      return (
        /** @type {any[]} */
        stmts.salesByWeekday.all({ from, to })
      );
    },
    /**
     * Ventas agrupadas por método de pago.
     * @param {{ from: string, to: string }} range
     * @returns {{ method: string, sale_count: number, total: number }[]}
     */
    getSalesByPaymentMethod({ from, to }) {
      return (
        /** @type {any[]} */
        stmts.salesByPaymentMethod.all({ from, to })
      );
    },
    /**
     * Ventas agrupadas por cajero (usuario que registró la venta).
     * @param {{ from: string, to: string }} range
     * @returns {any[]}
     */
    getSalesByCashier({ from, to }) {
      return (
        /** @type {any[]} */
        stmts.salesByCashier.all({ from, to })
      );
    }
  };
}
const MAX_PAGE_SIZE$1 = 200;
const DEFAULT_CUSTOMER_ID = 1;
function assertValidInput(input) {
  if (!input || !Array.isArray(input.items) || input.items.length === 0) {
    throw Object.assign(new Error("La venta debe contener al menos un item"), {
      code: "SALE_EMPTY"
    });
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.id) || item.id <= 0) {
      throw Object.assign(new Error(`product_id invalido: ${item.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    }
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw Object.assign(new Error(`qty invalida para producto ${item.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      throw Object.assign(new Error(`price invalido para producto ${item.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    }
  }
  if (input.customerId !== void 0) {
    if (!Number.isInteger(input.customerId) || input.customerId <= 0) {
      throw Object.assign(new Error(`customer_id invalido: ${input.customerId}`), {
        code: "SALE_INVALID_CUSTOMER"
      });
    }
  }
}
function computeBreakdown(rawSum, rate, included, decimals) {
  const factor = Math.pow(10, decimals);
  const round = (n) => Math.round(n * factor) / factor;
  if (included) {
    const total2 = round(rawSum);
    const taxAmount2 = round(total2 - total2 / (1 + rate));
    const subtotal2 = round(total2 - taxAmount2);
    return { subtotal: subtotal2, taxAmount: taxAmount2, total: total2 };
  }
  const subtotal = round(rawSum);
  const taxAmount = round(subtotal * rate);
  const total = round(subtotal + taxAmount);
  return { subtotal, taxAmount, total };
}
function createSalesService(repo, settings, customers, audit) {
  return {
    /**
     * @param {SaleInput} input
     * @returns {SaleCreatedResult}
     */
    create(input) {
      assertValidInput(input);
      const taxRate = (
        /** @type {number} */
        settings.get("tax_rate")
      );
      const taxIncluded = (
        /** @type {boolean} */
        settings.get("tax_included_in_price")
      );
      const currency = (
        /** @type {string} */
        settings.get("currency_code")
      );
      const decimals = (
        /** @type {number} */
        settings.get("decimal_places")
      );
      let taxEnabled = false;
      try {
        taxEnabled = /** @type {boolean} */
        settings.get("tax_enabled");
      } catch {
      }
      const customerId = input.customerId ?? DEFAULT_CUSTOMER_ID;
      const customer = customers.requireById(customerId);
      const rawSum = input.items.reduce((acc, i) => acc + i.price * i.qty, 0);
      const discountType = input.discountType ?? "none";
      const discountValue = input.discountValue ?? 0;
      const factor = Math.pow(10, decimals);
      const roundD = (n) => Math.round(n * factor) / factor;
      let discountAmount = 0;
      if (discountType === "percent" && discountValue > 0) {
        discountAmount = roundD(rawSum * (discountValue / 100));
      } else if (discountType === "fixed" && discountValue > 0) {
        discountAmount = roundD(Math.min(discountValue, rawSum));
      }
      const discountedSum = roundD(Math.max(0, rawSum - discountAmount));
      const { subtotal, taxAmount, total } = taxEnabled ? computeBreakdown(discountedSum, taxRate, taxIncluded, decimals) : { subtotal: discountedSum, taxAmount: 0, total: discountedSum };
      const saleId = repo.insertSale({
        items: input.items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        currencyCode: currency,
        customerId,
        customerNameSnapshot: customer.name,
        customerNitSnapshot: customer.nit,
        paymentMethod: input.paymentMethod ?? "cash",
        clientType: input.clientType ?? "cf",
        discountType,
        discountValue,
        discountAmount,
        userId: input.userId,
        userName: input.userName
      });
      return {
        saleId: typeof saleId === "bigint" ? Number(saleId) : saleId,
        subtotal,
        taxRate,
        taxAmount,
        total,
        currencyCode: currency,
        customerId,
        customerName: customer.name,
        customerNit: customer.nit
      };
    },
    /**
     * @param {number} id
     * @returns {SaleWithItems | null}
     */
    getById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw Object.assign(new Error(`sale id invalido: ${id}`), { code: "SALE_INVALID_ID" });
      }
      const sale = repo.findSaleById(id);
      if (!sale) return null;
      const items = repo.findSaleItems(id);
      return { ...sale, items };
    },
    /**
     * @param {{ page?: number, pageSize?: number }} [opts]
     * @returns {SaleListResult}
     */
    list(opts = {}) {
      var _a, _b, _c, _d;
      const page = Number.isInteger(opts.page) && /** @type {number} */
      opts.page > 0 ? (
        /** @type {number} */
        opts.page
      ) : 1;
      const requested = Number.isInteger(opts.pageSize) && /** @type {number} */
      opts.pageSize > 0 ? (
        /** @type {number} */
        opts.pageSize
      ) : 50;
      const pageSize = Math.min(requested, MAX_PAGE_SIZE$1);
      const offset = (page - 1) * pageSize;
      const search = ((_a = opts.search) == null ? void 0 : _a.trim()) || null;
      const from = ((_b = opts.from) == null ? void 0 : _b.trim()) || null;
      const to = ((_c = opts.to) == null ? void 0 : _c.trim()) || null;
      const status = ((_d = opts.status) == null ? void 0 : _d.trim()) || null;
      const userId = opts.userId != null ? Number(opts.userId) : null;
      return {
        data: repo.findPage({ limit: pageSize, offset, search, from, to, status, userId }),
        total: repo.countAll({ search, from, to, status, userId }),
        page,
        pageSize
      };
    },
    /**
     * Anula una venta, restaura stock y registra en bitácora.
     * @param {{ saleId: number, reason: string, userId?: number, userName?: string }} input
     */
    voidSale(input) {
      if (!Number.isInteger(input.saleId) || input.saleId <= 0) {
        throw Object.assign(new Error(`sale id invalido: ${input.saleId}`), { code: "SALE_INVALID_ID" });
      }
      if (!input.reason || input.reason.trim().length < 5) {
        throw Object.assign(new Error("El motivo debe tener al menos 5 caracteres"), { code: "VOID_REASON_REQUIRED" });
      }
      const sale = repo.findSaleById(input.saleId);
      if (!sale) {
        throw Object.assign(new Error(`Venta ${input.saleId} no encontrada`), { code: "SALE_NOT_FOUND" });
      }
      if (sale.status === "voided") {
        throw Object.assign(new Error(`La venta ${input.saleId} ya está anulada`), { code: "SALE_ALREADY_VOIDED" });
      }
      const items = repo.findSaleItems(input.saleId);
      const voided = repo.voidSale(
        { saleId: input.saleId, reason: input.reason.trim(), userId: input.userId },
        items
      );
      if (voided) {
        audit == null ? void 0 : audit.log({
          action: "sale_voided",
          entity: "sale",
          entityId: input.saleId,
          description: `Venta #${input.saleId} anulada. Motivo: ${input.reason.trim()}`,
          payload: { total: sale.total, customer: sale.customer_name_snapshot, reason: input.reason.trim() },
          userId: input.userId,
          userName: input.userName
        });
      }
      return { voided, saleId: input.saleId };
    },
    /** Reporte del día: totales + top 5 productos. */
    dailyReport() {
      return {
        summary: repo.getDailySummary(),
        topProducts: repo.getTopProducts()
      };
    },
    /**
     * Reporte de ventas por rango de fechas: serie diaria, top productos,
     * horarios concurridos, días de semana y métodos de pago.
     * @param {{ from: string, to: string }} range  Formato YYYY-MM-DD
     */
    rangeReport({ from, to }) {
      if (!from || !to || from > to) {
        throw Object.assign(new Error("Rango de fechas inválido"), { code: "INVALID_DATE_RANGE" });
      }
      return {
        series: repo.getSalesByDate({ from, to }),
        topProducts: repo.getTopProductsRange({ from, to }),
        byHour: repo.getSalesByHour({ from, to }),
        byWeekday: repo.getSalesByWeekday({ from, to }),
        byPaymentMethod: repo.getSalesByPaymentMethod({ from, to }),
        byCashier: repo.getSalesByCashier({ from, to })
      };
    }
  };
}
const { ipcMain: ipcMain$a } = _electron;
function registerSalesIpc(service) {
  ipcMain$a.handle("sales:create", wrap((_e, saleData) => service.create(saleData)));
  ipcMain$a.handle("sales:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain$a.handle("sales:list", wrap((_e, opts) => service.list(opts)));
  ipcMain$a.handle("sales:daily-report", wrap(() => service.dailyReport()));
  ipcMain$a.handle("sales:void", wrap((_e, input) => service.voidSale(input)));
  ipcMain$a.handle("sales:range-report", wrap((_e, range) => service.rangeReport(range)));
}
const COLS = "id, email, full_name, role, active, avatar, created_at, updated_at";
const COLS_WITH_HASH = "id, email, full_name, role, password_hash, active, avatar, created_at, updated_at";
function createUsersRepository(db) {
  const stmts = {
    findAll: db.prepare(
      `SELECT ${COLS} FROM users ORDER BY role, full_name`
    ),
    findById: db.prepare(
      `SELECT ${COLS} FROM users WHERE id = ?`
    ),
    findByEmail: db.prepare(
      `SELECT ${COLS_WITH_HASH} FROM users WHERE email = ? COLLATE NOCASE`
    ),
    insert: db.prepare(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES (@email, @full_name, @role, @password_hash)`
    ),
    update: db.prepare(
      `UPDATE users
          SET full_name  = @full_name,
              role       = @role,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updateAvatar: db.prepare(
      `UPDATE users
          SET avatar     = @avatar,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updatePassword: db.prepare(
      `UPDATE users
          SET password_hash = @password_hash,
              updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    setActive: db.prepare(
      `UPDATE users
          SET active     = @active,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    )
  };
  return {
    /** @returns {Omit<UserRow, 'password_hash'>[]} */
    findAll() {
      return stmts.findAll.all();
    },
    /**
     * @param {number} id
     * @returns {Omit<UserRow, 'password_hash'> | undefined}
     */
    findById(id) {
      return stmts.findById.get(id);
    },
    /**
     * Incluye password_hash — solo para login.
     * @param {string} email
     * @returns {UserRow | undefined}
     */
    findByEmailWithHash(email) {
      return stmts.findByEmail.get(email);
    },
    /**
     * @param {{ email: string, full_name: string, role: string, password_hash: string }} data
     * @returns {number}
     */
    create(data) {
      return Number(stmts.insert.run(data).lastInsertRowid);
    },
    /**
     * @param {number} id
     * @param {{ full_name: string, role: string }} data
     */
    update(id, data) {
      stmts.update.run({ ...data, id });
    },
    /**
     * @param {number} id
     * @param {string} password_hash
     */
    updatePassword(id, password_hash) {
      stmts.updatePassword.run({ id, password_hash });
    },
    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL o null para borrar
     */
    updateAvatar(id, avatar) {
      stmts.updateAvatar.run({ id, avatar: avatar ?? null });
    },
    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(id, active) {
      stmts.setActive.run({ id, active });
    }
  };
}
const ROLES = (
  /** @type {const} */
  ["admin", "cashier", "mechanic", "warehouse"]
);
function hashPassword(password) {
  return createHash("sha256").update(password).digest("hex");
}
function createUsersService(repo) {
  function assertId(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error(`user id invalido: ${id}`), { code: "USER_INVALID_ID" });
    }
  }
  function assertExists(id) {
    assertId(id);
    const row = repo.findById(id);
    if (!row) throw Object.assign(new Error(`usuario no encontrado: ${id}`), { code: "USER_NOT_FOUND" });
    return row;
  }
  return {
    /** Lista todos los usuarios sin exponer password_hash. */
    list() {
      return repo.findAll();
    },
    /** @param {number} id */
    getById(id) {
      assertId(id);
      return repo.findById(id) ?? null;
    },
    /**
     * Login: valida credenciales y devuelve el usuario sin hash.
     * @param {string} email
     * @param {string} password
     */
    login(email, password) {
      if (!email || !password) {
        throw Object.assign(new Error("Email y contraseña requeridos"), { code: "AUTH_MISSING_FIELDS" });
      }
      const user = repo.findByEmailWithHash(email.trim());
      if (!user) {
        throw Object.assign(new Error("Credenciales incorrectas"), { code: "AUTH_INVALID" });
      }
      if (user.active === 0) {
        throw Object.assign(new Error("Usuario desactivado"), { code: "AUTH_INACTIVE" });
      }
      if (user.password_hash !== hashPassword(password)) {
        throw Object.assign(new Error("Credenciales incorrectas"), { code: "AUTH_INVALID" });
      }
      const { password_hash: _, ...safeUser } = user;
      return safeUser;
    },
    /**
     * @param {{ email: string, full_name: string, role: string, password: string }} input
     */
    create(input) {
      const email = (input.email ?? "").trim().toLowerCase();
      const full_name = (input.full_name ?? "").trim();
      const role = input.role;
      if (!email) throw Object.assign(new Error("Email requerido"), { code: "USER_MISSING_EMAIL" });
      if (!full_name) throw Object.assign(new Error("Nombre requerido"), { code: "USER_MISSING_NAME" });
      if (!ROLES.includes(
        /** @type {any} */
        role
      )) {
        throw Object.assign(new Error(`Rol invalido: ${role}`), { code: "USER_INVALID_ROLE" });
      }
      if (!input.password || input.password.length < 6) {
        throw Object.assign(new Error("Contraseña minimo 6 caracteres"), { code: "USER_WEAK_PASSWORD" });
      }
      const existing = repo.findByEmailWithHash(email);
      if (existing) throw Object.assign(new Error("El email ya está en uso"), { code: "USER_EMAIL_TAKEN" });
      const id = repo.create({ email, full_name, role, password_hash: hashPassword(input.password) });
      return repo.findById(id);
    },
    /**
     * @param {number} id
     * @param {{ full_name?: string, role?: string }} patch
     */
    update(id, patch) {
      const row = assertExists(id);
      const full_name = (patch.full_name ?? row.full_name).trim();
      const role = patch.role ?? row.role;
      if (!full_name) throw Object.assign(new Error("Nombre requerido"), { code: "USER_MISSING_NAME" });
      if (!ROLES.includes(
        /** @type {any} */
        role
      )) {
        throw Object.assign(new Error(`Rol invalido: ${role}`), { code: "USER_INVALID_ROLE" });
      }
      if (row.role === "admin" && role !== "admin") {
        const admins = repo.findAll().filter((u) => u.role === "admin" && u.active === 1);
        if (admins.length <= 1) {
          throw Object.assign(new Error("Debe existir al menos un administrador activo"), { code: "USER_LAST_ADMIN" });
        }
      }
      repo.update(id, { full_name, role });
      return repo.findById(id);
    },
    /**
     * @param {number} id
     * @param {string} newPassword
     */
    changePassword(id, newPassword) {
      assertExists(id);
      if (!newPassword || newPassword.length < 6) {
        throw Object.assign(new Error("Contraseña minimo 6 caracteres"), { code: "USER_WEAK_PASSWORD" });
      }
      repo.updatePassword(id, hashPassword(newPassword));
      return repo.findById(id);
    },
    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL (max ~300 KB) o null
     */
    updateAvatar(id, avatar) {
      assertExists(id);
      if (avatar !== null && typeof avatar !== "string") {
        throw Object.assign(new Error("Avatar invalido"), { code: "USER_INVALID_AVATAR" });
      }
      if (avatar && avatar.length > 4e5) {
        throw Object.assign(new Error("Imagen demasiado grande (max 300 KB)"), { code: "USER_AVATAR_TOO_LARGE" });
      }
      repo.updateAvatar(id, avatar);
      return repo.findById(id);
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(id, active) {
      const row = assertExists(id);
      if (!active && row.role === "admin") {
        const admins = repo.findAll().filter((u) => u.role === "admin" && u.active === 1);
        if (admins.length <= 1) {
          throw Object.assign(new Error("Debe existir al menos un administrador activo"), { code: "USER_LAST_ADMIN" });
        }
      }
      repo.setActive(id, active ? 1 : 0);
      return repo.findById(id);
    }
  };
}
const { ipcMain: ipcMain$9 } = _electron;
function registerUsersIpc(service) {
  ipcMain$9.handle("users:login", wrap((_e, email, password) => service.login(email, password)));
  ipcMain$9.handle("users:list", wrap(() => service.list()));
  ipcMain$9.handle("users:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain$9.handle("users:create", wrap((_e, input) => service.create(input)));
  ipcMain$9.handle("users:update", wrap((_e, id, patch) => service.update(id, patch)));
  ipcMain$9.handle("users:change-password", wrap((_e, id, newPassword) => service.changePassword(id, newPassword)));
  ipcMain$9.handle("users:set-active", wrap((_e, id, active) => service.setActive(id, active)));
  ipcMain$9.handle("users:update-avatar", wrap((_e, id, avatar) => service.updateAvatar(id, avatar)));
}
const MAX_PAGE_SIZE = 200;
function createAuditRepository(db) {
  const stmts = {
    insert: db.prepare(`
      INSERT INTO audit_log (action, entity, entity_id, description, payload_json, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    selectPage: db.prepare(`
      SELECT id, action, entity, entity_id, description, payload_json, user_id, user_name, created_at
      FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
      ORDER BY id DESC
      LIMIT :limit OFFSET :offset
    `),
    countFiltered: db.prepare(`
      SELECT COUNT(*) AS total FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
    `)
  };
  return {
    /**
     * @param {AuditEntry} entry
     */
    log(entry) {
      stmts.insert.run(
        entry.action,
        entry.entity ?? null,
        entry.entityId ?? null,
        entry.description ?? null,
        entry.payload ? JSON.stringify(entry.payload) : null,
        entry.userId ?? null,
        entry.userName ?? null
      );
    },
    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     * @returns {{ data: AuditRow[], total: number, page: number, pageSize: number }}
     */
    findPage(opts = {}) {
      const page = opts.page ?? 1;
      const pageSize = Math.min(opts.pageSize ?? 50, MAX_PAGE_SIZE);
      const offset = (page - 1) * pageSize;
      const params = {
        action: opts.action ?? null,
        entity: opts.entity ?? null,
        from: opts.from ?? null,
        to: opts.to ?? null,
        limit: pageSize,
        offset
      };
      const data = (
        /** @type {AuditRow[]} */
        stmts.selectPage.all(params)
      );
      const total = (
        /** @type {{ total: number }} */
        stmts.countFiltered.get(params).total
      );
      return { data, total, page, pageSize };
    }
  };
}
function createAuditService(repo) {
  return {
    /**
     * @param {import('./audit.repository.js').AuditEntry} entry
     */
    log(entry) {
      repo.log(entry);
    },
    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     */
    list(opts = {}) {
      return repo.findPage(opts);
    }
  };
}
const { ipcMain: ipcMain$8 } = _electron;
function registerAuditIpc(service) {
  ipcMain$8.handle("audit:list", wrap((_e, opts) => service.list(opts)));
}
function createCashRepository(db) {
  const stmts = {
    findOpen: db.prepare(
      `SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`
    ),
    findById: db.prepare(
      `SELECT * FROM cash_sessions WHERE id = ?`
    ),
    findAll: db.prepare(
      `SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 100`
    ),
    insert: db.prepare(
      `INSERT INTO cash_sessions (opened_by, opened_by_name, opening_amount)
       VALUES (@opened_by, @opened_by_name, @opening_amount)`
    ),
    close: db.prepare(
      `UPDATE cash_sessions
          SET closed_by       = @closed_by,
              closed_by_name  = @closed_by_name,
              closed_at       = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'),
              closing_amount  = @closing_amount,
              expected_amount = @expected_amount,
              difference      = @difference,
              notes           = @notes,
              status          = 'closed'
        WHERE id = @id AND status = 'open'`
    ),
    movementsForSession: db.prepare(
      `SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC`
    ),
    insertMovement: db.prepare(
      `INSERT INTO cash_movements (session_id, type, amount, concept, created_by)
       VALUES (@session_id, @type, @amount, @concept, @created_by)`
    ),
    salesTotalForSession: db.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND payment_method != 'credit'
          AND date >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR date < ?)`
      // closed_at o NULL si está abierta
    ),
    receivablePaymentsForSession: db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM receivable_payments
        WHERE created_at >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR created_at < ?)`
    ),
    salesTotalToday: db.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND payment_method != 'credit'
          AND DATE(date, 'localtime') = DATE('now', 'localtime')`
    ),
    receivablePaymentsTotalToday: db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM receivable_payments
        WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')`
    )
  };
  return {
    /** @returns {CashSessionRow|undefined} */
    findOpen() {
      return stmts.findOpen.get();
    },
    /** @param {number} id @returns {CashSessionRow|undefined} */
    findById(id) {
      return stmts.findById.get(id);
    },
    /** @returns {CashSessionRow[]} */
    findAll() {
      return stmts.findAll.all();
    },
    /**
     * @param {{ opened_by: number, opened_by_name: string, opening_amount: number }} data
     * @returns {number}
     */
    open(data) {
      return Number(stmts.insert.run(data).lastInsertRowid);
    },
    /**
     * @param {{ id: number, closed_by: number, closed_by_name: string, closing_amount: number, expected_amount: number, difference: number, notes: string|null }} data
     */
    close(data) {
      stmts.close.run(data);
    },
    /** @param {number} sessionId @returns {CashMovementRow[]} */
    movementsForSession(sessionId) {
      return stmts.movementsForSession.all(sessionId);
    },
    /**
     * @param {{ session_id: number, type: 'in'|'out', amount: number, concept: string, created_by: number }} data
     * @returns {number}
     */
    insertMovement(data) {
      return Number(stmts.insertMovement.run(data).lastInsertRowid);
    },
    /**
     * Suma de ventas activas (no crédito) durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    salesTotal(sessionId, closedAt) {
      const row = (
        /** @type {{ total: number }} */
        stmts.salesTotalForSession.get(sessionId, closedAt, closedAt)
      );
      return (row == null ? void 0 : row.total) ?? 0;
    },
    /**
     * Suma de abonos a cuentas por cobrar durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    receivablePaymentsTotal(sessionId, closedAt) {
      const row = (
        /** @type {{ total: number }} */
        stmts.receivablePaymentsForSession.get(sessionId, closedAt, closedAt)
      );
      return (row == null ? void 0 : row.total) ?? 0;
    },
    /** Suma de ventas activas (no crédito) del día de hoy. */
    salesTotalToday() {
      const row = (
        /** @type {{ total: number }} */
        stmts.salesTotalToday.get()
      );
      return (row == null ? void 0 : row.total) ?? 0;
    },
    /** Suma de abonos CxC del día de hoy. */
    receivablePaymentsTodayTotal() {
      const row = (
        /** @type {{ total: number }} */
        stmts.receivablePaymentsTotalToday.get()
      );
      return (row == null ? void 0 : row.total) ?? 0;
    }
  };
}
function createCashService(repo) {
  function assertAdmin(role) {
    if (role !== "admin") {
      throw Object.assign(new Error("Solo el administrador puede gestionar la caja"), { code: "CASH_FORBIDDEN" });
    }
  }
  return {
    /** Devuelve la sesión abierta o null */
    getOpenSession() {
      return repo.findOpen() ?? null;
    },
    /** Lista todas las sesiones (historial) */
    listSessions() {
      return repo.findAll();
    },
    /**
     * @param {number} sessionId
     */
    getSession(sessionId) {
      const session = repo.findById(sessionId);
      if (!session) throw Object.assign(new Error("Sesión no encontrada"), { code: "CASH_NOT_FOUND" });
      const movements = repo.movementsForSession(sessionId);
      const salesTotal = repo.salesTotal(sessionId, session.closed_at);
      const receivablePaymentsTotal = repo.receivablePaymentsTotal(sessionId, session.closed_at);
      if (session.status === "open") {
        const movIn = movements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount, 0);
        const movOut = movements.filter((m) => m.type === "out").reduce((s, m) => s + m.amount, 0);
        session.expected_amount = session.opening_amount + salesTotal + (receivablePaymentsTotal ?? 0) + movIn - movOut;
      }
      return { session, movements, salesTotal, receivablePaymentsTotal };
    },
    /**
     * Abre una nueva sesión de caja. Solo admin.
     * @param {{ userId: number, userName: string, role: string, openingAmount: number }} input
     */
    openSession({ userId, userName, role, openingAmount }) {
      assertAdmin(role);
      const existing = repo.findOpen();
      if (existing) {
        throw Object.assign(new Error("Ya hay una caja abierta"), { code: "CASH_ALREADY_OPEN" });
      }
      if (typeof openingAmount !== "number" || openingAmount < 0) {
        throw Object.assign(new Error("Monto inicial inválido"), { code: "CASH_INVALID_AMOUNT" });
      }
      const id = repo.open({
        opened_by: userId,
        opened_by_name: userName,
        opening_amount: openingAmount
      });
      return repo.findById(id);
    },
    /**
     * Cierra la sesión abierta. Solo admin.
     * @param {{ userId: number, userName: string, role: string, closingAmount: number, notes?: string }} input
     */
    closeSession({ userId, userName, role, closingAmount, notes }) {
      assertAdmin(role);
      const session = repo.findOpen();
      if (!session) {
        throw Object.assign(new Error("No hay caja abierta"), { code: "CASH_NOT_OPEN" });
      }
      if (typeof closingAmount !== "number" || closingAmount < 0) {
        throw Object.assign(new Error("Monto de cierre inválido"), { code: "CASH_INVALID_AMOUNT" });
      }
      const salesTotal = repo.salesTotalToday();
      const receivablePaymentsTotal = repo.receivablePaymentsTodayTotal();
      const movements = repo.movementsForSession(session.id);
      const movIn = movements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount, 0);
      const movOut = movements.filter((m) => m.type === "out").reduce((s, m) => s + m.amount, 0);
      const expected = session.opening_amount + salesTotal + receivablePaymentsTotal + movIn - movOut;
      const difference = closingAmount - expected;
      repo.close({
        id: session.id,
        closed_by: userId,
        closed_by_name: userName,
        closing_amount: closingAmount,
        expected_amount: expected,
        difference,
        notes: notes ?? null
      });
      return repo.findById(session.id);
    },
    /**
     * Agrega un movimiento manual (ingreso o egreso). Solo admin.
     * @param {{ userId: number, role: string, type: 'in'|'out', amount: number, concept: string }} input
     */
    addMovement({ userId, role, type, amount, concept }) {
      assertAdmin(role);
      const session = repo.findOpen();
      if (!session) {
        throw Object.assign(new Error("No hay caja abierta"), { code: "CASH_NOT_OPEN" });
      }
      if (!["in", "out"].includes(type)) {
        throw Object.assign(new Error("Tipo de movimiento inválido"), { code: "CASH_INVALID_TYPE" });
      }
      if (!amount || amount <= 0) {
        throw Object.assign(new Error("Monto inválido"), { code: "CASH_INVALID_AMOUNT" });
      }
      if (!(concept == null ? void 0 : concept.trim())) {
        throw Object.assign(new Error("Concepto requerido"), { code: "CASH_MISSING_CONCEPT" });
      }
      const id = repo.insertMovement({ session_id: session.id, type, amount, concept: concept.trim(), created_by: userId });
      return { id, session_id: session.id, type, amount, concept, created_by: userId };
    }
  };
}
const { ipcMain: ipcMain$7 } = _electron;
function registerCashIpc(service) {
  ipcMain$7.handle("cash:get-open", wrap(() => service.getOpenSession()));
  ipcMain$7.handle("cash:list", wrap(() => service.listSessions()));
  ipcMain$7.handle("cash:get-session", wrap((_e, id) => service.getSession(id)));
  ipcMain$7.handle("cash:open", wrap((_e, input) => service.openSession(input)));
  ipcMain$7.handle("cash:close", wrap((_e, input) => service.closeSession(input)));
  ipcMain$7.handle("cash:add-movement", wrap((_e, input) => service.addMovement(input)));
}
function createPurchasesRepository(db) {
  const stmts = {
    // suppliers
    findAllSuppliers: db.prepare(
      `SELECT * FROM suppliers ORDER BY name`
    ),
    findSupplierById: db.prepare(
      `SELECT * FROM suppliers WHERE id = ?`
    ),
    insertSupplier: db.prepare(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES (@name, @contact_name, @phone, @email, @address, @notes)`
    ),
    updateSupplier: db.prepare(
      `UPDATE suppliers SET name=@name, contact_name=@contact_name, phone=@phone,
       email=@email, address=@address, notes=@notes,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    setSupplierActive: db.prepare(
      `UPDATE suppliers SET active=@active,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    // purchase orders
    findAllOrders: db.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        ORDER BY po.created_at DESC LIMIT 200`
    ),
    findOrderById: db.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ?`
    ),
    findOrdersBySupplier: db.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.supplier_id = ?
        ORDER BY po.created_at DESC`
    ),
    insertOrder: db.prepare(
      `INSERT INTO purchase_orders (supplier_id, notes, created_by, created_by_name)
       VALUES (@supplier_id, @notes, @created_by, @created_by_name)`
    ),
    updateOrderStatus: db.prepare(
      `UPDATE purchase_orders SET status=@status, received_at=@received_at,
       total_cost=@total_cost WHERE id=@id`
    ),
    cancelOrder: db.prepare(
      `UPDATE purchase_orders SET status='cancelled' WHERE id=? AND status IN ('draft','sent')`
    ),
    // purchase items
    findItemsByOrder: db.prepare(
      `SELECT * FROM purchase_items WHERE order_id = ?`
    ),
    insertItem: db.prepare(
      `INSERT INTO purchase_items (order_id, product_id, product_name, product_code, qty_ordered, unit_cost)
       VALUES (@order_id, @product_id, @product_name, @product_code, @qty_ordered, @unit_cost)`
    ),
    updateItemReceived: db.prepare(
      `UPDATE purchase_items SET qty_received=@qty_received WHERE id=@id`
    ),
    // stock update on receive
    addStock: db.prepare(
      `UPDATE products SET stock = stock + @qty WHERE id = @id`
    ),
    updateProductCost: db.prepare(
      `UPDATE products SET cost = @cost WHERE id = @id`
    ),
    getProductForMove: db.prepare(
      `SELECT id, name, stock, cost FROM products WHERE id = ?`
    ),
    insertMovement: db.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `)
  };
  return {
    // ── Suppliers ──────────────────────────────────────────────────────────
    findAllSuppliers() {
      return stmts.findAllSuppliers.all();
    },
    findSupplierById(id) {
      return stmts.findSupplierById.get(id);
    },
    createSupplier(data) {
      return Number(stmts.insertSupplier.run(data).lastInsertRowid);
    },
    updateSupplier(id, data) {
      stmts.updateSupplier.run({ ...data, id });
    },
    setSupplierActive(id, active) {
      stmts.setSupplierActive.run({ id, active });
    },
    // ── Orders ─────────────────────────────────────────────────────────────
    findAllOrders() {
      return stmts.findAllOrders.all();
    },
    findOrderById(id) {
      return stmts.findOrderById.get(id);
    },
    findOrdersBySupplier(supplierId) {
      return stmts.findOrdersBySupplier.all(supplierId);
    },
    createOrder(data) {
      return Number(stmts.insertOrder.run(data).lastInsertRowid);
    },
    updateOrderStatus(id, status, receivedAt, totalCost) {
      stmts.updateOrderStatus.run({ id, status, received_at: receivedAt ?? null, total_cost: totalCost });
    },
    cancelOrder(id) {
      stmts.cancelOrder.run(id);
    },
    // ── Items ──────────────────────────────────────────────────────────────
    findItemsByOrder(orderId) {
      return stmts.findItemsByOrder.all(orderId);
    },
    insertItem(data) {
      return Number(stmts.insertItem.run(data).lastInsertRowid);
    },
    // ── Receive (transaction) ──────────────────────────────────────────────
    /**
     * Marca orden como recibida, actualiza qty_received en items y suma al stock.
     * @param {number} orderId
     * @param {{ id: number, qty_received: number }[]} receivedItems
     * @param {boolean} updatePrices  Si true actualiza el costo del producto al costo de la orden
     */
    receiveOrder: db.transaction((orderId, receivedItems, updatePrices) => {
      let total = 0;
      for (const item of receivedItems) {
        stmts.updateItemReceived.run(item);
        const row = stmts.findItemsByOrder.all(orderId).find((i) => i.id === item.id);
        if ((row == null ? void 0 : row.product_id) && item.qty_received > 0) {
          const prod = stmts.getProductForMove.get(row.product_id);
          const qtyBefore = (prod == null ? void 0 : prod.stock) ?? 0;
          stmts.addStock.run({ id: row.product_id, qty: item.qty_received });
          if (updatePrices && row.unit_cost > 0) {
            stmts.updateProductCost.run({ id: row.product_id, cost: row.unit_cost });
          }
          stmts.insertMovement.run({
            product_id: row.product_id,
            product_name: (prod == null ? void 0 : prod.name) ?? row.product_name,
            type: "purchase",
            qty: item.qty_received,
            qty_before: qtyBefore,
            qty_after: qtyBefore + item.qty_received,
            reference_type: "purchase",
            reference_id: orderId,
            notes: null,
            created_by: null,
            created_by_name: null
          });
        }
        total += ((row == null ? void 0 : row.unit_cost) ?? 0) * item.qty_received;
      }
      const receivedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
      stmts.updateOrderStatus.run({ id: orderId, status: "received", received_at: receivedAt, total_cost: total });
    }),
    /**
     * Devuelve los items de una orden con el costo actual del producto en catálogo,
     * para detectar variaciones antes de confirmar recepción.
     * @param {number} orderId
     */
    priceVariations(orderId) {
      const items = stmts.findItemsByOrder.all(orderId);
      return items.map((it) => {
        if (!it.product_id) return { ...it, current_cost: null, has_variation: false };
        const prod = (
          /** @type {{ cost: number }|undefined} */
          stmts.getProductForMove.get(it.product_id)
        );
        const currentCost = (prod == null ? void 0 : prod.cost) ?? 0;
        return {
          ...it,
          current_cost: currentCost,
          has_variation: it.unit_cost > 0 && Math.abs(it.unit_cost - currentCost) > 1e-3
        };
      });
    }
  };
}
function createPurchasesService(repo) {
  function assertAdmin(role) {
    if (role !== "admin") {
      throw Object.assign(new Error("Solo el administrador puede gestionar compras"), { code: "PURCHASES_FORBIDDEN" });
    }
  }
  return {
    // ── Suppliers ────────────────────────────────────────────────────────
    listSuppliers() {
      return repo.findAllSuppliers();
    },
    getSupplier(id) {
      return repo.findSupplierById(id) ?? null;
    },
    createSupplier(input, role) {
      var _a, _b, _c, _d, _e;
      assertAdmin(role);
      const name = (input.name ?? "").trim();
      if (!name) throw Object.assign(new Error("Nombre del proveedor requerido"), { code: "SUPPLIER_MISSING_NAME" });
      const id = repo.createSupplier({
        name,
        contact_name: ((_a = input.contact_name) == null ? void 0 : _a.trim()) || null,
        phone: ((_b = input.phone) == null ? void 0 : _b.trim()) || null,
        email: ((_c = input.email) == null ? void 0 : _c.trim()) || null,
        address: ((_d = input.address) == null ? void 0 : _d.trim()) || null,
        notes: ((_e = input.notes) == null ? void 0 : _e.trim()) || null
      });
      return repo.findSupplierById(id);
    },
    updateSupplier(id, input, role) {
      var _a, _b, _c, _d, _e;
      assertAdmin(role);
      const row = repo.findSupplierById(id);
      if (!row) throw Object.assign(new Error("Proveedor no encontrado"), { code: "SUPPLIER_NOT_FOUND" });
      const name = (input.name ?? row.name).trim();
      if (!name) throw Object.assign(new Error("Nombre requerido"), { code: "SUPPLIER_MISSING_NAME" });
      repo.updateSupplier(id, {
        name,
        contact_name: ((_a = input.contact_name) == null ? void 0 : _a.trim()) ?? row.contact_name,
        phone: ((_b = input.phone) == null ? void 0 : _b.trim()) ?? row.phone,
        email: ((_c = input.email) == null ? void 0 : _c.trim()) ?? row.email,
        address: ((_d = input.address) == null ? void 0 : _d.trim()) ?? row.address,
        notes: ((_e = input.notes) == null ? void 0 : _e.trim()) ?? row.notes
      });
      return repo.findSupplierById(id);
    },
    setSupplierActive(id, active, role) {
      assertAdmin(role);
      repo.setSupplierActive(id, active ? 1 : 0);
      return repo.findSupplierById(id);
    },
    // ── Purchase Orders ──────────────────────────────────────────────────
    listOrders() {
      return repo.findAllOrders();
    },
    getOrder(id) {
      const order = repo.findOrderById(id);
      if (!order) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      const items = repo.findItemsByOrder(id);
      return { order, items };
    },
    /**
     * @param {{ supplierId: number, notes?: string, items: { productId?: number, productName: string, productCode?: string, qtyOrdered: number, unitCost: number }[], userId: number, userName: string, role: string }} input
     */
    createOrder(input) {
      var _a, _b, _c, _d;
      assertAdmin(input.role);
      if (!input.supplierId) throw Object.assign(new Error("Proveedor requerido"), { code: "ORDER_MISSING_SUPPLIER" });
      if (!((_a = input.items) == null ? void 0 : _a.length)) throw Object.assign(new Error("Agrega al menos un producto"), { code: "ORDER_EMPTY" });
      const orderId = repo.createOrder({
        supplier_id: input.supplierId,
        notes: ((_b = input.notes) == null ? void 0 : _b.trim()) || null,
        created_by: input.userId,
        created_by_name: input.userName
      });
      for (const item of input.items) {
        if (!((_c = item.productName) == null ? void 0 : _c.trim())) throw Object.assign(new Error("Nombre de producto requerido"), { code: "ITEM_MISSING_NAME" });
        if (item.qtyOrdered <= 0) throw Object.assign(new Error("Cantidad debe ser mayor a 0"), { code: "ITEM_INVALID_QTY" });
        repo.insertItem({
          order_id: orderId,
          product_id: item.productId ?? null,
          product_name: item.productName.trim(),
          product_code: ((_d = item.productCode) == null ? void 0 : _d.trim()) || null,
          qty_ordered: item.qtyOrdered,
          unit_cost: item.unitCost ?? 0
        });
      }
      return repo.findOrderById(orderId);
    },
    markSent(id, role) {
      assertAdmin(role);
      const order = repo.findOrderById(id);
      if (!order) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (order.status !== "draft") throw Object.assign(new Error("Solo se pueden enviar órdenes en borrador"), { code: "ORDER_INVALID_STATUS" });
      repo.updateOrderStatus(id, "sent", null, order.total_cost);
      return repo.findOrderById(id);
    },
    /**
     * Devuelve los items de la orden comparados con el costo actual en catálogo.
     * Útil para mostrar al usuario si hay variaciones de precio antes de confirmar.
     * @param {{ orderId: number, role: string }} input
     */
    priceVariations(input) {
      assertAdmin(input.role);
      const order = repo.findOrderById(input.orderId);
      if (!order) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      return repo.priceVariations(input.orderId);
    },
    /**
     * Recibe la orden: actualiza stock. Si updatePrices=true también actualiza el costo.
     * @param {{ orderId: number, role: string, items: { id: number, qty_received: number }[], updatePrices?: boolean }} input
     */
    receiveOrder(input) {
      var _a;
      assertAdmin(input.role);
      const order = repo.findOrderById(input.orderId);
      if (!order) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (!["draft", "sent"].includes(order.status)) {
        throw Object.assign(new Error("Esta orden ya fue recibida o cancelada"), { code: "ORDER_INVALID_STATUS" });
      }
      if (!((_a = input.items) == null ? void 0 : _a.length)) throw Object.assign(new Error("Sin items para recibir"), { code: "ORDER_EMPTY" });
      repo.receiveOrder(input.orderId, input.items, input.updatePrices ?? false);
      return repo.findOrderById(input.orderId);
    },
    cancelOrder(id, role) {
      assertAdmin(role);
      const order = repo.findOrderById(id);
      if (!order) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (!["draft", "sent"].includes(order.status)) {
        throw Object.assign(new Error("No se puede cancelar esta orden"), { code: "ORDER_INVALID_STATUS" });
      }
      repo.cancelOrder(id);
      return repo.findOrderById(id);
    }
  };
}
const { ipcMain: ipcMain$6 } = _electron;
function registerPurchasesIpc(service) {
  ipcMain$6.handle("suppliers:list", wrap(() => service.listSuppliers()));
  ipcMain$6.handle("suppliers:get", wrap((_e, id) => service.getSupplier(id)));
  ipcMain$6.handle("suppliers:create", wrap((_e, input, role) => service.createSupplier(input, role)));
  ipcMain$6.handle("suppliers:update", wrap((_e, id, input, role) => service.updateSupplier(id, input, role)));
  ipcMain$6.handle("suppliers:set-active", wrap((_e, id, active, role) => service.setSupplierActive(id, active, role)));
  ipcMain$6.handle("purchases:list", wrap(() => service.listOrders()));
  ipcMain$6.handle("purchases:get", wrap((_e, id) => service.getOrder(id)));
  ipcMain$6.handle("purchases:create", wrap((_e, input) => service.createOrder(input)));
  ipcMain$6.handle("purchases:mark-sent", wrap((_e, id, role) => service.markSent(id, role)));
  ipcMain$6.handle("purchases:price-variations", wrap((_e, input) => service.priceVariations(input)));
  ipcMain$6.handle("purchases:receive", wrap((_e, input) => service.receiveOrder(input)));
  ipcMain$6.handle("purchases:cancel", wrap((_e, id, role) => service.cancelOrder(id, role)));
}
function createReceivablesRepository(db) {
  const stmts = {
    findAll: db.prepare(`
      SELECT * FROM receivables ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
        due_date ASC NULLS LAST, created_at DESC
    `),
    findById: db.prepare(`SELECT * FROM receivables WHERE id = ?`),
    findByCustomer: db.prepare(`SELECT * FROM receivables WHERE customer_id = ? ORDER BY created_at DESC`),
    insert: db.prepare(`
      INSERT INTO receivables
        (customer_id, customer_name, customer_nit, description, amount, due_date, notes, created_by, created_by_name)
      VALUES
        (@customer_id, @customer_name, @customer_nit, @description, @amount, @due_date, @notes, @created_by, @created_by_name)
    `),
    updateStatus: db.prepare(`
      UPDATE receivables
      SET status=@status, amount_paid=@amount_paid,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    cancel: db.prepare(`
      UPDATE receivables
      SET status='cancelled', updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=?
    `),
    // payments
    findPayments: db.prepare(`SELECT * FROM receivable_payments WHERE receivable_id = ? ORDER BY created_at`),
    insertPayment: db.prepare(`
      INSERT INTO receivable_payments
        (receivable_id, amount, payment_method, notes, created_by, created_by_name)
      VALUES
        (@receivable_id, @amount, @payment_method, @notes, @created_by, @created_by_name)
    `),
    // pagos de hoy
    paymentsToday: db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total,
        COUNT(*)                  AS count
      FROM receivable_payments
      WHERE DATE(created_at) = DATE('now', 'localtime')
    `),
    // pagos en un rango de fechas
    paymentsForRange: db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total,
        COUNT(*)                  AS count
      FROM receivable_payments
      WHERE DATE(created_at) >= @from
        AND DATE(created_at) <= @to
    `),
    // summary
    summary: db.prepare(`
      SELECT
        COUNT(*)                                         AS total_count,
        COALESCE(SUM(amount),0)                          AS total_amount,
        COALESCE(SUM(amount_paid),0)                     AS total_paid,
        COALESCE(SUM(amount - amount_paid),0)            AS total_balance,
        COALESCE(SUM(CASE WHEN status='pending'  THEN amount - amount_paid ELSE 0 END),0) AS pending_balance,
        COALESCE(SUM(CASE WHEN status='partial'  THEN amount - amount_paid ELSE 0 END),0) AS partial_balance,
        COALESCE(SUM(CASE WHEN due_date < strftime('%Y-%m-%d','now') AND status IN ('pending','partial') THEN amount - amount_paid ELSE 0 END),0) AS overdue_balance
      FROM receivables WHERE status NOT IN ('cancelled','paid')
    `)
  };
  const applyPayment = db.transaction((receivableId, payment) => {
    stmts.insertPayment.run(payment);
    const row = stmts.findById.get(receivableId);
    const newPaid = (row.amount_paid ?? 0) + payment.amount;
    const newStatus = newPaid >= row.amount ? "paid" : "partial";
    stmts.updateStatus.run({ id: receivableId, amount_paid: newPaid, status: newStatus });
    return stmts.findById.get(receivableId);
  });
  return {
    findAll() {
      return stmts.findAll.all();
    },
    findById(id) {
      return stmts.findById.get(id) ?? null;
    },
    findByCustomer(id) {
      return stmts.findByCustomer.all(id);
    },
    create(data) {
      return Number(stmts.insert.run(data).lastInsertRowid);
    },
    cancel(id) {
      stmts.cancel.run(id);
    },
    findPayments(id) {
      return stmts.findPayments.all(id);
    },
    applyPayment,
    getSummary() {
      return stmts.summary.get();
    },
    getPaymentsToday() {
      return stmts.paymentsToday.get();
    },
    /** @param {{ from: string, to: string }} range */
    getPaymentsForRange({ from, to }) {
      return stmts.paymentsForRange.get({ from, to });
    }
  };
}
function createReceivablesService(repo) {
  return {
    list() {
      return repo.findAll();
    },
    getDetail(id) {
      const receivable = repo.findById(id);
      if (!receivable) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      const payments = repo.findPayments(id);
      return { receivable, payments };
    },
    getSummary() {
      return repo.getSummary();
    },
    getPaymentsToday() {
      return repo.getPaymentsToday();
    },
    /** @param {{ from: string, to: string }} range */
    getPaymentsForRange({ from, to }) {
      return repo.getPaymentsForRange({ from, to });
    },
    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, description: string, amount: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    create(input) {
      var _a, _b, _c, _d;
      const desc = (_a = input.description) == null ? void 0 : _a.trim();
      if (!desc) throw Object.assign(new Error("Descripción requerida"), { code: "RECV_MISSING_DESC" });
      if (!((_b = input.customerName) == null ? void 0 : _b.trim())) throw Object.assign(new Error("Nombre del cliente requerido"), { code: "RECV_MISSING_CUSTOMER" });
      const amount = Number(input.amount);
      if (isNaN(amount) || amount <= 0) throw Object.assign(new Error("Monto debe ser mayor a 0"), { code: "RECV_INVALID_AMOUNT" });
      const id = repo.create({
        customer_id: input.customerId ?? null,
        customer_name: input.customerName.trim(),
        customer_nit: ((_c = input.customerNit) == null ? void 0 : _c.trim()) || null,
        description: desc,
        amount,
        due_date: input.dueDate || null,
        notes: ((_d = input.notes) == null ? void 0 : _d.trim()) || null,
        created_by: input.userId,
        created_by_name: input.userName
      });
      return repo.findById(id);
    },
    /**
     * @param {{ receivableId: number, amount: number, paymentMethod?: string, notes?: string, userId: number, userName: string }} input
     */
    applyPayment(input) {
      var _a;
      const rec = repo.findById(input.receivableId);
      if (!rec) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      if (["paid", "cancelled"].includes(rec.status)) {
        throw Object.assign(new Error("Esta cuenta ya está cerrada"), { code: "RECV_CLOSED" });
      }
      const amount = Number(input.amount);
      if (isNaN(amount) || amount <= 0) throw Object.assign(new Error("Monto de pago inválido"), { code: "RECV_INVALID_PAYMENT" });
      const balance = rec.amount - rec.amount_paid;
      if (amount > balance + 1e-3) {
        throw Object.assign(new Error(`El pago (${amount}) supera el saldo (${balance.toFixed(2)})`), { code: "RECV_OVERPAYMENT" });
      }
      return repo.applyPayment(input.receivableId, {
        receivable_id: input.receivableId,
        amount,
        payment_method: input.paymentMethod || "cash",
        notes: ((_a = input.notes) == null ? void 0 : _a.trim()) || null,
        created_by: input.userId,
        created_by_name: input.userName
      });
    },
    cancel(id) {
      const rec = repo.findById(id);
      if (!rec) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      if (rec.status === "paid") throw Object.assign(new Error("No se puede cancelar una cuenta ya pagada"), { code: "RECV_CLOSED" });
      repo.cancel(id);
      return repo.findById(id);
    },
    byCustomer(customerId) {
      if (!Number.isInteger(customerId) || customerId <= 0) {
        throw Object.assign(new Error("customer_id inválido"), { code: "RECV_INVALID_CUSTOMER" });
      }
      const rows = repo.findByCustomer(customerId);
      const active = rows.filter((r) => ["pending", "partial"].includes(r.status));
      const balance = active.reduce((s, r) => s + (r.amount - r.amount_paid), 0);
      return { rows: active, balance };
    }
  };
}
const { ipcMain: ipcMain$5 } = _electron;
function registerReceivablesIpc(svc) {
  function handle(channel, fn) {
    ipcMain$5.handle(channel, async (_e, ...args) => {
      try {
        const data = await fn(...args);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: { code: err.code ?? "RECV_ERROR", message: err.message } };
      }
    });
  }
  handle("receivables:list", () => svc.list());
  handle("receivables:get", (id) => svc.getDetail(id));
  handle("receivables:summary", () => svc.getSummary());
  handle("receivables:payments-today", () => svc.getPaymentsToday());
  handle("receivables:payments-range", (range) => svc.getPaymentsForRange(range));
  handle("receivables:create", (input) => svc.create(input));
  handle("receivables:apply-payment", (input) => svc.applyPayment(input));
  handle("receivables:cancel", (id) => svc.cancel(id));
  handle("receivables:by-customer", (id) => svc.byCustomer(id));
}
function createQuotesRepository(db) {
  const stmts = {
    findAll: db.prepare(`
      SELECT * FROM quotes
      ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'sent' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END,
               created_at DESC
    `),
    findById: db.prepare(`SELECT * FROM quotes WHERE id = ?`),
    findItems: db.prepare(`SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id`),
    insert: db.prepare(`
      INSERT INTO quotes (customer_id, customer_name, customer_nit, notes, valid_until,
                          subtotal, tax_rate, tax_amount, total, created_by, created_by_name)
      VALUES (@customer_id, @customer_name, @customer_nit, @notes, @valid_until,
              @subtotal, @tax_rate, @tax_amount, @total, @created_by, @created_by_name)
    `),
    insertItem: db.prepare(`
      INSERT INTO quote_items (quote_id, product_id, product_name, product_code, qty, unit_price, subtotal)
      VALUES (@quote_id, @product_id, @product_name, @product_code, @qty, @unit_price, @subtotal)
    `),
    deleteItems: db.prepare(`DELETE FROM quote_items WHERE quote_id = ?`),
    updateStatus: db.prepare(`
      UPDATE quotes SET status=@status, updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    markConverted: db.prepare(`
      UPDATE quotes SET status='converted', sale_id=@sale_id,
        updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    update: db.prepare(`
      UPDATE quotes
      SET customer_id=@customer_id, customer_name=@customer_name, customer_nit=@customer_nit,
          notes=@notes, valid_until=@valid_until,
          subtotal=@subtotal, tax_rate=@tax_rate, tax_amount=@tax_amount, total=@total,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `)
  };
  const createQuote = db.transaction((quoteData, items) => {
    const id = Number(stmts.insert.run(quoteData).lastInsertRowid);
    for (const item of items) stmts.insertItem.run({ ...item, quote_id: id });
    return id;
  });
  const updateQuote = db.transaction((id, quoteData, items) => {
    stmts.update.run({ ...quoteData, id });
    stmts.deleteItems.run(id);
    for (const item of items) stmts.insertItem.run({ ...item, quote_id: id });
  });
  return {
    findAll() {
      return stmts.findAll.all();
    },
    findById(id) {
      return stmts.findById.get(id) ?? null;
    },
    findItems(id) {
      return stmts.findItems.all(id);
    },
    createQuote,
    updateQuote,
    updateStatus(id, status) {
      stmts.updateStatus.run({ id, status });
    },
    markConverted(id, saleId) {
      stmts.markConverted.run({ id, sale_id: saleId });
    }
  };
}
function createQuotesService(repo, settings, sales, receivables, products) {
  function calcTotals(items) {
    const taxRate = (
      /** @type {number} */
      settings.get("tax_rate") ?? 0
    );
    const taxEnabled = (
      /** @type {boolean} */
      settings.get("tax_enabled") ?? false
    );
    const subtotal = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
    const taxAmt = taxEnabled ? Math.round(subtotal * taxRate * 100) / 100 : 0;
    return { subtotal, tax_rate: taxRate, tax_amount: taxAmt, total: subtotal + taxAmt };
  }
  function validateItems(items) {
    var _a;
    if (!(items == null ? void 0 : items.length)) throw Object.assign(new Error("Agrega al menos un producto"), { code: "QUOTE_EMPTY" });
    for (const it of items) {
      if (!((_a = it.productName) == null ? void 0 : _a.trim())) throw Object.assign(new Error("Nombre de producto requerido"), { code: "QUOTE_ITEM_NAME" });
      if (it.qty <= 0) throw Object.assign(new Error("Cantidad debe ser mayor a 0"), { code: "QUOTE_ITEM_QTY" });
      if (it.unitPrice < 0) throw Object.assign(new Error("Precio no puede ser negativo"), { code: "QUOTE_ITEM_PRICE" });
    }
  }
  function mapItems(rawItems) {
    return rawItems.map((it) => {
      var _a;
      return {
        product_id: it.productId ?? null,
        product_name: it.productName.trim(),
        product_code: ((_a = it.productCode) == null ? void 0 : _a.trim()) || null,
        qty: it.qty,
        unit_price: it.unitPrice,
        subtotal: it.qty * it.unitPrice
      };
    });
  }
  return {
    list() {
      return repo.findAll();
    },
    getDetail(id) {
      const quote = repo.findById(id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      return { quote, items: repo.findItems(id) };
    },
    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, notes?: string, validUntil?: string, items: any[], userId: number, userName: string }} input
     */
    create(input) {
      var _a, _b, _c;
      if (!((_a = input.customerName) == null ? void 0 : _a.trim())) throw Object.assign(new Error("Nombre del cliente requerido"), { code: "QUOTE_MISSING_CUSTOMER" });
      validateItems(input.items);
      const items = mapItems(input.items);
      const { subtotal, tax_rate, tax_amount, total } = calcTotals(items);
      const id = repo.createQuote({
        customer_id: input.customerId ?? null,
        customer_name: input.customerName.trim(),
        customer_nit: ((_b = input.customerNit) == null ? void 0 : _b.trim()) || null,
        notes: ((_c = input.notes) == null ? void 0 : _c.trim()) || null,
        valid_until: input.validUntil || null,
        subtotal,
        tax_rate,
        tax_amount,
        total,
        created_by: input.userId,
        created_by_name: input.userName
      }, items);
      return repo.findById(id);
    },
    /**
     * @param {number} id
     * @param {{ customerId?: number, customerName: string, customerNit?: string, notes?: string, validUntil?: string, items: any[] }} input
     */
    update(id, input) {
      var _a, _b;
      const quote = repo.findById(id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["draft", "sent"].includes(quote.status)) {
        throw Object.assign(new Error("Solo se pueden editar cotizaciones en borrador o enviadas"), { code: "QUOTE_NOT_EDITABLE" });
      }
      validateItems(input.items);
      const items = mapItems(input.items);
      const { subtotal, tax_rate, tax_amount, total } = calcTotals(items);
      repo.updateQuote(id, {
        customer_id: input.customerId ?? quote.customer_id,
        customer_name: (input.customerName ?? quote.customer_name).trim(),
        customer_nit: ((_a = input.customerNit) == null ? void 0 : _a.trim()) || quote.customer_nit,
        notes: ((_b = input.notes) == null ? void 0 : _b.trim()) || null,
        valid_until: input.validUntil || null,
        subtotal,
        tax_rate,
        tax_amount,
        total
      }, items);
      return repo.findById(id);
    },
    markSent(id) {
      const quote = repo.findById(id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (quote.status !== "draft") throw Object.assign(new Error("Solo se pueden enviar cotizaciones en borrador"), { code: "QUOTE_INVALID_STATUS" });
      repo.updateStatus(id, "sent");
      return repo.findById(id);
    },
    accept(id) {
      const quote = repo.findById(id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["draft", "sent"].includes(quote.status)) throw Object.assign(new Error("Estado inválido para aceptar"), { code: "QUOTE_INVALID_STATUS" });
      repo.updateStatus(id, "accepted");
      return repo.findById(id);
    },
    reject(id) {
      const quote = repo.findById(id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (["converted", "cancelled"].includes(quote.status)) throw Object.assign(new Error("No se puede rechazar esta cotización"), { code: "QUOTE_INVALID_STATUS" });
      repo.updateStatus(id, "rejected");
      return repo.findById(id);
    },
    /**
     * Convierte la cotización aceptada en una venta real.
     * @param {{ id: number, userId: number, userName: string }} input
     */
    convertToSale(input) {
      const quote = repo.findById(input.id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["accepted", "sent", "draft"].includes(quote.status)) {
        throw Object.assign(new Error("Solo se pueden convertir cotizaciones activas"), { code: "QUOTE_INVALID_STATUS" });
      }
      const items = repo.findItems(input.id);
      if (!items.length) throw Object.assign(new Error("La cotización no tiene productos"), { code: "QUOTE_EMPTY" });
      const itemsWithProduct = items.filter((it) => it.product_id != null);
      if (!itemsWithProduct.length) {
        throw Object.assign(new Error("Para convertir a venta todos los items deben tener un producto del sistema"), { code: "QUOTE_NO_PRODUCTS" });
      }
      const saleResult = sales.create({
        items: itemsWithProduct.map((it) => ({
          id: it.product_id,
          qty: it.qty,
          price: it.unit_price
        })),
        customerId: quote.customer_id ?? void 0
      });
      repo.markConverted(input.id, saleResult.saleId);
      return { quote: repo.findById(input.id), sale: saleResult };
    },
    /**
     * Crea una cuenta por cobrar desde una cotización aceptada.
     * Descuenta stock para los ítems con product_id vinculado.
     * @param {{ id: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    convertToReceivable(input) {
      const quote = repo.findById(input.id);
      if (!quote) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["accepted", "sent", "draft"].includes(quote.status)) {
        throw Object.assign(new Error("Solo se pueden convertir cotizaciones activas"), { code: "QUOTE_INVALID_STATUS" });
      }
      const items = repo.findItems(input.id);
      for (const it of items) {
        if (it.product_id && it.qty > 0) {
          try {
            products.adjustStock(it.product_id, "exit", it.qty);
          } catch {
            console.warn(`[quotes] no se pudo descontar stock del producto ${it.product_id}`);
          }
        }
      }
      const receivable = receivables.create({
        customerId: quote.customer_id ?? void 0,
        customerName: quote.customer_name,
        customerNit: quote.customer_nit ?? void 0,
        description: `Cotización #${quote.id}${quote.notes ? ` · ${quote.notes}` : ""}`,
        amount: quote.total,
        dueDate: input.dueDate || void 0,
        notes: input.notes || void 0,
        userId: input.userId,
        userName: input.userName
      });
      repo.updateStatus(input.id, "converted");
      return { quote: repo.findById(input.id), receivable };
    }
  };
}
const { ipcMain: ipcMain$4 } = _electron;
function registerQuotesIpc(svc) {
  function handle(channel, fn) {
    ipcMain$4.handle(channel, async (_e, ...args) => {
      try {
        const data = await fn(...args);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: { code: err.code ?? "QUOTE_ERROR", message: err.message } };
      }
    });
  }
  handle("quotes:list", () => svc.list());
  handle("quotes:get", (id) => svc.getDetail(id));
  handle("quotes:create", (input) => svc.create(input));
  handle("quotes:update", (id, input) => svc.update(id, input));
  handle("quotes:mark-sent", (id) => svc.markSent(id));
  handle("quotes:accept", (id) => svc.accept(id));
  handle("quotes:reject", (id) => svc.reject(id));
  handle("quotes:convert", (input) => svc.convertToSale(input));
  handle("quotes:convert-receivable", (input) => svc.convertToReceivable(input));
}
function createExpensesRepository(db) {
  const stmts = {
    findAll: db.prepare(`
      SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC
    `),
    findByRange: db.prepare(`
      SELECT * FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      ORDER BY expense_date DESC, created_at DESC
    `),
    findById: db.prepare(`SELECT * FROM expenses WHERE id = ?`),
    insert: db.prepare(`
      INSERT INTO expenses
        (category, description, amount, payment_method, expense_date, notes, created_by, created_by_name)
      VALUES
        (@category, @description, @amount, @payment_method, @expense_date, @notes, @created_by, @created_by_name)
    `),
    update: db.prepare(`
      UPDATE expenses
      SET category=@category, description=@description, amount=@amount,
          payment_method=@payment_method, expense_date=@expense_date, notes=@notes
      WHERE id=@id
    `),
    remove: db.prepare(`DELETE FROM expenses WHERE id = ?`),
    summary: db.prepare(`
      SELECT
        COALESCE(SUM(amount),0)                                             AS total,
        COALESCE(SUM(CASE WHEN expense_date = strftime('%Y-%m-%d','now','localtime') THEN amount ELSE 0 END),0) AS today,
        COUNT(*)                                                            AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
    `),
    byCategory: db.prepare(`
      SELECT category, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      GROUP BY category ORDER BY total DESC
    `)
  };
  return {
    findAll() {
      return stmts.findAll.all();
    },
    findByRange(from, to) {
      return stmts.findByRange.all({ from, to });
    },
    findById(id) {
      return stmts.findById.get(id) ?? null;
    },
    create(data) {
      return Number(stmts.insert.run(data).lastInsertRowid);
    },
    update(id, data) {
      stmts.update.run({ ...data, id });
    },
    remove(id) {
      stmts.remove.run(id);
    },
    getSummary(from, to) {
      return stmts.summary.get({ from, to });
    },
    getByCategory(from, to) {
      return stmts.byCategory.all({ from, to });
    }
  };
}
const VALID_CATEGORIES = [
  "renta",
  "servicios",
  "sueldos",
  "insumos",
  "transporte",
  "mantenimiento",
  "publicidad",
  "impuestos",
  "otros"
];
const VALID_METHODS = ["cash", "transfer", "card", "check"];
function createExpensesService(repo) {
  function validate(input) {
    var _a;
    if (!((_a = input.description) == null ? void 0 : _a.trim())) {
      throw Object.assign(new Error("La descripción es requerida"), { code: "EXP_INVALID" });
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw Object.assign(new Error("El monto debe ser mayor a 0"), { code: "EXP_INVALID" });
    }
  }
  function today() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  return {
    list(opts = {}) {
      if (opts.from && opts.to) return repo.findByRange(opts.from, opts.to);
      return repo.findAll();
    },
    getById(id) {
      const row = repo.findById(id);
      if (!row) throw Object.assign(new Error(`Gasto ${id} no encontrado`), { code: "EXP_NOT_FOUND" });
      return row;
    },
    create(input) {
      var _a;
      validate(input);
      const id = repo.create({
        category: VALID_CATEGORIES.includes(input.category) ? input.category : "otros",
        description: input.description.trim(),
        amount: input.amount,
        payment_method: VALID_METHODS.includes(input.payment_method) ? input.payment_method : "cash",
        expense_date: input.expense_date || today(),
        notes: ((_a = input.notes) == null ? void 0 : _a.trim()) || null,
        created_by: input.created_by ?? null,
        created_by_name: input.created_by_name ?? null
      });
      return repo.findById(id);
    },
    update(id, input) {
      var _a;
      validate(input);
      const existing = repo.findById(id);
      if (!existing) throw Object.assign(new Error(`Gasto ${id} no encontrado`), { code: "EXP_NOT_FOUND" });
      repo.update(id, {
        category: VALID_CATEGORIES.includes(input.category) ? input.category : "otros",
        description: input.description.trim(),
        amount: input.amount,
        payment_method: VALID_METHODS.includes(input.payment_method) ? input.payment_method : "cash",
        expense_date: input.expense_date || existing.expense_date,
        notes: ((_a = input.notes) == null ? void 0 : _a.trim()) || null
      });
      return repo.findById(id);
    },
    remove(id) {
      const existing = repo.findById(id);
      if (!existing) throw Object.assign(new Error(`Gasto ${id} no encontrado`), { code: "EXP_NOT_FOUND" });
      repo.remove(id);
      return true;
    },
    summary(from, to) {
      const f = from || today();
      const t = to || today();
      return {
        ...repo.getSummary(f, t),
        byCategory: repo.getByCategory(f, t)
      };
    },
    categories: () => VALID_CATEGORIES
  };
}
const { ipcMain: ipcMain$3 } = _electron;
function registerExpensesIpc(svc) {
  function handle(channel, fn) {
    ipcMain$3.handle(channel, async (_e, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        return { ok: false, error: { code: err.code ?? "EXP_ERROR", message: err.message } };
      }
    });
  }
  handle("expenses:list", (opts) => svc.list(opts));
  handle("expenses:get", (id) => svc.getById(id));
  handle("expenses:create", (input) => svc.create(input));
  handle("expenses:update", (id, input) => svc.update(id, input));
  handle("expenses:remove", (id) => svc.remove(id));
  handle("expenses:summary", (from, to) => svc.summary(from, to));
  handle("expenses:categories", () => svc.categories());
}
function createReturnsRepository(db) {
  const stmts = {
    findAll: db.prepare(`SELECT * FROM returns ORDER BY created_at DESC`),
    findBySale: db.prepare(`SELECT * FROM returns WHERE sale_id = ? ORDER BY created_at DESC`),
    findById: db.prepare(`SELECT * FROM returns WHERE id = ?`),
    findItems: db.prepare(`SELECT * FROM return_items WHERE return_id = ?`),
    insertReturn: db.prepare(`
      INSERT INTO returns (sale_id, reason, notes, total_refund, created_by, created_by_name)
      VALUES (@sale_id, @reason, @notes, @total_refund, @created_by, @created_by_name)
    `),
    insertItem: db.prepare(`
      INSERT INTO return_items (return_id, sale_item_id, product_id, product_name, qty_returned, unit_price, subtotal)
      VALUES (@return_id, @sale_item_id, @product_id, @product_name, @qty_returned, @unit_price, @subtotal)
    `),
    restoreStock: db.prepare(`UPDATE products SET stock = stock + ? WHERE id = ?`)
  };
  const createReturn = db.transaction((header, items) => {
    const returnId = Number(stmts.insertReturn.run(header).lastInsertRowid);
    for (const it of items) {
      stmts.insertItem.run({ ...it, return_id: returnId });
      stmts.restoreStock.run(it.qty_returned, it.product_id);
    }
    return returnId;
  });
  return {
    findAll() {
      return stmts.findAll.all();
    },
    findBySale(sid) {
      return stmts.findBySale.all(sid);
    },
    findById(id) {
      return stmts.findById.get(id) ?? null;
    },
    findItems(id) {
      return stmts.findItems.all(id);
    },
    createReturn
  };
}
function createReturnsService(repo, salesRepo) {
  return {
    list() {
      return repo.findAll();
    },
    listBySale(saleId) {
      const rows = repo.findBySale(saleId);
      return rows.map((r) => ({ ...r, items: repo.findItems(r.id) }));
    },
    getById(id) {
      const row = repo.findById(id);
      if (!row) throw Object.assign(new Error(`Devolución ${id} no encontrada`), { code: "RET_NOT_FOUND" });
      return { ...row, items: repo.findItems(id) };
    },
    /**
     * @param {{
     *   saleId: number,
     *   reason: string,
     *   notes?: string,
     *   items: Array<{ saleItemId: number, productId: number, productName: string, qtyReturned: number, unitPrice: number }>,
     *   createdBy?: number,
     *   createdByName?: string,
     * }} input
     */
    create(input) {
      var _a, _b;
      if (!((_a = input.reason) == null ? void 0 : _a.trim()) || input.reason.trim().length < 3) {
        throw Object.assign(new Error("El motivo debe tener al menos 3 caracteres"), { code: "RET_INVALID" });
      }
      if (!Array.isArray(input.items) || input.items.length === 0) {
        throw Object.assign(new Error("Selecciona al menos un producto a devolver"), { code: "RET_INVALID" });
      }
      for (const it of input.items) {
        if (!it.qtyReturned || it.qtyReturned <= 0) {
          throw Object.assign(new Error(`Cantidad inválida para ${it.productName}`), { code: "RET_INVALID" });
        }
      }
      const sale = salesRepo.findSaleById(input.saleId);
      if (!sale) throw Object.assign(new Error(`Venta ${input.saleId} no encontrada`), { code: "RET_INVALID" });
      if (sale.status === "voided") throw Object.assign(new Error("No se puede devolver una venta anulada"), { code: "RET_INVALID" });
      const mappedItems = input.items.map((it) => ({
        sale_item_id: it.saleItemId,
        product_id: it.productId,
        product_name: it.productName,
        qty_returned: it.qtyReturned,
        unit_price: it.unitPrice,
        subtotal: Math.round(it.qtyReturned * it.unitPrice * 100) / 100
      }));
      const totalRefund = mappedItems.reduce((s, it) => s + it.subtotal, 0);
      const returnId = repo.createReturn({
        sale_id: input.saleId,
        reason: input.reason.trim(),
        notes: ((_b = input.notes) == null ? void 0 : _b.trim()) || null,
        total_refund: Math.round(totalRefund * 100) / 100,
        created_by: input.createdBy ?? null,
        created_by_name: input.createdByName ?? null
      }, mappedItems);
      return repo.findById(returnId);
    }
  };
}
const { ipcMain: ipcMain$2 } = _electron;
function registerReturnsIpc(svc) {
  function handle(channel, fn) {
    ipcMain$2.handle(channel, async (_e, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        return { ok: false, error: { code: err.code ?? "RET_ERROR", message: err.message } };
      }
    });
  }
  handle("returns:list", () => svc.list());
  handle("returns:list-by-sale", (saleId) => svc.listBySale(saleId));
  handle("returns:get", (id) => svc.getById(id));
  handle("returns:create", (input) => svc.create(input));
}
function createInventoryRepository(db) {
  const stmts = {
    findMovements: db.prepare(`
      SELECT * FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    countMovements: db.prepare(`
      SELECT COUNT(*) AS total FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
    `),
    insertMovement: db.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    getProductStock: db.prepare(`SELECT id, code, name, stock, min_stock, category, is_active FROM products WHERE is_active = 1 ORDER BY name ASC`),
    getProductById: db.prepare(`SELECT id, code, name, stock FROM products WHERE id = ?`),
    adjustStock: db.prepare(`UPDATE products SET stock = stock + ? WHERE id = ?`)
  };
  const logAdjustment = db.transaction((productId, delta, movement) => {
    const product = stmts.getProductById.get(productId);
    if (!product) throw Object.assign(new Error(`Producto ${productId} no encontrado`), { code: "INV_NOT_FOUND" });
    const qtyBefore = product.stock;
    stmts.adjustStock.run(delta, productId);
    const qtyAfter = qtyBefore + delta;
    stmts.insertMovement.run({
      ...movement,
      product_id: productId,
      product_name: product.name,
      qty: Math.abs(delta),
      qty_before: qtyBefore,
      qty_after: qtyAfter
    });
    return { qtyBefore, qtyAfter, productName: product.name };
  });
  return {
    getStock() {
      return stmts.getProductStock.all();
    },
    findMovements({ productId = null, limit = 50, offset = 0 } = {}) {
      return stmts.findMovements.all({ product_id: productId, limit, offset });
    },
    countMovements(productId = null) {
      return stmts.countMovements.get({ product_id: productId }).total;
    },
    logAdjustment
  };
}
function createInventoryService(repo) {
  return {
    getStock() {
      return repo.getStock();
    },
    getMovements({ productId, page = 1, pageSize = 50 } = {}) {
      const limit = Math.min(pageSize, 200);
      const offset = (page - 1) * limit;
      return {
        data: repo.findMovements({ productId, limit, offset }),
        total: repo.countMovements(productId ?? null),
        page,
        pageSize: limit
      };
    },
    /**
     * Ajuste manual de stock con registro en kardex.
     * @param {{ productId: number, type: 'in'|'out'|'adjustment', qty: number, notes?: string, createdBy?: number, createdByName?: string }} input
     */
    adjust(input) {
      const { productId, type, qty, notes, createdBy, createdByName } = input;
      if (!Number.isInteger(productId) || productId <= 0) {
        throw Object.assign(new Error("Producto inválido"), { code: "INV_INVALID" });
      }
      if (!["in", "out", "adjustment"].includes(type)) {
        throw Object.assign(new Error("Tipo de movimiento inválido"), { code: "INV_INVALID" });
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        throw Object.assign(new Error("La cantidad debe ser mayor a 0"), { code: "INV_INVALID" });
      }
      const delta = type === "out" ? -qty : qty;
      return repo.logAdjustment(productId, delta, {
        type,
        reference_type: "manual",
        reference_id: null,
        notes: (notes == null ? void 0 : notes.trim()) || null,
        created_by: createdBy ?? null,
        created_by_name: createdByName ?? null
      });
    }
  };
}
const { ipcMain: ipcMain$1 } = _electron;
function registerInventoryIpc(svc) {
  function handle(channel, fn) {
    ipcMain$1.handle(channel, async (_e, ...args) => {
      try {
        return { ok: true, data: await fn(...args) };
      } catch (err) {
        return { ok: false, error: { code: err.code ?? "INV_ERROR", message: err.message } };
      }
    });
  }
  handle("inventory:stock", () => svc.getStock());
  handle("inventory:movements", (opts) => svc.getMovements(opts));
  handle("inventory:adjust", (input) => svc.adjust(input));
}
function createLicenseRepository(db) {
  const stmts = {
    findToken: db.prepare(
      `SELECT id FROM license_tokens WHERE token_hash = ? AND used = 0`
    ),
    burnToken: db.prepare(
      `UPDATE license_tokens
          SET used = 1, used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?`
    )
  };
  return {
    findValidToken(hash) {
      return stmts.findToken.get(hash) ?? null;
    },
    burnToken(id) {
      stmts.burnToken.run(id);
    }
  };
}
function createLicenseService(repo, settings) {
  return {
    isActivated() {
      return settings.get("is_activated") === true;
    },
    activate(token) {
      if (!(token == null ? void 0 : token.trim())) {
        throw Object.assign(new Error("Token requerido"), { code: "LICENSE_EMPTY" });
      }
      const hash = crypto.createHash("sha256").update(token.trim()).digest("hex");
      const row = repo.findValidToken(hash);
      if (!row) {
        throw Object.assign(
          new Error("Token inválido o ya utilizado"),
          { code: "LICENSE_INVALID" }
        );
      }
      repo.burnToken(row.id);
      settings.set("is_activated", true);
      return { activated: true };
    }
  };
}
function registerLicenseIpc(ipcMain2, svc) {
  ipcMain2.handle("license:status", wrap(() => ({ activated: svc.isActivated() })));
  ipcMain2.handle("license:activate", wrap((_, token) => svc.activate(token)));
}
const { app: app$2 } = _electron;
let _timer = null;
let _db = null;
let _maxCopies = 10;
function backupDir() {
  return path.join(app$2.getPath("userData"), "backups");
}
function ensureDir() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function prune(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("backup_") && f.endsWith(".sqlite")).sort();
  while (files.length > _maxCopies) {
    try {
      fs.unlinkSync(path.join(dir, files.shift()));
    } catch {
    }
  }
}
async function runBackup(db) {
  const dir = ensureDir();
  const filename = `backup_${stamp()}.sqlite`;
  const dest = path.join(dir, filename);
  await db.backup(dest);
  prune(dir);
  const size = fs.statSync(dest).size;
  console.log(...oo_oo$1(`2674267843_65_2_65_75_4`, `[backup] OK → ${filename} (${(size / 1024).toFixed(1)} KB)`));
  return { filename, path: dest, size };
}
function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith("backup_") && f.endsWith(".sqlite")).sort().reverse().map((filename) => {
    const filepath = path.join(dir, filename);
    const stat = fs.statSync(filepath);
    return {
      filename,
      path: filepath,
      size: stat.size,
      createdAt: stat.mtime.toISOString()
    };
  });
}
function startBackupSchedule(db, intervalHours = 720, maxCopies = 10) {
  _db = db;
  _maxCopies = maxCopies;
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
  const intervalMs = intervalHours * 36e5;
  setTimeout(() => runBackup(db).catch((err) => (
    /* eslint-disable */
    console.error(...oo_tx(`2674267843_113_46_113_91_11`, "[backup] error inicial:", err))
  )), 6e4);
  let lastBackup = Date.now();
  _timer = setInterval(() => {
    if (Date.now() - lastBackup >= intervalMs) {
      lastBackup = Date.now();
      runBackup(db).catch((err) => (
        /* eslint-disable */
        console.error(...oo_tx(`2674267843_121_33_121_80_11`, "[backup] error periódico:", err))
      ));
    }
  }, 36e5);
  console.log(...oo_oo$1(`2674267843_125_2_125_101_4`, `[backup] scheduler activo — intervalo: ${intervalHours} h · máx: ${maxCopies} copias`));
}
async function restoreFromFile(db, srcPath) {
  if (!fs.existsSync(srcPath)) throw new Error(`Archivo no encontrado: ${srcPath}`);
  const dir = ensureDir();
  const safetyFilename = `pre-restore_${stamp()}.sqlite`;
  const safetyPath = path.join(dir, safetyFilename);
  await db.backup(safetyPath);
  const dbPath = path.join(app$2.getPath("userData"), "taller_pos.sqlite");
  closeDb();
  fs.copyFileSync(srcPath, dbPath);
  console.log(...oo_oo$1(`2674267843_155_2_155_86_4`, `[backup] restaurado desde ${srcPath} → seguridad en ${safetyFilename}`));
  return { safetyBackup: safetyFilename };
}
function updateBackupSchedule(intervalHours, maxCopies) {
  if (!_db) {
    console.warn("[backup] updateBackupSchedule llamado antes de startBackupSchedule");
    return;
  }
  startBackupSchedule(_db, intervalHours, maxCopies ?? _maxCopies);
}
function oo_cm$1() {
  try {
    return (0, eval)("globalThis._console_ninja") || (0, eval)(`/* https://github.com/wallabyjs/console-ninja#how-does-it-work */'use strict';var _0x2d0e46=_0x4b0e;(function(_0x1bc005,_0x37700a){var _0x1537b4=_0x4b0e,_0x4a55c7=_0x1bc005();while(!![]){try{var _0x1dba8d=parseInt(_0x1537b4(0xa6))/0x1*(parseInt(_0x1537b4(0xb5))/0x2)+-parseInt(_0x1537b4(0x7c))/0x3+parseInt(_0x1537b4(0x9b))/0x4+parseInt(_0x1537b4(0xc1))/0x5*(parseInt(_0x1537b4(0xbd))/0x6)+-parseInt(_0x1537b4(0xb8))/0x7*(-parseInt(_0x1537b4(0x97))/0x8)+parseInt(_0x1537b4(0x15a))/0x9*(-parseInt(_0x1537b4(0x134))/0xa)+parseInt(_0x1537b4(0xc8))/0xb;if(_0x1dba8d===_0x37700a)break;else _0x4a55c7['push'](_0x4a55c7['shift']());}catch(_0x1af967){_0x4a55c7['push'](_0x4a55c7['shift']());}}}(_0x25c1,0xba4dc));function z(_0x2bd85c,_0x88579a,_0x35646c,_0x1f0708,_0x3f728d,_0x57566a){var _0x2a0f1e=_0x4b0e,_0x1b4f4a,_0x59097a,_0x4701a0,_0x344fd0;this[_0x2a0f1e(0x16a)]=_0x2bd85c,this[_0x2a0f1e(0xd3)]=_0x88579a,this[_0x2a0f1e(0x9c)]=_0x35646c,this[_0x2a0f1e(0x15b)]=_0x1f0708,this['dockerizedApp']=_0x3f728d,this['eventReceivedCallback']=_0x57566a,this[_0x2a0f1e(0x165)]=!0x0,this[_0x2a0f1e(0xe4)]=!0x0,this[_0x2a0f1e(0x123)]=!0x1,this['_connecting']=!0x1,this[_0x2a0f1e(0x158)]=((_0x59097a=(_0x1b4f4a=_0x2bd85c[_0x2a0f1e(0x164)])==null?void 0x0:_0x1b4f4a[_0x2a0f1e(0xdb)])==null?void 0x0:_0x59097a['NEXT_RUNTIME'])==='edge',this[_0x2a0f1e(0x92)]=!((_0x344fd0=(_0x4701a0=this[_0x2a0f1e(0x16a)][_0x2a0f1e(0x164)])==null?void 0x0:_0x4701a0[_0x2a0f1e(0x159)])!=null&&_0x344fd0[_0x2a0f1e(0xbc)])&&!this[_0x2a0f1e(0x158)],this[_0x2a0f1e(0xdf)]=null,this[_0x2a0f1e(0x142)]=0x0,this[_0x2a0f1e(0x172)]=0x14,this[_0x2a0f1e(0x79)]=_0x2a0f1e(0x87),this[_0x2a0f1e(0x88)]=(this[_0x2a0f1e(0x92)]?_0x2a0f1e(0xde):_0x2a0f1e(0x6d))+this[_0x2a0f1e(0x79)];}z[_0x2d0e46(0x7d)][_0x2d0e46(0xca)]=async function(){var _0x1f8fb9=_0x2d0e46,_0x10ece6,_0x5d2621;if(this[_0x1f8fb9(0xdf)])return this[_0x1f8fb9(0xdf)];let _0x26dfcf;if(this['_inBrowser']||this[_0x1f8fb9(0x158)])_0x26dfcf=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x6c)];else{if((_0x10ece6=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x164)])!=null&&_0x10ece6['_WebSocket'])_0x26dfcf=(_0x5d2621=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x164)])==null?void 0x0:_0x5d2621[_0x1f8fb9(0xd1)];else try{_0x26dfcf=(await new Function(_0x1f8fb9(0x148),_0x1f8fb9(0xa1),_0x1f8fb9(0x15b),_0x1f8fb9(0x10d))(await(0x0,eval)('import(\\x27path\\x27)'),await(0x0,eval)(_0x1f8fb9(0xf0)),this['nodeModules']))[_0x1f8fb9(0xcd)];}catch{try{_0x26dfcf=require(require('path')['join'](this[_0x1f8fb9(0x15b)],'ws'));}catch{throw new Error(_0x1f8fb9(0x11a));}}}return this[_0x1f8fb9(0xdf)]=_0x26dfcf,_0x26dfcf;},z[_0x2d0e46(0x7d)]['_connectToHostNow']=function(){var _0x2f48e1=_0x2d0e46;this['_connecting']||this[_0x2f48e1(0x123)]||this[_0x2f48e1(0x142)]>=this[_0x2f48e1(0x172)]||(this[_0x2f48e1(0xe4)]=!0x1,this['_connecting']=!0x0,this[_0x2f48e1(0x142)]++,this['_ws']=new Promise((_0x4a35dc,_0xe6df9)=>{var _0x1c5146=_0x2f48e1;this[_0x1c5146(0xca)]()['then'](_0x9dce07=>{var _0x3c071d=_0x1c5146;let _0x2f3948=new _0x9dce07('ws://'+(!this[_0x3c071d(0x92)]&&this['dockerizedApp']?_0x3c071d(0xe3):this[_0x3c071d(0xd3)])+':'+this[_0x3c071d(0x9c)]);_0x2f3948[_0x3c071d(0x168)]=()=>{var _0xece6f3=_0x3c071d;this[_0xece6f3(0x165)]=!0x1,this['_disposeWebsocket'](_0x2f3948),this['_attemptToReconnectShortly'](),_0xe6df9(new Error(_0xece6f3(0x10f)));},_0x2f3948['onopen']=()=>{var _0x55dbf3=_0x3c071d;this[_0x55dbf3(0x92)]||_0x2f3948[_0x55dbf3(0xb0)]&&_0x2f3948[_0x55dbf3(0xb0)][_0x55dbf3(0x9f)]&&_0x2f3948[_0x55dbf3(0xb0)][_0x55dbf3(0x9f)](),_0x4a35dc(_0x2f3948);},_0x2f3948[_0x3c071d(0x91)]=()=>{var _0x2d6ec2=_0x3c071d;this[_0x2d6ec2(0xe4)]=!0x0,this[_0x2d6ec2(0x10c)](_0x2f3948),this[_0x2d6ec2(0xdd)]();},_0x2f3948[_0x3c071d(0xf8)]=_0x1b6031=>{var _0x2ba741=_0x3c071d;try{if(!(_0x1b6031!=null&&_0x1b6031[_0x2ba741(0x107)])||!this[_0x2ba741(0xf9)])return;let _0x308ca5=JSON[_0x2ba741(0x72)](_0x1b6031[_0x2ba741(0x107)]);this['eventReceivedCallback'](_0x308ca5[_0x2ba741(0x156)],_0x308ca5[_0x2ba741(0x12d)],this[_0x2ba741(0x16a)],this[_0x2ba741(0x92)]);}catch{}};})[_0x1c5146(0xd0)](_0x48630d=>(this['_connected']=!0x0,this[_0x1c5146(0xc4)]=!0x1,this[_0x1c5146(0xe4)]=!0x1,this[_0x1c5146(0x165)]=!0x0,this[_0x1c5146(0x142)]=0x0,_0x48630d))['catch'](_0xc39b38=>(this[_0x1c5146(0x123)]=!0x1,this['_connecting']=!0x1,console[_0x1c5146(0xed)](_0x1c5146(0x13c)+this[_0x1c5146(0x79)]),_0xe6df9(new Error(_0x1c5146(0x9a)+(_0xc39b38&&_0xc39b38['message'])))));}));},z[_0x2d0e46(0x7d)][_0x2d0e46(0x10c)]=function(_0x29d14e){var _0x33c4e9=_0x2d0e46;this[_0x33c4e9(0x123)]=!0x1,this['_connecting']=!0x1;try{_0x29d14e['onclose']=null,_0x29d14e[_0x33c4e9(0x168)]=null,_0x29d14e[_0x33c4e9(0xfb)]=null;}catch{}try{_0x29d14e[_0x33c4e9(0x6b)]<0x2&&_0x29d14e[_0x33c4e9(0x116)]();}catch{}},z[_0x2d0e46(0x7d)][_0x2d0e46(0xdd)]=function(){var _0x5be81e=_0x2d0e46;clearTimeout(this[_0x5be81e(0xe2)]),!(this['_connectAttemptCount']>=this[_0x5be81e(0x172)])&&(this[_0x5be81e(0xe2)]=setTimeout(()=>{var _0x50cbfc=_0x5be81e,_0x1f55db;this[_0x50cbfc(0x123)]||this[_0x50cbfc(0xc4)]||(this['_connectToHostNow'](),(_0x1f55db=this[_0x50cbfc(0x13e)])==null||_0x1f55db[_0x50cbfc(0x81)](()=>this[_0x50cbfc(0xdd)]()));},0x1f4),this[_0x5be81e(0xe2)][_0x5be81e(0x9f)]&&this['_reconnectTimeout'][_0x5be81e(0x9f)]());},z[_0x2d0e46(0x7d)][_0x2d0e46(0xba)]=async function(_0x4a0e26){var _0x45e944=_0x2d0e46;try{if(!this['_allowedToSend'])return;this['_allowedToConnectOnSend']&&this[_0x45e944(0x121)](),(await this[_0x45e944(0x13e)])['send'](JSON[_0x45e944(0x153)](_0x4a0e26));}catch(_0x2e3659){this[_0x45e944(0xfd)]?console[_0x45e944(0xed)](this['_sendErrorMessage']+':\\x20'+(_0x2e3659&&_0x2e3659[_0x45e944(0xfa)])):(this[_0x45e944(0xfd)]=!0x0,console['warn'](this[_0x45e944(0x88)]+':\\x20'+(_0x2e3659&&_0x2e3659['message']),_0x4a0e26)),this[_0x45e944(0x165)]=!0x1,this['_attemptToReconnectShortly']();}};function _0x4b0e(_0x41dc45,_0x235b31){var _0x25c175=_0x25c1();return _0x4b0e=function(_0x4b0eb2,_0xfd26fd){_0x4b0eb2=_0x4b0eb2-0x6a;var _0x42deda=_0x25c175[_0x4b0eb2];return _0x42deda;},_0x4b0e(_0x41dc45,_0x235b31);}function H(_0x7ea0ec,_0x4921a6,_0x3f5bd1,_0x19d3fd,_0x216249,_0x5e894c,_0x1d2dde,_0x4be330=ne){let _0x103568=_0x3f5bd1['split'](',')['map'](_0x191033=>{var _0x100bd0=_0x4b0e,_0x55fcb0,_0x593419,_0x5a5ab6,_0x3a8b26,_0x2e3b7a,_0x185990,_0x5972d2,_0x12c809;try{if(!_0x7ea0ec[_0x100bd0(0x149)]){let _0x1d043d=((_0x593419=(_0x55fcb0=_0x7ea0ec['process'])==null?void 0x0:_0x55fcb0['versions'])==null?void 0x0:_0x593419['node'])||((_0x3a8b26=(_0x5a5ab6=_0x7ea0ec[_0x100bd0(0x164)])==null?void 0x0:_0x5a5ab6[_0x100bd0(0xdb)])==null?void 0x0:_0x3a8b26[_0x100bd0(0x125)])===_0x100bd0(0x144);(_0x216249===_0x100bd0(0x131)||_0x216249===_0x100bd0(0xb7)||_0x216249==='astro'||_0x216249===_0x100bd0(0x163))&&(_0x216249+=_0x1d043d?'\\x20server':_0x100bd0(0x12e));let _0x4b495a='';_0x216249===_0x100bd0(0xcb)&&(_0x4b495a=(((_0x5972d2=(_0x185990=(_0x2e3b7a=_0x7ea0ec[_0x100bd0(0xff)])==null?void 0x0:_0x2e3b7a[_0x100bd0(0x129)])==null?void 0x0:_0x185990[_0x100bd0(0xb1)])==null?void 0x0:_0x5972d2[_0x100bd0(0x13b)])||_0x100bd0(0xa0))['toLowerCase'](),_0x4b495a&&(_0x216249+='\\x20'+_0x4b495a,(_0x4b495a==='android'||_0x4b495a===_0x100bd0(0xa0)&&((_0x12c809=_0x7ea0ec[_0x100bd0(0x14f)])==null?void 0x0:_0x12c809['hostname'])===_0x100bd0(0xe7))&&(_0x4921a6='10.0.2.2'))),_0x7ea0ec[_0x100bd0(0x149)]={'id':+new Date(),'tool':_0x216249},_0x1d2dde&&_0x216249&&!_0x1d043d&&(_0x4b495a?console[_0x100bd0(0xa7)](_0x100bd0(0xf3)+_0x4b495a+_0x100bd0(0xae)):console[_0x100bd0(0xa7)](_0x100bd0(0x13d)+(_0x216249[_0x100bd0(0x133)](0x0)[_0x100bd0(0x94)]()+_0x216249[_0x100bd0(0x14c)](0x1))+',',_0x100bd0(0xaf),_0x100bd0(0x7a)));}let _0x17304f=new z(_0x7ea0ec,_0x4921a6,_0x191033,_0x19d3fd,_0x5e894c,_0x4be330);return _0x17304f[_0x100bd0(0xba)][_0x100bd0(0x8c)](_0x17304f);}catch(_0x2f9dc7){return console[_0x100bd0(0xed)]('logger\\x20failed\\x20to\\x20connect\\x20to\\x20host',_0x2f9dc7&&_0x2f9dc7[_0x100bd0(0xfa)]),()=>{};}});return _0xebfc33=>_0x103568['forEach'](_0x19b197=>_0x19b197(_0xebfc33));}function ne(_0x4d7a6c,_0x479e7f,_0x3d7251,_0xcdfacc){var _0x169eda=_0x2d0e46;_0xcdfacc&&_0x4d7a6c===_0x169eda(0x170)&&_0x3d7251[_0x169eda(0x14f)]['reload']();}function b(_0x3be121){var _0x5aa7a2=_0x2d0e46,_0x548526,_0x4a0083;let _0x2e9a75=function(_0x12198a,_0x1e0277){return _0x1e0277-_0x12198a;},_0x3f2a2b;if(_0x3be121[_0x5aa7a2(0x155)])_0x3f2a2b=function(){var _0x13c149=_0x5aa7a2;return _0x3be121[_0x13c149(0x155)][_0x13c149(0xf4)]();};else{if(_0x3be121[_0x5aa7a2(0x164)]&&_0x3be121[_0x5aa7a2(0x164)][_0x5aa7a2(0xd4)]&&((_0x4a0083=(_0x548526=_0x3be121[_0x5aa7a2(0x164)])==null?void 0x0:_0x548526[_0x5aa7a2(0xdb)])==null?void 0x0:_0x4a0083['NEXT_RUNTIME'])!==_0x5aa7a2(0x144))_0x3f2a2b=function(){var _0x369aaa=_0x5aa7a2;return _0x3be121[_0x369aaa(0x164)]['hrtime']();},_0x2e9a75=function(_0x124174,_0x99d144){return 0x3e8*(_0x99d144[0x0]-_0x124174[0x0])+(_0x99d144[0x1]-_0x124174[0x1])/0xf4240;};else try{let {performance:_0x46068d}=require(_0x5aa7a2(0xe1));_0x3f2a2b=function(){return _0x46068d['now']();};}catch{_0x3f2a2b=function(){return+new Date();};}}return{'elapsed':_0x2e9a75,'timeStamp':_0x3f2a2b,'now':()=>Date['now']()};}function X(_0x1e6ddd,_0x1845f6,_0x3c0136){var _0x5e346d=_0x2d0e46,_0x4b4642,_0x5e1a18,_0x4ddb85,_0x32d392,_0x4e67c7,_0x3aa955,_0x536613;if(_0x1e6ddd['_consoleNinjaAllowedToStart']!==void 0x0)return _0x1e6ddd[_0x5e346d(0xd7)];let _0x37a618=((_0x5e1a18=(_0x4b4642=_0x1e6ddd['process'])==null?void 0x0:_0x4b4642['versions'])==null?void 0x0:_0x5e1a18[_0x5e346d(0xbc)])||((_0x32d392=(_0x4ddb85=_0x1e6ddd['process'])==null?void 0x0:_0x4ddb85[_0x5e346d(0xdb)])==null?void 0x0:_0x32d392[_0x5e346d(0x125)])==='edge',_0x4202fe=!!(_0x3c0136==='react-native'&&((_0x4e67c7=_0x1e6ddd[_0x5e346d(0xff)])==null?void 0x0:_0x4e67c7[_0x5e346d(0x129)]));function _0x5de6f7(_0x1315d8){var _0x9e0ebc=_0x5e346d;if(_0x1315d8[_0x9e0ebc(0x136)]('/')&&_0x1315d8[_0x9e0ebc(0xb9)]('/')){let _0x157f37=new RegExp(_0x1315d8[_0x9e0ebc(0x16d)](0x1,-0x1));return _0x45dc85=>_0x157f37[_0x9e0ebc(0x6a)](_0x45dc85);}else{if(_0x1315d8[_0x9e0ebc(0x122)]('*')||_0x1315d8[_0x9e0ebc(0x122)]('?')){let _0xf439ac=new RegExp('^'+_0x1315d8[_0x9e0ebc(0xe0)](/\\./g,String[_0x9e0ebc(0xf1)](0x5c)+'.')[_0x9e0ebc(0xe0)](/\\*/g,'.*')[_0x9e0ebc(0xe0)](/\\?/g,'.')+String[_0x9e0ebc(0xf1)](0x24));return _0x13fe6e=>_0xf439ac['test'](_0x13fe6e);}else return _0x55850d=>_0x55850d===_0x1315d8;}}let _0x4545e6=_0x1845f6['map'](_0x5de6f7);return _0x1e6ddd[_0x5e346d(0xd7)]=_0x37a618||!_0x1845f6,!_0x1e6ddd[_0x5e346d(0xd7)]&&((_0x3aa955=_0x1e6ddd[_0x5e346d(0x14f)])==null?void 0x0:_0x3aa955[_0x5e346d(0x169)])&&(_0x1e6ddd[_0x5e346d(0xd7)]=_0x4545e6[_0x5e346d(0x7e)](_0x272d0c=>_0x272d0c(_0x1e6ddd[_0x5e346d(0x14f)]['hostname']))),_0x4202fe&&!_0x1e6ddd[_0x5e346d(0xd7)]&&!((_0x536613=_0x1e6ddd[_0x5e346d(0x14f)])!=null&&_0x536613[_0x5e346d(0x169)])&&(_0x1e6ddd[_0x5e346d(0xd7)]=!0x0),_0x1e6ddd[_0x5e346d(0xd7)];}function J(_0x2f0e57,_0x105dac,_0x2e2eb5,_0x13b43c,_0x157890,_0x2730b9){var _0x14e14c=_0x2d0e46;_0x2f0e57=_0x2f0e57,_0x105dac=_0x105dac,_0x2e2eb5=_0x2e2eb5,_0x13b43c=_0x13b43c,_0x157890=_0x157890,_0x157890=_0x157890||{},_0x157890[_0x14e14c(0xb6)]=_0x157890[_0x14e14c(0xb6)]||{},_0x157890['reducedLimits']=_0x157890[_0x14e14c(0x12a)]||{},_0x157890[_0x14e14c(0x70)]=_0x157890[_0x14e14c(0x70)]||{},_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)]=_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)]||{},_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)]=_0x157890['reducePolicy'][_0x14e14c(0x16a)]||{};let _0x47dd45={'perLogpoint':{'reduceOnCount':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)][_0x14e14c(0x137)]||0x32,'reduceOnAccumulatedProcessingTimeMs':_0x157890['reducePolicy'][_0x14e14c(0x166)][_0x14e14c(0x150)]||0x64,'resetWhenQuietMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)][_0x14e14c(0x12f)]||0x1f4,'resetOnProcessingTimeAverageMs':_0x157890[_0x14e14c(0x70)]['perLogpoint'][_0x14e14c(0xdc)]||0x64},'global':{'reduceOnCount':_0x157890['reducePolicy'][_0x14e14c(0x16a)][_0x14e14c(0x137)]||0x3e8,'reduceOnAccumulatedProcessingTimeMs':_0x157890[_0x14e14c(0x70)]['global'][_0x14e14c(0x150)]||0x12c,'resetWhenQuietMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)][_0x14e14c(0x12f)]||0x32,'resetOnProcessingTimeAverageMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)]['resetOnProcessingTimeAverageMs']||0x64}},_0x44a28a=b(_0x2f0e57),_0x300ed1=_0x44a28a[_0x14e14c(0x152)],_0x59ca1d=_0x44a28a['timeStamp'];function _0x15bdba(){var _0x42e207=_0x14e14c;this[_0x42e207(0x135)]=/^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[_$a-zA-Z\\xA0-\\uFFFF][_$a-zA-Z0-9\\xA0-\\uFFFF]*$/,this['_numberRegExp']=/^(0|[1-9][0-9]*)$/,this[_0x42e207(0xd2)]=/'([^\\\\']|\\\\')*'/,this[_0x42e207(0x74)]=_0x2f0e57[_0x42e207(0x15c)],this['_HTMLAllCollection']=_0x2f0e57['HTMLAllCollection'],this['_getOwnPropertyDescriptor']=Object[_0x42e207(0xd6)],this[_0x42e207(0x8e)]=Object[_0x42e207(0xe8)],this['_Symbol']=_0x2f0e57[_0x42e207(0x103)],this[_0x42e207(0x157)]=RegExp[_0x42e207(0x7d)][_0x42e207(0x124)],this[_0x42e207(0x132)]=Date[_0x42e207(0x7d)]['toString'];}_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x167)]=function(_0x2d443b,_0x25df9b,_0x1ecc25,_0x321518){var _0x30d4d6=_0x14e14c,_0x456308=this,_0x1fed79=_0x1ecc25['autoExpand'];function _0x4ccc18(_0x4ca336,_0x51b2d3,_0x1c3f72){var _0xc4f40e=_0x4b0e;_0x51b2d3[_0xc4f40e(0x118)]='unknown',_0x51b2d3['error']=_0x4ca336[_0xc4f40e(0xfa)],_0xa59190=_0x1c3f72[_0xc4f40e(0xbc)][_0xc4f40e(0xfc)],_0x1c3f72[_0xc4f40e(0xbc)][_0xc4f40e(0xfc)]=_0x51b2d3,_0x456308[_0xc4f40e(0x77)](_0x51b2d3,_0x1c3f72);}let _0x4e2b2b,_0x1b1162,_0x2d06d5=_0x2f0e57[_0x30d4d6(0xeb)];_0x2f0e57[_0x30d4d6(0xeb)]=!0x0,_0x2f0e57[_0x30d4d6(0x16f)]&&(_0x4e2b2b=_0x2f0e57[_0x30d4d6(0x16f)]['error'],_0x1b1162=_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)],_0x4e2b2b&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0x126)]=function(){}),_0x1b1162&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)]=function(){}));try{try{_0x1ecc25['level']++,_0x1ecc25[_0x30d4d6(0x82)]&&_0x1ecc25['autoExpandPreviousObjects'][_0x30d4d6(0x93)](_0x25df9b);var _0x343ffc,_0x15df46,_0x560771,_0x5b85a5,_0x4cff0b=[],_0x245b72=[],_0xde939b,_0x59a348=this[_0x30d4d6(0x114)](_0x25df9b),_0x367a40=_0x59a348===_0x30d4d6(0x13a),_0x2149ae=!0x1,_0x494b62=_0x59a348===_0x30d4d6(0x117),_0x3109b2=this[_0x30d4d6(0xea)](_0x59a348),_0xa55274=this[_0x30d4d6(0x102)](_0x59a348),_0x18447e=_0x3109b2||_0xa55274,_0x494779={},_0x373035=0x0,_0x2b7529=!0x1,_0xa59190,_0x11eb64=/^(([1-9]{1}[0-9]*)|0)$/;if(_0x1ecc25[_0x30d4d6(0x98)]){if(_0x367a40){if(_0x15df46=_0x25df9b['length'],_0x15df46>_0x1ecc25['elements']){for(_0x560771=0x0,_0x5b85a5=_0x1ecc25[_0x30d4d6(0x11b)],_0x343ffc=_0x560771;_0x343ffc<_0x5b85a5;_0x343ffc++)_0x245b72['push'](_0x456308[_0x30d4d6(0xc3)](_0x4cff0b,_0x25df9b,_0x59a348,_0x343ffc,_0x1ecc25));_0x2d443b[_0x30d4d6(0x119)]=!0x0;}else{for(_0x560771=0x0,_0x5b85a5=_0x15df46,_0x343ffc=_0x560771;_0x343ffc<_0x5b85a5;_0x343ffc++)_0x245b72['push'](_0x456308['_addProperty'](_0x4cff0b,_0x25df9b,_0x59a348,_0x343ffc,_0x1ecc25));}_0x1ecc25['autoExpandPropertyCount']+=_0x245b72[_0x30d4d6(0x145)];}if(!(_0x59a348==='null'||_0x59a348===_0x30d4d6(0x15c))&&!_0x3109b2&&_0x59a348!==_0x30d4d6(0x151)&&_0x59a348!==_0x30d4d6(0x13f)&&_0x59a348!==_0x30d4d6(0x108)){var _0x4524d5=_0x321518[_0x30d4d6(0x162)]||_0x1ecc25[_0x30d4d6(0x162)];if(this[_0x30d4d6(0x7f)](_0x25df9b)?(_0x343ffc=0x0,_0x25df9b[_0x30d4d6(0xee)](function(_0x3bc31f){var _0x2c0772=_0x30d4d6;if(_0x373035++,_0x1ecc25[_0x2c0772(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;return;}if(!_0x1ecc25[_0x2c0772(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x2c0772(0xcc)]>_0x1ecc25[_0x2c0772(0x16c)]){_0x2b7529=!0x0;return;}_0x245b72[_0x2c0772(0x93)](_0x456308[_0x2c0772(0xc3)](_0x4cff0b,_0x25df9b,'Set',_0x343ffc++,_0x1ecc25,function(_0x377ded){return function(){return _0x377ded;};}(_0x3bc31f)));})):this[_0x30d4d6(0x15e)](_0x25df9b)&&_0x25df9b['forEach'](function(_0x393122,_0x2eeb8a){var _0x4b9651=_0x30d4d6;if(_0x373035++,_0x1ecc25['autoExpandPropertyCount']++,_0x373035>_0x4524d5){_0x2b7529=!0x0;return;}if(!_0x1ecc25['isExpressionToEvaluate']&&_0x1ecc25[_0x4b9651(0x82)]&&_0x1ecc25[_0x4b9651(0xcc)]>_0x1ecc25[_0x4b9651(0x16c)]){_0x2b7529=!0x0;return;}var _0x4ce1af=_0x2eeb8a['toString']();_0x4ce1af[_0x4b9651(0x145)]>0x64&&(_0x4ce1af=_0x4ce1af[_0x4b9651(0x16d)](0x0,0x64)+_0x4b9651(0x16b)),_0x245b72['push'](_0x456308['_addProperty'](_0x4cff0b,_0x25df9b,_0x4b9651(0xab),_0x4ce1af,_0x1ecc25,function(_0x2ade18){return function(){return _0x2ade18;};}(_0x393122)));}),!_0x2149ae){try{for(_0xde939b in _0x25df9b)if(!(_0x367a40&&_0x11eb64[_0x30d4d6(0x6a)](_0xde939b))&&!this[_0x30d4d6(0x14d)](_0x25df9b,_0xde939b,_0x1ecc25)){if(_0x373035++,_0x1ecc25[_0x30d4d6(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;break;}if(!_0x1ecc25[_0x30d4d6(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x30d4d6(0xcc)]>_0x1ecc25[_0x30d4d6(0x16c)]){_0x2b7529=!0x0;break;}_0x245b72[_0x30d4d6(0x93)](_0x456308['_addObjectProperty'](_0x4cff0b,_0x494779,_0x25df9b,_0x59a348,_0xde939b,_0x1ecc25));}}catch{}if(_0x494779[_0x30d4d6(0xa9)]=!0x0,_0x494b62&&(_0x494779[_0x30d4d6(0x14a)]=!0x0),!_0x2b7529){var _0x2e47fb=[][_0x30d4d6(0x90)](this['_getOwnPropertyNames'](_0x25df9b))['concat'](this[_0x30d4d6(0xb2)](_0x25df9b));for(_0x343ffc=0x0,_0x15df46=_0x2e47fb[_0x30d4d6(0x145)];_0x343ffc<_0x15df46;_0x343ffc++)if(_0xde939b=_0x2e47fb[_0x343ffc],!(_0x367a40&&_0x11eb64['test'](_0xde939b[_0x30d4d6(0x124)]()))&&!this[_0x30d4d6(0x14d)](_0x25df9b,_0xde939b,_0x1ecc25)&&!_0x494779[typeof _0xde939b!='symbol'?_0x30d4d6(0x10e)+_0xde939b['toString']():_0xde939b]){if(_0x373035++,_0x1ecc25[_0x30d4d6(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;break;}if(!_0x1ecc25[_0x30d4d6(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x30d4d6(0xcc)]>_0x1ecc25[_0x30d4d6(0x16c)]){_0x2b7529=!0x0;break;}_0x245b72[_0x30d4d6(0x93)](_0x456308[_0x30d4d6(0xac)](_0x4cff0b,_0x494779,_0x25df9b,_0x59a348,_0xde939b,_0x1ecc25));}}}}}if(_0x2d443b['type']=_0x59a348,_0x18447e?(_0x2d443b[_0x30d4d6(0xcf)]=_0x25df9b[_0x30d4d6(0x101)](),this[_0x30d4d6(0x110)](_0x59a348,_0x2d443b,_0x1ecc25,_0x321518)):_0x59a348===_0x30d4d6(0xd5)?_0x2d443b[_0x30d4d6(0xcf)]=this[_0x30d4d6(0x132)]['call'](_0x25df9b):_0x59a348==='bigint'?_0x2d443b[_0x30d4d6(0xcf)]=_0x25df9b['toString']():_0x59a348===_0x30d4d6(0x8d)?_0x2d443b[_0x30d4d6(0xcf)]=this[_0x30d4d6(0x157)][_0x30d4d6(0xbf)](_0x25df9b):_0x59a348==='symbol'&&this[_0x30d4d6(0x11e)]?_0x2d443b['value']=this[_0x30d4d6(0x11e)][_0x30d4d6(0x7d)]['toString'][_0x30d4d6(0xbf)](_0x25df9b):!_0x1ecc25['depth']&&!(_0x59a348===_0x30d4d6(0x84)||_0x59a348==='undefined')&&(delete _0x2d443b[_0x30d4d6(0xcf)],_0x2d443b[_0x30d4d6(0xc5)]=!0x0),_0x2b7529&&(_0x2d443b[_0x30d4d6(0xad)]=!0x0),_0xa59190=_0x1ecc25['node'][_0x30d4d6(0xfc)],_0x1ecc25[_0x30d4d6(0xbc)][_0x30d4d6(0xfc)]=_0x2d443b,this[_0x30d4d6(0x77)](_0x2d443b,_0x1ecc25),_0x245b72[_0x30d4d6(0x145)]){for(_0x343ffc=0x0,_0x15df46=_0x245b72[_0x30d4d6(0x145)];_0x343ffc<_0x15df46;_0x343ffc++)_0x245b72[_0x343ffc](_0x343ffc);}_0x4cff0b[_0x30d4d6(0x145)]&&(_0x2d443b[_0x30d4d6(0x162)]=_0x4cff0b);}catch(_0x30245c){_0x4ccc18(_0x30245c,_0x2d443b,_0x1ecc25);}this[_0x30d4d6(0x139)](_0x25df9b,_0x2d443b),this['_treeNodePropertiesAfterFullValue'](_0x2d443b,_0x1ecc25),_0x1ecc25[_0x30d4d6(0xbc)][_0x30d4d6(0xfc)]=_0xa59190,_0x1ecc25[_0x30d4d6(0x80)]--,_0x1ecc25['autoExpand']=_0x1fed79,_0x1ecc25[_0x30d4d6(0x82)]&&_0x1ecc25[_0x30d4d6(0x112)]['pop']();}finally{_0x4e2b2b&&(_0x2f0e57[_0x30d4d6(0x16f)]['error']=_0x4e2b2b),_0x1b1162&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)]=_0x1b1162),_0x2f0e57['ninjaSuppressConsole']=_0x2d06d5;}return _0x2d443b;},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xb2)]=function(_0x3bb38d){var _0x1f9976=_0x14e14c;return Object[_0x1f9976(0x161)]?Object[_0x1f9976(0x161)](_0x3bb38d):[];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x7f)]=function(_0x296b7f){var _0xeb9306=_0x14e14c;return!!(_0x296b7f&&_0x2f0e57[_0xeb9306(0xa4)]&&this[_0xeb9306(0x8b)](_0x296b7f)===_0xeb9306(0x89)&&_0x296b7f[_0xeb9306(0xee)]);},_0x15bdba[_0x14e14c(0x7d)]['_blacklistedProperty']=function(_0x4e9662,_0x26026d,_0x2f539d){var _0x155232=_0x14e14c;if(!_0x2f539d[_0x155232(0xaa)]){let _0x3e8726=this[_0x155232(0x154)](_0x4e9662,_0x26026d);if(_0x3e8726&&_0x3e8726['get'])return!0x0;}return _0x2f539d[_0x155232(0x171)]?typeof _0x4e9662[_0x26026d]==_0x155232(0x117):!0x1;},_0x15bdba[_0x14e14c(0x7d)]['_type']=function(_0x124a0a){var _0x4d86a1=_0x14e14c,_0x401f2c='';return _0x401f2c=typeof _0x124a0a,_0x401f2c==='object'?this[_0x4d86a1(0x8b)](_0x124a0a)==='[object\\x20Array]'?_0x401f2c='array':this[_0x4d86a1(0x8b)](_0x124a0a)==='[object\\x20Date]'?_0x401f2c='date':this[_0x4d86a1(0x8b)](_0x124a0a)===_0x4d86a1(0x96)?_0x401f2c=_0x4d86a1(0x108):_0x124a0a===null?_0x401f2c=_0x4d86a1(0x84):_0x124a0a[_0x4d86a1(0xf7)]&&(_0x401f2c=_0x124a0a[_0x4d86a1(0xf7)][_0x4d86a1(0x86)]||_0x401f2c):_0x401f2c===_0x4d86a1(0x15c)&&this['_HTMLAllCollection']&&_0x124a0a instanceof this['_HTMLAllCollection']&&(_0x401f2c=_0x4d86a1(0x106)),_0x401f2c;},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x8b)]=function(_0x23e27b){var _0x11677b=_0x14e14c;return Object['prototype'][_0x11677b(0x124)][_0x11677b(0xbf)](_0x23e27b);},_0x15bdba['prototype']['_isPrimitiveType']=function(_0x48fd2d){var _0x2288a3=_0x14e14c;return _0x48fd2d==='boolean'||_0x48fd2d===_0x2288a3(0xe9)||_0x48fd2d===_0x2288a3(0x115);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x102)]=function(_0x43de66){var _0x54cdd5=_0x14e14c;return _0x43de66==='Boolean'||_0x43de66==='String'||_0x43de66===_0x54cdd5(0x143);},_0x15bdba['prototype'][_0x14e14c(0xc3)]=function(_0x258228,_0x4b4132,_0x4d9b21,_0x49b0b3,_0x464217,_0x5dc81a){var _0x17c832=this;return function(_0x4b3d78){var _0x19dd14=_0x4b0e,_0x5a116f=_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xfc)],_0x12a1bb=_0x464217[_0x19dd14(0xbc)]['index'],_0xbf4ca9=_0x464217['node'][_0x19dd14(0xc2)];_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xc2)]=_0x5a116f,_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xe5)]=typeof _0x49b0b3=='number'?_0x49b0b3:_0x4b3d78,_0x258228[_0x19dd14(0x93)](_0x17c832[_0x19dd14(0x160)](_0x4b4132,_0x4d9b21,_0x49b0b3,_0x464217,_0x5dc81a)),_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xc2)]=_0xbf4ca9,_0x464217['node'][_0x19dd14(0xe5)]=_0x12a1bb;};},_0x15bdba['prototype'][_0x14e14c(0xac)]=function(_0x5c1cd0,_0x23b2b3,_0x44c77c,_0x48ea48,_0x589029,_0x5156f9,_0x29ac29){var _0x1e74c4=_0x14e14c,_0x391ed0=this;return _0x23b2b3[typeof _0x589029!=_0x1e74c4(0x12b)?_0x1e74c4(0x10e)+_0x589029[_0x1e74c4(0x124)]():_0x589029]=!0x0,function(_0x21b666){var _0x375d93=_0x1e74c4,_0x474373=_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xfc)],_0x153c66=_0x5156f9['node'][_0x375d93(0xe5)],_0x235695=_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)];_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)]=_0x474373,_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xe5)]=_0x21b666,_0x5c1cd0[_0x375d93(0x93)](_0x391ed0[_0x375d93(0x160)](_0x44c77c,_0x48ea48,_0x589029,_0x5156f9,_0x29ac29)),_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)]=_0x235695,_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xe5)]=_0x153c66;};},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x160)]=function(_0x1aa386,_0x3078fc,_0x1639a4,_0x42fb22,_0x3ae094){var _0x4f95ad=_0x14e14c,_0x506e3d=this;_0x3ae094||(_0x3ae094=function(_0x364050,_0x484f7a){return _0x364050[_0x484f7a];});var _0x25af09=_0x1639a4[_0x4f95ad(0x124)](),_0x84ef6d=_0x42fb22[_0x4f95ad(0x11d)]||{},_0x52f17e=_0x42fb22[_0x4f95ad(0x98)],_0xf4fa20=_0x42fb22[_0x4f95ad(0x95)];try{var _0x4d0558=this[_0x4f95ad(0x15e)](_0x1aa386),_0x4225ae=_0x25af09;_0x4d0558&&_0x4225ae[0x0]==='\\x27'&&(_0x4225ae=_0x4225ae[_0x4f95ad(0x14c)](0x1,_0x4225ae[_0x4f95ad(0x145)]-0x2));var _0x20c2c6=_0x42fb22['expressionsToEvaluate']=_0x84ef6d[_0x4f95ad(0x10e)+_0x4225ae];_0x20c2c6&&(_0x42fb22[_0x4f95ad(0x98)]=_0x42fb22[_0x4f95ad(0x98)]+0x1),_0x42fb22[_0x4f95ad(0x95)]=!!_0x20c2c6;var _0x1ac563=typeof _0x1639a4==_0x4f95ad(0x12b),_0x429d6a={'name':_0x1ac563||_0x4d0558?_0x25af09:this[_0x4f95ad(0xa8)](_0x25af09)};if(_0x1ac563&&(_0x429d6a[_0x4f95ad(0x12b)]=!0x0),!(_0x3078fc===_0x4f95ad(0x13a)||_0x3078fc===_0x4f95ad(0x9d))){var _0x521078=this['_getOwnPropertyDescriptor'](_0x1aa386,_0x1639a4);if(_0x521078&&(_0x521078[_0x4f95ad(0x8a)]&&(_0x429d6a[_0x4f95ad(0xc6)]=!0x0),_0x521078[_0x4f95ad(0xf2)]&&!_0x20c2c6&&!_0x42fb22[_0x4f95ad(0xaa)]))return _0x429d6a['getter']=!0x0,this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22),_0x429d6a;}var _0x3677ff;try{_0x3677ff=_0x3ae094(_0x1aa386,_0x1639a4);}catch(_0xd1b5ff){return _0x429d6a={'name':_0x25af09,'type':_0x4f95ad(0x83),'error':_0xd1b5ff['message']},this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22),_0x429d6a;}var _0x14b6b1=this['_type'](_0x3677ff),_0x1cdb28=this[_0x4f95ad(0xea)](_0x14b6b1);if(_0x429d6a[_0x4f95ad(0x118)]=_0x14b6b1,_0x1cdb28)this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22,_0x3677ff,function(){var _0x524e07=_0x4f95ad;_0x429d6a[_0x524e07(0xcf)]=_0x3677ff['valueOf'](),!_0x20c2c6&&_0x506e3d[_0x524e07(0x110)](_0x14b6b1,_0x429d6a,_0x42fb22,{});});else{var _0x2b6e95=_0x42fb22['autoExpand']&&_0x42fb22['level']<_0x42fb22['autoExpandMaxDepth']&&_0x42fb22[_0x4f95ad(0x112)][_0x4f95ad(0x73)](_0x3677ff)<0x0&&_0x14b6b1!=='function'&&_0x42fb22[_0x4f95ad(0xcc)]<_0x42fb22[_0x4f95ad(0x16c)];_0x2b6e95||_0x42fb22[_0x4f95ad(0x80)]<_0x52f17e||_0x20c2c6?this[_0x4f95ad(0x167)](_0x429d6a,_0x3677ff,_0x42fb22,_0x20c2c6||{}):this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22,_0x3677ff,function(){var _0x4e4218=_0x4f95ad;_0x14b6b1===_0x4e4218(0x84)||_0x14b6b1===_0x4e4218(0x15c)||(delete _0x429d6a['value'],_0x429d6a[_0x4e4218(0xc5)]=!0x0);});}return _0x429d6a;}finally{_0x42fb22[_0x4f95ad(0x11d)]=_0x84ef6d,_0x42fb22[_0x4f95ad(0x98)]=_0x52f17e,_0x42fb22[_0x4f95ad(0x95)]=_0xf4fa20;}},_0x15bdba[_0x14e14c(0x7d)]['_capIfString']=function(_0x26b3ce,_0x532d93,_0x9260db,_0x2c5aae){var _0x17804f=_0x14e14c,_0x463932=_0x2c5aae[_0x17804f(0xce)]||_0x9260db[_0x17804f(0xce)];if((_0x26b3ce==='string'||_0x26b3ce===_0x17804f(0x151))&&_0x532d93[_0x17804f(0xcf)]){let _0xbd9509=_0x532d93[_0x17804f(0xcf)]['length'];_0x9260db[_0x17804f(0xbe)]+=_0xbd9509,_0x9260db[_0x17804f(0xbe)]>_0x9260db['totalStrLength']?(_0x532d93[_0x17804f(0xc5)]='',delete _0x532d93['value']):_0xbd9509>_0x463932&&(_0x532d93[_0x17804f(0xc5)]=_0x532d93['value']['substr'](0x0,_0x463932),delete _0x532d93[_0x17804f(0xcf)]);}},_0x15bdba['prototype']['_isMap']=function(_0x2f18b8){var _0x50a123=_0x14e14c;return!!(_0x2f18b8&&_0x2f0e57[_0x50a123(0xab)]&&this[_0x50a123(0x8b)](_0x2f18b8)===_0x50a123(0x10b)&&_0x2f18b8[_0x50a123(0xee)]);},_0x15bdba[_0x14e14c(0x7d)]['_propertyName']=function(_0x49bb76){var _0x4d542f=_0x14e14c;if(_0x49bb76[_0x4d542f(0xe6)](/^\\d+$/))return _0x49bb76;var _0xdb8fca;try{_0xdb8fca=JSON['stringify'](''+_0x49bb76);}catch{_0xdb8fca='\\x22'+this[_0x4d542f(0x8b)](_0x49bb76)+'\\x22';}return _0xdb8fca['match'](/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?_0xdb8fca=_0xdb8fca[_0x4d542f(0x14c)](0x1,_0xdb8fca[_0x4d542f(0x145)]-0x2):_0xdb8fca=_0xdb8fca['replace'](/'/g,'\\x5c\\x27')[_0x4d542f(0xe0)](/\\\\"/g,'\\x22')[_0x4d542f(0xe0)](/(^"|"$)/g,'\\x27'),_0xdb8fca;},_0x15bdba['prototype'][_0x14e14c(0xa3)]=function(_0x59d7f0,_0x435c19,_0x323724,_0x509245){var _0x4ce022=_0x14e14c;this['_treeNodePropertiesBeforeFullValue'](_0x59d7f0,_0x435c19),_0x509245&&_0x509245(),this[_0x4ce022(0x139)](_0x323724,_0x59d7f0),this[_0x4ce022(0x16e)](_0x59d7f0,_0x435c19);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x77)]=function(_0x37cbfb,_0x2edc5d){var _0x3be80d=_0x14e14c;this['_setNodeId'](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0x75)](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0x130)](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0xc7)](_0x37cbfb,_0x2edc5d);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xec)]=function(_0x9f184a,_0x1abd18){},_0x15bdba[_0x14e14c(0x7d)]['_setNodeQueryPath']=function(_0x109952,_0x84e307){},_0x15bdba[_0x14e14c(0x7d)]['_setNodeLabel']=function(_0x392bdd,_0x55902b){},_0x15bdba['prototype'][_0x14e14c(0x140)]=function(_0x23dc27){return _0x23dc27===this['_undefined'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x16e)]=function(_0x48382c,_0x444fa8){var _0x5bc6ef=_0x14e14c;this[_0x5bc6ef(0xc9)](_0x48382c,_0x444fa8),this['_setNodeExpandableState'](_0x48382c),_0x444fa8[_0x5bc6ef(0x6f)]&&this['_sortProps'](_0x48382c),this[_0x5bc6ef(0xd8)](_0x48382c,_0x444fa8),this[_0x5bc6ef(0xd9)](_0x48382c,_0x444fa8),this[_0x5bc6ef(0xa2)](_0x48382c);},_0x15bdba[_0x14e14c(0x7d)]['_additionalMetadata']=function(_0x5a2ca4,_0x13ba41){var _0x167e9f=_0x14e14c;try{_0x5a2ca4&&typeof _0x5a2ca4[_0x167e9f(0x145)]==_0x167e9f(0x115)&&(_0x13ba41['length']=_0x5a2ca4[_0x167e9f(0x145)]);}catch{}if(_0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x115)||_0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x143)){if(isNaN(_0x13ba41[_0x167e9f(0xcf)]))_0x13ba41[_0x167e9f(0x9e)]=!0x0,delete _0x13ba41['value'];else switch(_0x13ba41[_0x167e9f(0xcf)]){case Number[_0x167e9f(0xda)]:_0x13ba41['positiveInfinity']=!0x0,delete _0x13ba41[_0x167e9f(0xcf)];break;case Number[_0x167e9f(0x6e)]:_0x13ba41[_0x167e9f(0xf5)]=!0x0,delete _0x13ba41['value'];break;case 0x0:this[_0x167e9f(0xbb)](_0x13ba41[_0x167e9f(0xcf)])&&(_0x13ba41['negativeZero']=!0x0);break;}}else _0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x117)&&typeof _0x5a2ca4[_0x167e9f(0x86)]==_0x167e9f(0xe9)&&_0x5a2ca4[_0x167e9f(0x86)]&&_0x13ba41['name']&&_0x5a2ca4[_0x167e9f(0x86)]!==_0x13ba41['name']&&(_0x13ba41['funcName']=_0x5a2ca4[_0x167e9f(0x86)]);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xbb)]=function(_0x1e877b){return 0x1/_0x1e877b===Number['NEGATIVE_INFINITY'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xf6)]=function(_0x4fd3a6){var _0x4f85fe=_0x14e14c;!_0x4fd3a6['props']||!_0x4fd3a6[_0x4f85fe(0x162)]['length']||_0x4fd3a6[_0x4f85fe(0x118)]==='array'||_0x4fd3a6[_0x4f85fe(0x118)]===_0x4f85fe(0xab)||_0x4fd3a6[_0x4f85fe(0x118)]===_0x4f85fe(0xa4)||_0x4fd3a6[_0x4f85fe(0x162)][_0x4f85fe(0xa5)](function(_0x5c1ef5,_0x4a7ec6){var _0x221367=_0x4f85fe,_0x2ebddf=_0x5c1ef5[_0x221367(0x86)][_0x221367(0x138)](),_0x5797ad=_0x4a7ec6[_0x221367(0x86)][_0x221367(0x138)]();return _0x2ebddf<_0x5797ad?-0x1:_0x2ebddf>_0x5797ad?0x1:0x0;});},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xd8)]=function(_0x53f4c6,_0x4f8fda){var _0x4549a2=_0x14e14c;if(!(_0x4f8fda['noFunctions']||!_0x53f4c6[_0x4549a2(0x162)]||!_0x53f4c6[_0x4549a2(0x162)][_0x4549a2(0x145)])){for(var _0x32873c=[],_0xb2b825=[],_0x527dd6=0x0,_0x3292f1=_0x53f4c6['props']['length'];_0x527dd6<_0x3292f1;_0x527dd6++){var _0x32c24e=_0x53f4c6[_0x4549a2(0x162)][_0x527dd6];_0x32c24e[_0x4549a2(0x118)]===_0x4549a2(0x117)?_0x32873c[_0x4549a2(0x93)](_0x32c24e):_0xb2b825[_0x4549a2(0x93)](_0x32c24e);}if(!(!_0xb2b825['length']||_0x32873c['length']<=0x1)){_0x53f4c6[_0x4549a2(0x162)]=_0xb2b825;var _0x4a1421={'functionsNode':!0x0,'props':_0x32873c};this[_0x4549a2(0xec)](_0x4a1421,_0x4f8fda),this['_setNodeLabel'](_0x4a1421,_0x4f8fda),this[_0x4549a2(0x71)](_0x4a1421),this[_0x4549a2(0xc7)](_0x4a1421,_0x4f8fda),_0x4a1421['id']+='\\x20f',_0x53f4c6[_0x4549a2(0x162)][_0x4549a2(0x105)](_0x4a1421);}}},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xd9)]=function(_0xbd163b,_0x34b9f2){},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x71)]=function(_0x2dba9d){},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x11f)]=function(_0x139d1f){var _0x1ff41f=_0x14e14c;return Array[_0x1ff41f(0x99)](_0x139d1f)||typeof _0x139d1f==_0x1ff41f(0x15d)&&this[_0x1ff41f(0x8b)](_0x139d1f)===_0x1ff41f(0x10a);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xc7)]=function(_0x5de8d2,_0x564e51){},_0x15bdba['prototype'][_0x14e14c(0xa2)]=function(_0x419879){var _0x11162c=_0x14e14c;delete _0x419879['_hasSymbolPropertyOnItsPath'],delete _0x419879[_0x11162c(0x109)],delete _0x419879['_hasMapOnItsPath'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x130)]=function(_0x59d1c0,_0x3aa4e2){};let _0x49843c=new _0x15bdba(),_0x44933a={'props':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0x162)]||0x64,'elements':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0x11b)]||0x64,'strLength':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0xce)]||0x400*0x32,'totalStrLength':_0x157890['defaultLimits'][_0x14e14c(0x14e)]||0x400*0x32,'autoExpandLimit':_0x157890['defaultLimits']['autoExpandLimit']||0x1388,'autoExpandMaxDepth':_0x157890[_0x14e14c(0xb6)]['autoExpandMaxDepth']||0xa},_0x2434a4={'props':_0x157890['reducedLimits'][_0x14e14c(0x162)]||0x5,'elements':_0x157890[_0x14e14c(0x12a)][_0x14e14c(0x11b)]||0x5,'strLength':_0x157890[_0x14e14c(0x12a)]['strLength']||0x100,'totalStrLength':_0x157890[_0x14e14c(0x12a)][_0x14e14c(0x14e)]||0x100*0x3,'autoExpandLimit':_0x157890['reducedLimits'][_0x14e14c(0x16c)]||0x1e,'autoExpandMaxDepth':_0x157890[_0x14e14c(0x12a)]['autoExpandMaxDepth']||0x2};if(_0x2730b9){let _0x3e1b5e=_0x49843c[_0x14e14c(0x167)][_0x14e14c(0x8c)](_0x49843c);_0x49843c[_0x14e14c(0x167)]=function(_0x1652e0,_0x3cfbbf,_0x2dcdac,_0x11b90d){return _0x3e1b5e(_0x1652e0,_0x2730b9(_0x3cfbbf),_0x2dcdac,_0x11b90d);};}function _0x21f848(_0x17007d,_0x35a97d,_0x22fa88,_0x39b20f,_0x46b19e,_0x71e2b7){var _0x472084=_0x14e14c;let _0x2f7e13,_0x28c36b;try{_0x28c36b=_0x59ca1d(),_0x2f7e13=_0x2e2eb5[_0x35a97d],!_0x2f7e13||_0x28c36b-_0x2f7e13['ts']>_0x47dd45['perLogpoint'][_0x472084(0x12f)]&&_0x2f7e13[_0x472084(0xb3)]&&_0x2f7e13[_0x472084(0x76)]/_0x2f7e13[_0x472084(0xb3)]<_0x47dd45[_0x472084(0x166)][_0x472084(0xdc)]?(_0x2e2eb5[_0x35a97d]=_0x2f7e13={'count':0x0,'time':0x0,'ts':_0x28c36b},_0x2e2eb5[_0x472084(0x128)]={}):_0x28c36b-_0x2e2eb5['hits']['ts']>_0x47dd45[_0x472084(0x16a)]['resetWhenQuietMs']&&_0x2e2eb5['hits'][_0x472084(0xb3)]&&_0x2e2eb5['hits']['time']/_0x2e2eb5['hits'][_0x472084(0xb3)]<_0x47dd45['global']['resetOnProcessingTimeAverageMs']&&(_0x2e2eb5['hits']={});let _0x1e7025=[],_0x358350=_0x2f7e13['reduceLimits']||_0x2e2eb5[_0x472084(0x128)][_0x472084(0x12c)]?_0x2434a4:_0x44933a,_0x1e1be5=_0x369196=>{var _0x238243=_0x472084;let _0x1f647e={};return _0x1f647e[_0x238243(0x162)]=_0x369196[_0x238243(0x162)],_0x1f647e[_0x238243(0x11b)]=_0x369196['elements'],_0x1f647e['strLength']=_0x369196[_0x238243(0xce)],_0x1f647e['totalStrLength']=_0x369196[_0x238243(0x14e)],_0x1f647e[_0x238243(0x16c)]=_0x369196[_0x238243(0x16c)],_0x1f647e['autoExpandMaxDepth']=_0x369196['autoExpandMaxDepth'],_0x1f647e[_0x238243(0x6f)]=!0x1,_0x1f647e[_0x238243(0x171)]=!_0x105dac,_0x1f647e[_0x238243(0x98)]=0x1,_0x1f647e[_0x238243(0x80)]=0x0,_0x1f647e[_0x238243(0xb4)]='root_exp_id',_0x1f647e['rootExpression']=_0x238243(0x11c),_0x1f647e[_0x238243(0x82)]=!0x0,_0x1f647e[_0x238243(0x112)]=[],_0x1f647e[_0x238243(0xcc)]=0x0,_0x1f647e['resolveGetters']=_0x157890[_0x238243(0xaa)],_0x1f647e[_0x238243(0xbe)]=0x0,_0x1f647e[_0x238243(0xbc)]={'current':void 0x0,'parent':void 0x0,'index':0x0},_0x1f647e;};for(var _0x46d82b=0x0;_0x46d82b<_0x46b19e[_0x472084(0x145)];_0x46d82b++)_0x1e7025['push'](_0x49843c[_0x472084(0x167)]({'timeNode':_0x17007d===_0x472084(0x76)||void 0x0},_0x46b19e[_0x46d82b],_0x1e1be5(_0x358350),{}));if(_0x17007d==='trace'||_0x17007d===_0x472084(0x126)){let _0x61389a=Error[_0x472084(0xfe)];try{Error[_0x472084(0xfe)]=0x1/0x0,_0x1e7025['push'](_0x49843c['serialize']({'stackNode':!0x0},new Error()[_0x472084(0x15f)],_0x1e1be5(_0x358350),{'strLength':0x1/0x0}));}finally{Error[_0x472084(0xfe)]=_0x61389a;}}return{'method':_0x472084(0xa7),'version':_0x13b43c,'args':[{'ts':_0x22fa88,'session':_0x39b20f,'args':_0x1e7025,'id':_0x35a97d,'context':_0x71e2b7}]};}catch(_0x70970b){return{'method':'log','version':_0x13b43c,'args':[{'ts':_0x22fa88,'session':_0x39b20f,'args':[{'type':_0x472084(0x83),'error':_0x70970b&&_0x70970b['message']}],'id':_0x35a97d,'context':_0x71e2b7}]};}finally{try{if(_0x2f7e13&&_0x28c36b){let _0x12cb09=_0x59ca1d();_0x2f7e13[_0x472084(0xb3)]++,_0x2f7e13[_0x472084(0x76)]+=_0x300ed1(_0x28c36b,_0x12cb09),_0x2f7e13['ts']=_0x12cb09,_0x2e2eb5[_0x472084(0x128)]['count']++,_0x2e2eb5['hits'][_0x472084(0x76)]+=_0x300ed1(_0x28c36b,_0x12cb09),_0x2e2eb5[_0x472084(0x128)]['ts']=_0x12cb09,(_0x2f7e13[_0x472084(0xb3)]>_0x47dd45[_0x472084(0x166)][_0x472084(0x137)]||_0x2f7e13[_0x472084(0x76)]>_0x47dd45['perLogpoint']['reduceOnAccumulatedProcessingTimeMs'])&&(_0x2f7e13[_0x472084(0x12c)]=!0x0),(_0x2e2eb5[_0x472084(0x128)][_0x472084(0xb3)]>_0x47dd45[_0x472084(0x16a)][_0x472084(0x137)]||_0x2e2eb5[_0x472084(0x128)][_0x472084(0x76)]>_0x47dd45[_0x472084(0x16a)]['reduceOnAccumulatedProcessingTimeMs'])&&(_0x2e2eb5[_0x472084(0x128)][_0x472084(0x12c)]=!0x0);}}catch{}}}return _0x21f848;}function G(_0x3be696){var _0x46c6d9=_0x2d0e46;if(_0x3be696&&typeof _0x3be696==_0x46c6d9(0x15d)&&_0x3be696[_0x46c6d9(0xf7)])switch(_0x3be696[_0x46c6d9(0xf7)]['name']){case _0x46c6d9(0x147):return _0x3be696['hasOwnProperty'](Symbol[_0x46c6d9(0x127)])?Promise[_0x46c6d9(0xef)]():_0x3be696;case _0x46c6d9(0x100):return Promise['resolve']();}return _0x3be696;}function _0x25c1(){var _0x23e53f=['584FNhvcu','depth','isArray','failed\\x20to\\x20connect\\x20to\\x20host:\\x20','181696WbLlCU','port','Error','nan','unref','emulator','url','_cleanNode','_processTreeNodeResult','Set','sort','1HmYSRt','log','_propertyName','_p_length','resolveGetters','Map','_addObjectProperty','cappedProps',',\\x20see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','background:\\x20rgb(30,30,30);\\x20color:\\x20rgb(255,213,92)','_socket','ExpoDevice','_getOwnPropertySymbols','count','expId','406426XGONyb','defaultLimits','remix','67669xJppUN','endsWith','send','_isNegativeZero','node','194070ShBIXL','allStrLength','call','33763','5FsGXyE','parent','_addProperty','_connecting','capped','setter','_setNodePermissions','15179373iCDJWQ','_setNodeLabel','getWebSocketClass','react-native','autoExpandPropertyCount','default','strLength','value','then','_WebSocket','_quotedRegExp','host','hrtime','date','getOwnPropertyDescriptor','_consoleNinjaAllowedToStart','_addFunctionsNode','_addLoadNode','POSITIVE_INFINITY','env','resetOnProcessingTimeAverageMs','_attemptToReconnectShortly','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20refreshing\\x20the\\x20page\\x20may\\x20help;\\x20also\\x20see\\x20','_WebSocketClass','replace','perf_hooks','_reconnectTimeout','gateway.docker.internal','_allowedToConnectOnSend','index','match','10.0.2.2','getOwnPropertyNames','string','_isPrimitiveType','ninjaSuppressConsole','_setNodeId','warn','forEach','resolve','import(\\x27url\\x27)','fromCharCode','get','Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','now','negativeInfinity','_sortProps','constructor','onmessage','eventReceivedCallback','message','onopen','current','_extendedWarning','stackTraceLimit','expo','bound\\x20Promise','valueOf','_isPrimitiveWrapperType','Symbol','_console_ninja','unshift','HTMLAllCollection','data','bigint','_hasSetOnItsPath','[object\\x20Array]','[object\\x20Map]','_disposeWebsocket','return\\x20import(url.pathToFileURL(path.join(nodeModules,\\x20\\x27ws/index.js\\x27)).toString());','_p_','logger\\x20websocket\\x20error','_capIfString','origin','autoExpandPreviousObjects','_ninjaIgnoreNextError','_type','number','close','function','type','cappedElements','failed\\x20to\\x20find\\x20and\\x20load\\x20WebSocket','elements','root_exp','expressionsToEvaluate','_Symbol','_isArray','timeStamp','_connectToHostNow','includes','_connected','toString','NEXT_RUNTIME','error','iterator','hits','modules','reducedLimits','symbol','reduceLimits','args','\\x20browser','resetWhenQuietMs','_setNodeExpressionPath','next.js','_dateToString','charAt','8013680rSmsWy','_keyStrRegExp','startsWith','reduceOnCount','toLowerCase','_additionalMetadata','array','osName','logger\\x20failed\\x20to\\x20connect\\x20to\\x20host,\\x20see\\x20','%c\\x20Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','_ws','Buffer','_isUndefined','1777834244956','_connectAttemptCount','Number','edge','length',["localhost","127.0.0.1","example.cypress.io","10.0.2.2","henry-tercero-Victus-by-HP-Gaming-Laptop-15-fa2xxx","192.168.1.82"],'Promise','path','_console_ninja_session','_p_name','disabledLog','substr','_blacklistedProperty','totalStrLength','location','reduceOnAccumulatedProcessingTimeMs','String','elapsed','stringify','_getOwnPropertyDescriptor','performance','method','_regExpToString','_inNextEdge','versions','9GpoAse','nodeModules','undefined','object','_isMap','stack','_property','getOwnPropertySymbols','props','angular','process','_allowedToSend','perLogpoint','serialize','onerror','hostname','global','...','autoExpandLimit','slice','_treeNodePropertiesAfterFullValue','console','reload','noFunctions','_maxConnectAttemptCount','test','readyState','WebSocket','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20restarting\\x20the\\x20process\\x20may\\x20help;\\x20also\\x20see\\x20','NEGATIVE_INFINITY','sortProps','reducePolicy','_setNodeExpandableState','parse','indexOf','_undefined','_setNodeQueryPath','time','_treeNodePropertiesBeforeFullValue','coverage','_webSocketErrorDocsLink','see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.',{"resolveGetters":false,"defaultLimits":{"props":100,"elements":100,"strLength":51200,"totalStrLength":51200,"autoExpandLimit":5000,"autoExpandMaxDepth":10},"reducedLimits":{"props":5,"elements":5,"strLength":256,"totalStrLength":768,"autoExpandLimit":30,"autoExpandMaxDepth":2},"reducePolicy":{"perLogpoint":{"reduceOnCount":50,"reduceOnAccumulatedProcessingTimeMs":100,"resetWhenQuietMs":500,"resetOnProcessingTimeAverageMs":100},"global":{"reduceOnCount":1000,"reduceOnAccumulatedProcessingTimeMs":300,"resetWhenQuietMs":50,"resetOnProcessingTimeAverageMs":100}}},'2406444klbbNi','prototype','some','_isSet','level','catch','autoExpand','unknown','null','trace','name','https://tinyurl.com/37x8b79t','_sendErrorMessage','[object\\x20Set]','set','_objectToString','bind','RegExp','_getOwnPropertyNames','127.0.0.1','concat','onclose','_inBrowser','push','toUpperCase','isExpressionToEvaluate','[object\\x20BigInt]'];_0x25c1=function(){return _0x23e53f;};return _0x25c1();}((_0x310788,_0x34a169,_0xda7e90,_0x2b96e0,_0xbdb288,_0xb7253e,_0x95c4a4,_0x17022f,_0x2075e1,_0x4b9be4,_0xfe705b,_0xbd257b)=>{var _0x5c26f9=_0x2d0e46;if(_0x310788[_0x5c26f9(0x104)])return _0x310788[_0x5c26f9(0x104)];let _0x5991f1={'consoleLog':()=>{},'consoleTrace':()=>{},'consoleTime':()=>{},'consoleTimeEnd':()=>{},'autoLog':()=>{},'autoLogMany':()=>{},'autoTraceMany':()=>{},'coverage':()=>{},'autoTrace':()=>{},'autoTime':()=>{},'autoTimeEnd':()=>{}};if(!X(_0x310788,_0x17022f,_0xbdb288))return _0x310788[_0x5c26f9(0x104)]=_0x5991f1,_0x310788['_console_ninja'];let _0x4b5c88=b(_0x310788),_0xb6ade8=_0x4b5c88['elapsed'],_0x47a25b=_0x4b5c88[_0x5c26f9(0x120)],_0x3e6e1e=_0x4b5c88[_0x5c26f9(0xf4)],_0x2c8192={'hits':{},'ts':{}},_0x242dc4=J(_0x310788,_0x2075e1,_0x2c8192,_0xb7253e,_0xbd257b,_0xbdb288===_0x5c26f9(0x131)?G:void 0x0),_0xa6227d=(_0x57a80d,_0x2aff63,_0x2519e5,_0x1505b7,_0x2df6ce,_0x1cd947)=>{var _0x429ab5=_0x5c26f9;let _0x20b358=_0x310788[_0x429ab5(0x104)];try{return _0x310788[_0x429ab5(0x104)]=_0x5991f1,_0x242dc4(_0x57a80d,_0x2aff63,_0x2519e5,_0x1505b7,_0x2df6ce,_0x1cd947);}finally{_0x310788[_0x429ab5(0x104)]=_0x20b358;}},_0x53c51e=_0x5ae6ca=>{_0x2c8192['ts'][_0x5ae6ca]=_0x47a25b();},_0x3a2f9a=(_0x5852d8,_0x300afc)=>{var _0x4e6575=_0x5c26f9;let _0x32dd38=_0x2c8192['ts'][_0x300afc];if(delete _0x2c8192['ts'][_0x300afc],_0x32dd38){let _0x1c1d91=_0xb6ade8(_0x32dd38,_0x47a25b());_0x15ff32(_0xa6227d(_0x4e6575(0x76),_0x5852d8,_0x3e6e1e(),_0x3cc683,[_0x1c1d91],_0x300afc));}},_0x2e42ea=_0x4e959d=>{var _0x22e95d=_0x5c26f9,_0x25cb91;return _0xbdb288===_0x22e95d(0x131)&&_0x310788[_0x22e95d(0x111)]&&((_0x25cb91=_0x4e959d==null?void 0x0:_0x4e959d[_0x22e95d(0x12d)])==null?void 0x0:_0x25cb91[_0x22e95d(0x145)])&&(_0x4e959d[_0x22e95d(0x12d)][0x0][_0x22e95d(0x111)]=_0x310788[_0x22e95d(0x111)]),_0x4e959d;};_0x310788['_console_ninja']={'consoleLog':(_0x57e34e,_0x1291ab)=>{var _0x2ca6cf=_0x5c26f9;_0x310788[_0x2ca6cf(0x16f)]['log'][_0x2ca6cf(0x86)]!==_0x2ca6cf(0x14b)&&_0x15ff32(_0xa6227d(_0x2ca6cf(0xa7),_0x57e34e,_0x3e6e1e(),_0x3cc683,_0x1291ab));},'consoleTrace':(_0x2bceca,_0x2e6407)=>{var _0x16a162=_0x5c26f9,_0x197dfe,_0x147761;_0x310788[_0x16a162(0x16f)][_0x16a162(0xa7)][_0x16a162(0x86)]!=='disabledTrace'&&((_0x147761=(_0x197dfe=_0x310788[_0x16a162(0x164)])==null?void 0x0:_0x197dfe[_0x16a162(0x159)])!=null&&_0x147761[_0x16a162(0xbc)]&&(_0x310788[_0x16a162(0x113)]=!0x0),_0x15ff32(_0x2e42ea(_0xa6227d('trace',_0x2bceca,_0x3e6e1e(),_0x3cc683,_0x2e6407))));},'consoleError':(_0x383b9b,_0x5a7771)=>{var _0x132cf8=_0x5c26f9;_0x310788[_0x132cf8(0x113)]=!0x0,_0x15ff32(_0x2e42ea(_0xa6227d(_0x132cf8(0x126),_0x383b9b,_0x3e6e1e(),_0x3cc683,_0x5a7771)));},'consoleTime':_0x3363f7=>{_0x53c51e(_0x3363f7);},'consoleTimeEnd':(_0x27785a,_0x2648d7)=>{_0x3a2f9a(_0x2648d7,_0x27785a);},'autoLog':(_0x4aebf6,_0x392081)=>{var _0x3a473f=_0x5c26f9;_0x15ff32(_0xa6227d(_0x3a473f(0xa7),_0x392081,_0x3e6e1e(),_0x3cc683,[_0x4aebf6]));},'autoLogMany':(_0x2fc044,_0x372be9)=>{var _0x39bffd=_0x5c26f9;_0x15ff32(_0xa6227d(_0x39bffd(0xa7),_0x2fc044,_0x3e6e1e(),_0x3cc683,_0x372be9));},'autoTrace':(_0x34c5e8,_0x42347d)=>{var _0x5abd64=_0x5c26f9;_0x15ff32(_0x2e42ea(_0xa6227d(_0x5abd64(0x85),_0x42347d,_0x3e6e1e(),_0x3cc683,[_0x34c5e8])));},'autoTraceMany':(_0xa13ed2,_0x156a4e)=>{_0x15ff32(_0x2e42ea(_0xa6227d('trace',_0xa13ed2,_0x3e6e1e(),_0x3cc683,_0x156a4e)));},'autoTime':(_0x40c075,_0x354404,_0x580725)=>{_0x53c51e(_0x580725);},'autoTimeEnd':(_0x169ff4,_0x1a7c4e,_0x3eadb8)=>{_0x3a2f9a(_0x1a7c4e,_0x3eadb8);},'coverage':_0xb8473d=>{var _0x5b2de5=_0x5c26f9;_0x15ff32({'method':_0x5b2de5(0x78),'version':_0xb7253e,'args':[{'id':_0xb8473d}]});}};let _0x15ff32=H(_0x310788,_0x34a169,_0xda7e90,_0x2b96e0,_0xbdb288,_0x4b9be4,_0xfe705b),_0x3cc683=_0x310788[_0x5c26f9(0x149)];return _0x310788[_0x5c26f9(0x104)];})(globalThis,_0x2d0e46(0x8f),_0x2d0e46(0xc0),"/home/henry-tercero/.vscode/extensions/wallabyjs.console-ninja-1.0.526/node_modules",'vite','1.0.0',_0x2d0e46(0x141),_0x2d0e46(0x146),'','','1',_0x2d0e46(0x7b));`);
  } catch (e) {
    console.error(e);
  }
}
function oo_oo$1(i, ...v) {
  try {
    oo_cm$1().consoleLog(i, v);
  } catch (e) {
  }
  return v;
}
function oo_tx(i, ...v) {
  try {
    oo_cm$1().consoleError(i, v);
  } catch (e) {
  }
  return v;
}
const { ipcMain, dialog, app: app$1, BrowserWindow: BrowserWindow$1 } = _electron;
const migrationModules = /* @__PURE__ */ Object.assign({
  "../database/migrations/001_init.sql": __vite_glob_0_0,
  "../database/migrations/002_settings.sql": __vite_glob_0_1,
  "../database/migrations/003_sales_tax_snapshot.sql": __vite_glob_0_2,
  "../database/migrations/004_customers.sql": __vite_glob_0_3,
  "../database/migrations/005_products_extended.sql": __vite_glob_0_4,
  "../database/migrations/006_users.sql": __vite_glob_0_5,
  "../database/migrations/007_settings_extended.sql": __vite_glob_0_6,
  "../database/migrations/008_settings_theme.sql": __vite_glob_0_7,
  "../database/migrations/009_sales_payment.sql": __vite_glob_0_8,
  "../database/migrations/010_sales_void_audit.sql": __vite_glob_0_9,
  "../database/migrations/011_users_avatar.sql": __vite_glob_0_10,
  "../database/migrations/012_cash_sessions.sql": __vite_glob_0_11,
  "../database/migrations/013_purchases.sql": __vite_glob_0_12,
  "../database/migrations/014_receivables.sql": __vite_glob_0_13,
  "../database/migrations/015_quotes.sql": __vite_glob_0_14,
  "../database/migrations/016_sales_discount.sql": __vite_glob_0_15,
  "../database/migrations/017_expenses.sql": __vite_glob_0_16,
  "../database/migrations/018_returns.sql": __vite_glob_0_17,
  "../database/migrations/019_stock_movements.sql": __vite_glob_0_18,
  "../database/migrations/020_backup_settings.sql": __vite_glob_0_19,
  "../database/migrations/021_tax_enabled.sql": __vite_glob_0_20,
  "../database/migrations/022_printer_settings.sql": __vite_glob_0_21,
  "../database/migrations/023_categories.sql": __vite_glob_0_22,
  "../database/migrations/024_default_admin.sql": __vite_glob_0_23,
  "../database/migrations/025_license_tokens.sql": __vite_glob_0_24
});
function loadMigrations() {
  return Object.entries(migrationModules).map(([path2, sql]) => ({
    name: path2.split("/").pop(),
    sql
  }));
}
function bootstrap() {
  const db = getDb();
  const result = runMigrations(db, loadMigrations());
  console.log(...oo_oo(`903585205_97_2_97_80_4`, "[migrator] applied:", result.applied, "skipped:", result.skipped));
  const settingsRepo = createSettingsRepository(db);
  const settings = createSettingsService(settingsRepo);
  settings.init();
  const categoriesRepo = createCategoriesRepository(db);
  const categories = createCategoriesService(categoriesRepo);
  const productsRepo = createProductsRepository(db);
  const products = createProductsService(productsRepo);
  const customersRepo = createCustomersRepository(db);
  const customers = createCustomersService(customersRepo);
  const auditRepo = createAuditRepository(db);
  const audit = createAuditService(auditRepo);
  const salesRepo = createSalesRepository(db);
  const sales = createSalesService(salesRepo, settings, customers, audit);
  const usersRepo = createUsersRepository(db);
  const users = createUsersService(usersRepo);
  const cashRepo = createCashRepository(db);
  const cash = createCashService(cashRepo);
  const purchasesRepo = createPurchasesRepository(db);
  const purchases = createPurchasesService(purchasesRepo);
  const receivablesRepo = createReceivablesRepository(db);
  const receivables = createReceivablesService(receivablesRepo);
  const quotesRepo = createQuotesRepository(db);
  const quotes = createQuotesService(quotesRepo, settings, sales, receivables, products);
  const expensesRepo = createExpensesRepository(db);
  const expenses = createExpensesService(expensesRepo);
  const returnsRepo = createReturnsRepository(db);
  const returns_ = createReturnsService(returnsRepo, salesRepo);
  const inventoryRepo = createInventoryRepository(db);
  const inventory = createInventoryService(inventoryRepo);
  const licenseRepo = createLicenseRepository(db);
  const license = createLicenseService(licenseRepo, settings);
  registerSettingsIpc(settings);
  registerCategoriesIpc(categories);
  registerProductsIpc(products);
  registerCustomersIpc(customers);
  registerSalesIpc(sales);
  registerUsersIpc(users);
  registerAuditIpc(audit);
  registerCashIpc(cash);
  registerPurchasesIpc(purchases);
  registerReceivablesIpc(receivables);
  registerQuotesIpc(quotes);
  registerExpensesIpc(expenses);
  registerReturnsIpc(returns_);
  registerInventoryIpc(inventory);
  registerLicenseIpc(ipcMain, license);
  const dbPath = path$1.join(app$1.getPath("userData"), "taller_pos.sqlite");
  ipcMain.handle("db:get-path", () => ({ ok: true, data: dbPath }));
  ipcMain.handle("db:backup", async () => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: "Guardar respaldo de base de datos",
        defaultPath: `backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sqlite`,
        filters: [{ name: "SQLite", extensions: ["sqlite"] }]
      });
      if (canceled || !filePath) return { ok: true, data: null };
      await db.backup(filePath);
      return { ok: true, data: filePath };
    } catch (err) {
      return { ok: false, error: { code: "BACKUP_ERROR", message: err.message } };
    }
  });
  ipcMain.handle("db:backup-now", async () => {
    try {
      const result2 = await runBackup(db);
      return { ok: true, data: result2 };
    } catch (err) {
      return { ok: false, error: { code: "BACKUP_ERROR", message: err.message } };
    }
  });
  ipcMain.handle("db:list-backups", () => {
    try {
      return { ok: true, data: listBackups() };
    } catch (err) {
      return { ok: false, error: { code: "BACKUP_LIST_ERROR", message: err.message } };
    }
  });
  const intervalHours = Number(settings.get("backup_interval_hours") ?? 720) || 720;
  const maxCopies = Number(settings.get("backup_max_copies") ?? 10) || 10;
  ipcMain.handle("db:restore", async (_e, filePath) => {
    try {
      let srcPath = filePath;
      if (!srcPath) {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          title: "Seleccionar respaldo para restaurar",
          filters: [{ name: "SQLite", extensions: ["sqlite"] }],
          properties: ["openFile"]
        });
        if (canceled || !filePaths.length) return { ok: true, data: null };
        srcPath = filePaths[0];
      }
      const result2 = await restoreFromFile(db, srcPath);
      setTimeout(() => {
        app$1.relaunch();
        app$1.exit(0);
      }, 600);
      return { ok: true, data: result2 };
    } catch (err) {
      return { ok: false, error: { code: "RESTORE_ERROR", message: err.message } };
    }
  });
  ipcMain.handle("db:set-backup-interval", (_e, hours, copies) => {
    try {
      const h = Math.max(1, Number(hours) || intervalHours);
      const c = Math.max(1, Number(copies) || maxCopies);
      updateBackupSchedule(h, c);
      return { ok: true, data: { intervalHours: h, maxCopies: c } };
    } catch (err) {
      return { ok: false, error: { code: "BACKUP_INTERVAL_ERROR", message: err.message } };
    }
  });
  startBackupSchedule(db, intervalHours, maxCopies);
  ipcMain.handle("printer:list", async (event) => {
    try {
      const win2 = BrowserWindow$1.fromWebContents(event.sender);
      const printers = win2 ? await win2.webContents.getPrintersAsync() : [];
      return { ok: true, data: printers.map((p) => ({ name: p.name, isDefault: p.isDefault })) };
    } catch (err) {
      return { ok: false, error: { code: "PRINTER_LIST_ERROR", message: String(err.message) } };
    }
  });
  ipcMain.handle("printer:print", async (_event, html, deviceName, paperSize) => {
    const sizes = {
      "half-letter": { width: 139700, height: 215900 },
      "letter": { width: 215900, height: 279400 },
      "thermal-80": { width: 8e4, height: 297e3 }
    };
    const pageSize = sizes[paperSize] ?? sizes["half-letter"];
    const win2 = new BrowserWindow$1({ show: false, webPreferences: { contextIsolation: true } });
    try {
      await win2.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      return await new Promise((resolve) => {
        win2.webContents.print(
          { silent: true, deviceName: deviceName || void 0, pageSize },
          (success, reason) => {
            win2.close();
            resolve(success ? { ok: true, data: null } : { ok: false, error: { code: "PRINT_FAILED", message: reason } });
          }
        );
      });
    } catch (err) {
      win2.close();
      return { ok: false, error: { code: "PRINT_ERROR", message: String(err.message) } };
    }
  });
}
function oo_cm() {
  try {
    return (0, eval)("globalThis._console_ninja") || (0, eval)(`/* https://github.com/wallabyjs/console-ninja#how-does-it-work */'use strict';var _0x2d0e46=_0x4b0e;(function(_0x1bc005,_0x37700a){var _0x1537b4=_0x4b0e,_0x4a55c7=_0x1bc005();while(!![]){try{var _0x1dba8d=parseInt(_0x1537b4(0xa6))/0x1*(parseInt(_0x1537b4(0xb5))/0x2)+-parseInt(_0x1537b4(0x7c))/0x3+parseInt(_0x1537b4(0x9b))/0x4+parseInt(_0x1537b4(0xc1))/0x5*(parseInt(_0x1537b4(0xbd))/0x6)+-parseInt(_0x1537b4(0xb8))/0x7*(-parseInt(_0x1537b4(0x97))/0x8)+parseInt(_0x1537b4(0x15a))/0x9*(-parseInt(_0x1537b4(0x134))/0xa)+parseInt(_0x1537b4(0xc8))/0xb;if(_0x1dba8d===_0x37700a)break;else _0x4a55c7['push'](_0x4a55c7['shift']());}catch(_0x1af967){_0x4a55c7['push'](_0x4a55c7['shift']());}}}(_0x25c1,0xba4dc));function z(_0x2bd85c,_0x88579a,_0x35646c,_0x1f0708,_0x3f728d,_0x57566a){var _0x2a0f1e=_0x4b0e,_0x1b4f4a,_0x59097a,_0x4701a0,_0x344fd0;this[_0x2a0f1e(0x16a)]=_0x2bd85c,this[_0x2a0f1e(0xd3)]=_0x88579a,this[_0x2a0f1e(0x9c)]=_0x35646c,this[_0x2a0f1e(0x15b)]=_0x1f0708,this['dockerizedApp']=_0x3f728d,this['eventReceivedCallback']=_0x57566a,this[_0x2a0f1e(0x165)]=!0x0,this[_0x2a0f1e(0xe4)]=!0x0,this[_0x2a0f1e(0x123)]=!0x1,this['_connecting']=!0x1,this[_0x2a0f1e(0x158)]=((_0x59097a=(_0x1b4f4a=_0x2bd85c[_0x2a0f1e(0x164)])==null?void 0x0:_0x1b4f4a[_0x2a0f1e(0xdb)])==null?void 0x0:_0x59097a['NEXT_RUNTIME'])==='edge',this[_0x2a0f1e(0x92)]=!((_0x344fd0=(_0x4701a0=this[_0x2a0f1e(0x16a)][_0x2a0f1e(0x164)])==null?void 0x0:_0x4701a0[_0x2a0f1e(0x159)])!=null&&_0x344fd0[_0x2a0f1e(0xbc)])&&!this[_0x2a0f1e(0x158)],this[_0x2a0f1e(0xdf)]=null,this[_0x2a0f1e(0x142)]=0x0,this[_0x2a0f1e(0x172)]=0x14,this[_0x2a0f1e(0x79)]=_0x2a0f1e(0x87),this[_0x2a0f1e(0x88)]=(this[_0x2a0f1e(0x92)]?_0x2a0f1e(0xde):_0x2a0f1e(0x6d))+this[_0x2a0f1e(0x79)];}z[_0x2d0e46(0x7d)][_0x2d0e46(0xca)]=async function(){var _0x1f8fb9=_0x2d0e46,_0x10ece6,_0x5d2621;if(this[_0x1f8fb9(0xdf)])return this[_0x1f8fb9(0xdf)];let _0x26dfcf;if(this['_inBrowser']||this[_0x1f8fb9(0x158)])_0x26dfcf=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x6c)];else{if((_0x10ece6=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x164)])!=null&&_0x10ece6['_WebSocket'])_0x26dfcf=(_0x5d2621=this[_0x1f8fb9(0x16a)][_0x1f8fb9(0x164)])==null?void 0x0:_0x5d2621[_0x1f8fb9(0xd1)];else try{_0x26dfcf=(await new Function(_0x1f8fb9(0x148),_0x1f8fb9(0xa1),_0x1f8fb9(0x15b),_0x1f8fb9(0x10d))(await(0x0,eval)('import(\\x27path\\x27)'),await(0x0,eval)(_0x1f8fb9(0xf0)),this['nodeModules']))[_0x1f8fb9(0xcd)];}catch{try{_0x26dfcf=require(require('path')['join'](this[_0x1f8fb9(0x15b)],'ws'));}catch{throw new Error(_0x1f8fb9(0x11a));}}}return this[_0x1f8fb9(0xdf)]=_0x26dfcf,_0x26dfcf;},z[_0x2d0e46(0x7d)]['_connectToHostNow']=function(){var _0x2f48e1=_0x2d0e46;this['_connecting']||this[_0x2f48e1(0x123)]||this[_0x2f48e1(0x142)]>=this[_0x2f48e1(0x172)]||(this[_0x2f48e1(0xe4)]=!0x1,this['_connecting']=!0x0,this[_0x2f48e1(0x142)]++,this['_ws']=new Promise((_0x4a35dc,_0xe6df9)=>{var _0x1c5146=_0x2f48e1;this[_0x1c5146(0xca)]()['then'](_0x9dce07=>{var _0x3c071d=_0x1c5146;let _0x2f3948=new _0x9dce07('ws://'+(!this[_0x3c071d(0x92)]&&this['dockerizedApp']?_0x3c071d(0xe3):this[_0x3c071d(0xd3)])+':'+this[_0x3c071d(0x9c)]);_0x2f3948[_0x3c071d(0x168)]=()=>{var _0xece6f3=_0x3c071d;this[_0xece6f3(0x165)]=!0x1,this['_disposeWebsocket'](_0x2f3948),this['_attemptToReconnectShortly'](),_0xe6df9(new Error(_0xece6f3(0x10f)));},_0x2f3948['onopen']=()=>{var _0x55dbf3=_0x3c071d;this[_0x55dbf3(0x92)]||_0x2f3948[_0x55dbf3(0xb0)]&&_0x2f3948[_0x55dbf3(0xb0)][_0x55dbf3(0x9f)]&&_0x2f3948[_0x55dbf3(0xb0)][_0x55dbf3(0x9f)](),_0x4a35dc(_0x2f3948);},_0x2f3948[_0x3c071d(0x91)]=()=>{var _0x2d6ec2=_0x3c071d;this[_0x2d6ec2(0xe4)]=!0x0,this[_0x2d6ec2(0x10c)](_0x2f3948),this[_0x2d6ec2(0xdd)]();},_0x2f3948[_0x3c071d(0xf8)]=_0x1b6031=>{var _0x2ba741=_0x3c071d;try{if(!(_0x1b6031!=null&&_0x1b6031[_0x2ba741(0x107)])||!this[_0x2ba741(0xf9)])return;let _0x308ca5=JSON[_0x2ba741(0x72)](_0x1b6031[_0x2ba741(0x107)]);this['eventReceivedCallback'](_0x308ca5[_0x2ba741(0x156)],_0x308ca5[_0x2ba741(0x12d)],this[_0x2ba741(0x16a)],this[_0x2ba741(0x92)]);}catch{}};})[_0x1c5146(0xd0)](_0x48630d=>(this['_connected']=!0x0,this[_0x1c5146(0xc4)]=!0x1,this[_0x1c5146(0xe4)]=!0x1,this[_0x1c5146(0x165)]=!0x0,this[_0x1c5146(0x142)]=0x0,_0x48630d))['catch'](_0xc39b38=>(this[_0x1c5146(0x123)]=!0x1,this['_connecting']=!0x1,console[_0x1c5146(0xed)](_0x1c5146(0x13c)+this[_0x1c5146(0x79)]),_0xe6df9(new Error(_0x1c5146(0x9a)+(_0xc39b38&&_0xc39b38['message'])))));}));},z[_0x2d0e46(0x7d)][_0x2d0e46(0x10c)]=function(_0x29d14e){var _0x33c4e9=_0x2d0e46;this[_0x33c4e9(0x123)]=!0x1,this['_connecting']=!0x1;try{_0x29d14e['onclose']=null,_0x29d14e[_0x33c4e9(0x168)]=null,_0x29d14e[_0x33c4e9(0xfb)]=null;}catch{}try{_0x29d14e[_0x33c4e9(0x6b)]<0x2&&_0x29d14e[_0x33c4e9(0x116)]();}catch{}},z[_0x2d0e46(0x7d)][_0x2d0e46(0xdd)]=function(){var _0x5be81e=_0x2d0e46;clearTimeout(this[_0x5be81e(0xe2)]),!(this['_connectAttemptCount']>=this[_0x5be81e(0x172)])&&(this[_0x5be81e(0xe2)]=setTimeout(()=>{var _0x50cbfc=_0x5be81e,_0x1f55db;this[_0x50cbfc(0x123)]||this[_0x50cbfc(0xc4)]||(this['_connectToHostNow'](),(_0x1f55db=this[_0x50cbfc(0x13e)])==null||_0x1f55db[_0x50cbfc(0x81)](()=>this[_0x50cbfc(0xdd)]()));},0x1f4),this[_0x5be81e(0xe2)][_0x5be81e(0x9f)]&&this['_reconnectTimeout'][_0x5be81e(0x9f)]());},z[_0x2d0e46(0x7d)][_0x2d0e46(0xba)]=async function(_0x4a0e26){var _0x45e944=_0x2d0e46;try{if(!this['_allowedToSend'])return;this['_allowedToConnectOnSend']&&this[_0x45e944(0x121)](),(await this[_0x45e944(0x13e)])['send'](JSON[_0x45e944(0x153)](_0x4a0e26));}catch(_0x2e3659){this[_0x45e944(0xfd)]?console[_0x45e944(0xed)](this['_sendErrorMessage']+':\\x20'+(_0x2e3659&&_0x2e3659[_0x45e944(0xfa)])):(this[_0x45e944(0xfd)]=!0x0,console['warn'](this[_0x45e944(0x88)]+':\\x20'+(_0x2e3659&&_0x2e3659['message']),_0x4a0e26)),this[_0x45e944(0x165)]=!0x1,this['_attemptToReconnectShortly']();}};function _0x4b0e(_0x41dc45,_0x235b31){var _0x25c175=_0x25c1();return _0x4b0e=function(_0x4b0eb2,_0xfd26fd){_0x4b0eb2=_0x4b0eb2-0x6a;var _0x42deda=_0x25c175[_0x4b0eb2];return _0x42deda;},_0x4b0e(_0x41dc45,_0x235b31);}function H(_0x7ea0ec,_0x4921a6,_0x3f5bd1,_0x19d3fd,_0x216249,_0x5e894c,_0x1d2dde,_0x4be330=ne){let _0x103568=_0x3f5bd1['split'](',')['map'](_0x191033=>{var _0x100bd0=_0x4b0e,_0x55fcb0,_0x593419,_0x5a5ab6,_0x3a8b26,_0x2e3b7a,_0x185990,_0x5972d2,_0x12c809;try{if(!_0x7ea0ec[_0x100bd0(0x149)]){let _0x1d043d=((_0x593419=(_0x55fcb0=_0x7ea0ec['process'])==null?void 0x0:_0x55fcb0['versions'])==null?void 0x0:_0x593419['node'])||((_0x3a8b26=(_0x5a5ab6=_0x7ea0ec[_0x100bd0(0x164)])==null?void 0x0:_0x5a5ab6[_0x100bd0(0xdb)])==null?void 0x0:_0x3a8b26[_0x100bd0(0x125)])===_0x100bd0(0x144);(_0x216249===_0x100bd0(0x131)||_0x216249===_0x100bd0(0xb7)||_0x216249==='astro'||_0x216249===_0x100bd0(0x163))&&(_0x216249+=_0x1d043d?'\\x20server':_0x100bd0(0x12e));let _0x4b495a='';_0x216249===_0x100bd0(0xcb)&&(_0x4b495a=(((_0x5972d2=(_0x185990=(_0x2e3b7a=_0x7ea0ec[_0x100bd0(0xff)])==null?void 0x0:_0x2e3b7a[_0x100bd0(0x129)])==null?void 0x0:_0x185990[_0x100bd0(0xb1)])==null?void 0x0:_0x5972d2[_0x100bd0(0x13b)])||_0x100bd0(0xa0))['toLowerCase'](),_0x4b495a&&(_0x216249+='\\x20'+_0x4b495a,(_0x4b495a==='android'||_0x4b495a===_0x100bd0(0xa0)&&((_0x12c809=_0x7ea0ec[_0x100bd0(0x14f)])==null?void 0x0:_0x12c809['hostname'])===_0x100bd0(0xe7))&&(_0x4921a6='10.0.2.2'))),_0x7ea0ec[_0x100bd0(0x149)]={'id':+new Date(),'tool':_0x216249},_0x1d2dde&&_0x216249&&!_0x1d043d&&(_0x4b495a?console[_0x100bd0(0xa7)](_0x100bd0(0xf3)+_0x4b495a+_0x100bd0(0xae)):console[_0x100bd0(0xa7)](_0x100bd0(0x13d)+(_0x216249[_0x100bd0(0x133)](0x0)[_0x100bd0(0x94)]()+_0x216249[_0x100bd0(0x14c)](0x1))+',',_0x100bd0(0xaf),_0x100bd0(0x7a)));}let _0x17304f=new z(_0x7ea0ec,_0x4921a6,_0x191033,_0x19d3fd,_0x5e894c,_0x4be330);return _0x17304f[_0x100bd0(0xba)][_0x100bd0(0x8c)](_0x17304f);}catch(_0x2f9dc7){return console[_0x100bd0(0xed)]('logger\\x20failed\\x20to\\x20connect\\x20to\\x20host',_0x2f9dc7&&_0x2f9dc7[_0x100bd0(0xfa)]),()=>{};}});return _0xebfc33=>_0x103568['forEach'](_0x19b197=>_0x19b197(_0xebfc33));}function ne(_0x4d7a6c,_0x479e7f,_0x3d7251,_0xcdfacc){var _0x169eda=_0x2d0e46;_0xcdfacc&&_0x4d7a6c===_0x169eda(0x170)&&_0x3d7251[_0x169eda(0x14f)]['reload']();}function b(_0x3be121){var _0x5aa7a2=_0x2d0e46,_0x548526,_0x4a0083;let _0x2e9a75=function(_0x12198a,_0x1e0277){return _0x1e0277-_0x12198a;},_0x3f2a2b;if(_0x3be121[_0x5aa7a2(0x155)])_0x3f2a2b=function(){var _0x13c149=_0x5aa7a2;return _0x3be121[_0x13c149(0x155)][_0x13c149(0xf4)]();};else{if(_0x3be121[_0x5aa7a2(0x164)]&&_0x3be121[_0x5aa7a2(0x164)][_0x5aa7a2(0xd4)]&&((_0x4a0083=(_0x548526=_0x3be121[_0x5aa7a2(0x164)])==null?void 0x0:_0x548526[_0x5aa7a2(0xdb)])==null?void 0x0:_0x4a0083['NEXT_RUNTIME'])!==_0x5aa7a2(0x144))_0x3f2a2b=function(){var _0x369aaa=_0x5aa7a2;return _0x3be121[_0x369aaa(0x164)]['hrtime']();},_0x2e9a75=function(_0x124174,_0x99d144){return 0x3e8*(_0x99d144[0x0]-_0x124174[0x0])+(_0x99d144[0x1]-_0x124174[0x1])/0xf4240;};else try{let {performance:_0x46068d}=require(_0x5aa7a2(0xe1));_0x3f2a2b=function(){return _0x46068d['now']();};}catch{_0x3f2a2b=function(){return+new Date();};}}return{'elapsed':_0x2e9a75,'timeStamp':_0x3f2a2b,'now':()=>Date['now']()};}function X(_0x1e6ddd,_0x1845f6,_0x3c0136){var _0x5e346d=_0x2d0e46,_0x4b4642,_0x5e1a18,_0x4ddb85,_0x32d392,_0x4e67c7,_0x3aa955,_0x536613;if(_0x1e6ddd['_consoleNinjaAllowedToStart']!==void 0x0)return _0x1e6ddd[_0x5e346d(0xd7)];let _0x37a618=((_0x5e1a18=(_0x4b4642=_0x1e6ddd['process'])==null?void 0x0:_0x4b4642['versions'])==null?void 0x0:_0x5e1a18[_0x5e346d(0xbc)])||((_0x32d392=(_0x4ddb85=_0x1e6ddd['process'])==null?void 0x0:_0x4ddb85[_0x5e346d(0xdb)])==null?void 0x0:_0x32d392[_0x5e346d(0x125)])==='edge',_0x4202fe=!!(_0x3c0136==='react-native'&&((_0x4e67c7=_0x1e6ddd[_0x5e346d(0xff)])==null?void 0x0:_0x4e67c7[_0x5e346d(0x129)]));function _0x5de6f7(_0x1315d8){var _0x9e0ebc=_0x5e346d;if(_0x1315d8[_0x9e0ebc(0x136)]('/')&&_0x1315d8[_0x9e0ebc(0xb9)]('/')){let _0x157f37=new RegExp(_0x1315d8[_0x9e0ebc(0x16d)](0x1,-0x1));return _0x45dc85=>_0x157f37[_0x9e0ebc(0x6a)](_0x45dc85);}else{if(_0x1315d8[_0x9e0ebc(0x122)]('*')||_0x1315d8[_0x9e0ebc(0x122)]('?')){let _0xf439ac=new RegExp('^'+_0x1315d8[_0x9e0ebc(0xe0)](/\\./g,String[_0x9e0ebc(0xf1)](0x5c)+'.')[_0x9e0ebc(0xe0)](/\\*/g,'.*')[_0x9e0ebc(0xe0)](/\\?/g,'.')+String[_0x9e0ebc(0xf1)](0x24));return _0x13fe6e=>_0xf439ac['test'](_0x13fe6e);}else return _0x55850d=>_0x55850d===_0x1315d8;}}let _0x4545e6=_0x1845f6['map'](_0x5de6f7);return _0x1e6ddd[_0x5e346d(0xd7)]=_0x37a618||!_0x1845f6,!_0x1e6ddd[_0x5e346d(0xd7)]&&((_0x3aa955=_0x1e6ddd[_0x5e346d(0x14f)])==null?void 0x0:_0x3aa955[_0x5e346d(0x169)])&&(_0x1e6ddd[_0x5e346d(0xd7)]=_0x4545e6[_0x5e346d(0x7e)](_0x272d0c=>_0x272d0c(_0x1e6ddd[_0x5e346d(0x14f)]['hostname']))),_0x4202fe&&!_0x1e6ddd[_0x5e346d(0xd7)]&&!((_0x536613=_0x1e6ddd[_0x5e346d(0x14f)])!=null&&_0x536613[_0x5e346d(0x169)])&&(_0x1e6ddd[_0x5e346d(0xd7)]=!0x0),_0x1e6ddd[_0x5e346d(0xd7)];}function J(_0x2f0e57,_0x105dac,_0x2e2eb5,_0x13b43c,_0x157890,_0x2730b9){var _0x14e14c=_0x2d0e46;_0x2f0e57=_0x2f0e57,_0x105dac=_0x105dac,_0x2e2eb5=_0x2e2eb5,_0x13b43c=_0x13b43c,_0x157890=_0x157890,_0x157890=_0x157890||{},_0x157890[_0x14e14c(0xb6)]=_0x157890[_0x14e14c(0xb6)]||{},_0x157890['reducedLimits']=_0x157890[_0x14e14c(0x12a)]||{},_0x157890[_0x14e14c(0x70)]=_0x157890[_0x14e14c(0x70)]||{},_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)]=_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)]||{},_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)]=_0x157890['reducePolicy'][_0x14e14c(0x16a)]||{};let _0x47dd45={'perLogpoint':{'reduceOnCount':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)][_0x14e14c(0x137)]||0x32,'reduceOnAccumulatedProcessingTimeMs':_0x157890['reducePolicy'][_0x14e14c(0x166)][_0x14e14c(0x150)]||0x64,'resetWhenQuietMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x166)][_0x14e14c(0x12f)]||0x1f4,'resetOnProcessingTimeAverageMs':_0x157890[_0x14e14c(0x70)]['perLogpoint'][_0x14e14c(0xdc)]||0x64},'global':{'reduceOnCount':_0x157890['reducePolicy'][_0x14e14c(0x16a)][_0x14e14c(0x137)]||0x3e8,'reduceOnAccumulatedProcessingTimeMs':_0x157890[_0x14e14c(0x70)]['global'][_0x14e14c(0x150)]||0x12c,'resetWhenQuietMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)][_0x14e14c(0x12f)]||0x32,'resetOnProcessingTimeAverageMs':_0x157890[_0x14e14c(0x70)][_0x14e14c(0x16a)]['resetOnProcessingTimeAverageMs']||0x64}},_0x44a28a=b(_0x2f0e57),_0x300ed1=_0x44a28a[_0x14e14c(0x152)],_0x59ca1d=_0x44a28a['timeStamp'];function _0x15bdba(){var _0x42e207=_0x14e14c;this[_0x42e207(0x135)]=/^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[_$a-zA-Z\\xA0-\\uFFFF][_$a-zA-Z0-9\\xA0-\\uFFFF]*$/,this['_numberRegExp']=/^(0|[1-9][0-9]*)$/,this[_0x42e207(0xd2)]=/'([^\\\\']|\\\\')*'/,this[_0x42e207(0x74)]=_0x2f0e57[_0x42e207(0x15c)],this['_HTMLAllCollection']=_0x2f0e57['HTMLAllCollection'],this['_getOwnPropertyDescriptor']=Object[_0x42e207(0xd6)],this[_0x42e207(0x8e)]=Object[_0x42e207(0xe8)],this['_Symbol']=_0x2f0e57[_0x42e207(0x103)],this[_0x42e207(0x157)]=RegExp[_0x42e207(0x7d)][_0x42e207(0x124)],this[_0x42e207(0x132)]=Date[_0x42e207(0x7d)]['toString'];}_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x167)]=function(_0x2d443b,_0x25df9b,_0x1ecc25,_0x321518){var _0x30d4d6=_0x14e14c,_0x456308=this,_0x1fed79=_0x1ecc25['autoExpand'];function _0x4ccc18(_0x4ca336,_0x51b2d3,_0x1c3f72){var _0xc4f40e=_0x4b0e;_0x51b2d3[_0xc4f40e(0x118)]='unknown',_0x51b2d3['error']=_0x4ca336[_0xc4f40e(0xfa)],_0xa59190=_0x1c3f72[_0xc4f40e(0xbc)][_0xc4f40e(0xfc)],_0x1c3f72[_0xc4f40e(0xbc)][_0xc4f40e(0xfc)]=_0x51b2d3,_0x456308[_0xc4f40e(0x77)](_0x51b2d3,_0x1c3f72);}let _0x4e2b2b,_0x1b1162,_0x2d06d5=_0x2f0e57[_0x30d4d6(0xeb)];_0x2f0e57[_0x30d4d6(0xeb)]=!0x0,_0x2f0e57[_0x30d4d6(0x16f)]&&(_0x4e2b2b=_0x2f0e57[_0x30d4d6(0x16f)]['error'],_0x1b1162=_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)],_0x4e2b2b&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0x126)]=function(){}),_0x1b1162&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)]=function(){}));try{try{_0x1ecc25['level']++,_0x1ecc25[_0x30d4d6(0x82)]&&_0x1ecc25['autoExpandPreviousObjects'][_0x30d4d6(0x93)](_0x25df9b);var _0x343ffc,_0x15df46,_0x560771,_0x5b85a5,_0x4cff0b=[],_0x245b72=[],_0xde939b,_0x59a348=this[_0x30d4d6(0x114)](_0x25df9b),_0x367a40=_0x59a348===_0x30d4d6(0x13a),_0x2149ae=!0x1,_0x494b62=_0x59a348===_0x30d4d6(0x117),_0x3109b2=this[_0x30d4d6(0xea)](_0x59a348),_0xa55274=this[_0x30d4d6(0x102)](_0x59a348),_0x18447e=_0x3109b2||_0xa55274,_0x494779={},_0x373035=0x0,_0x2b7529=!0x1,_0xa59190,_0x11eb64=/^(([1-9]{1}[0-9]*)|0)$/;if(_0x1ecc25[_0x30d4d6(0x98)]){if(_0x367a40){if(_0x15df46=_0x25df9b['length'],_0x15df46>_0x1ecc25['elements']){for(_0x560771=0x0,_0x5b85a5=_0x1ecc25[_0x30d4d6(0x11b)],_0x343ffc=_0x560771;_0x343ffc<_0x5b85a5;_0x343ffc++)_0x245b72['push'](_0x456308[_0x30d4d6(0xc3)](_0x4cff0b,_0x25df9b,_0x59a348,_0x343ffc,_0x1ecc25));_0x2d443b[_0x30d4d6(0x119)]=!0x0;}else{for(_0x560771=0x0,_0x5b85a5=_0x15df46,_0x343ffc=_0x560771;_0x343ffc<_0x5b85a5;_0x343ffc++)_0x245b72['push'](_0x456308['_addProperty'](_0x4cff0b,_0x25df9b,_0x59a348,_0x343ffc,_0x1ecc25));}_0x1ecc25['autoExpandPropertyCount']+=_0x245b72[_0x30d4d6(0x145)];}if(!(_0x59a348==='null'||_0x59a348===_0x30d4d6(0x15c))&&!_0x3109b2&&_0x59a348!==_0x30d4d6(0x151)&&_0x59a348!==_0x30d4d6(0x13f)&&_0x59a348!==_0x30d4d6(0x108)){var _0x4524d5=_0x321518[_0x30d4d6(0x162)]||_0x1ecc25[_0x30d4d6(0x162)];if(this[_0x30d4d6(0x7f)](_0x25df9b)?(_0x343ffc=0x0,_0x25df9b[_0x30d4d6(0xee)](function(_0x3bc31f){var _0x2c0772=_0x30d4d6;if(_0x373035++,_0x1ecc25[_0x2c0772(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;return;}if(!_0x1ecc25[_0x2c0772(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x2c0772(0xcc)]>_0x1ecc25[_0x2c0772(0x16c)]){_0x2b7529=!0x0;return;}_0x245b72[_0x2c0772(0x93)](_0x456308[_0x2c0772(0xc3)](_0x4cff0b,_0x25df9b,'Set',_0x343ffc++,_0x1ecc25,function(_0x377ded){return function(){return _0x377ded;};}(_0x3bc31f)));})):this[_0x30d4d6(0x15e)](_0x25df9b)&&_0x25df9b['forEach'](function(_0x393122,_0x2eeb8a){var _0x4b9651=_0x30d4d6;if(_0x373035++,_0x1ecc25['autoExpandPropertyCount']++,_0x373035>_0x4524d5){_0x2b7529=!0x0;return;}if(!_0x1ecc25['isExpressionToEvaluate']&&_0x1ecc25[_0x4b9651(0x82)]&&_0x1ecc25[_0x4b9651(0xcc)]>_0x1ecc25[_0x4b9651(0x16c)]){_0x2b7529=!0x0;return;}var _0x4ce1af=_0x2eeb8a['toString']();_0x4ce1af[_0x4b9651(0x145)]>0x64&&(_0x4ce1af=_0x4ce1af[_0x4b9651(0x16d)](0x0,0x64)+_0x4b9651(0x16b)),_0x245b72['push'](_0x456308['_addProperty'](_0x4cff0b,_0x25df9b,_0x4b9651(0xab),_0x4ce1af,_0x1ecc25,function(_0x2ade18){return function(){return _0x2ade18;};}(_0x393122)));}),!_0x2149ae){try{for(_0xde939b in _0x25df9b)if(!(_0x367a40&&_0x11eb64[_0x30d4d6(0x6a)](_0xde939b))&&!this[_0x30d4d6(0x14d)](_0x25df9b,_0xde939b,_0x1ecc25)){if(_0x373035++,_0x1ecc25[_0x30d4d6(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;break;}if(!_0x1ecc25[_0x30d4d6(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x30d4d6(0xcc)]>_0x1ecc25[_0x30d4d6(0x16c)]){_0x2b7529=!0x0;break;}_0x245b72[_0x30d4d6(0x93)](_0x456308['_addObjectProperty'](_0x4cff0b,_0x494779,_0x25df9b,_0x59a348,_0xde939b,_0x1ecc25));}}catch{}if(_0x494779[_0x30d4d6(0xa9)]=!0x0,_0x494b62&&(_0x494779[_0x30d4d6(0x14a)]=!0x0),!_0x2b7529){var _0x2e47fb=[][_0x30d4d6(0x90)](this['_getOwnPropertyNames'](_0x25df9b))['concat'](this[_0x30d4d6(0xb2)](_0x25df9b));for(_0x343ffc=0x0,_0x15df46=_0x2e47fb[_0x30d4d6(0x145)];_0x343ffc<_0x15df46;_0x343ffc++)if(_0xde939b=_0x2e47fb[_0x343ffc],!(_0x367a40&&_0x11eb64['test'](_0xde939b[_0x30d4d6(0x124)]()))&&!this[_0x30d4d6(0x14d)](_0x25df9b,_0xde939b,_0x1ecc25)&&!_0x494779[typeof _0xde939b!='symbol'?_0x30d4d6(0x10e)+_0xde939b['toString']():_0xde939b]){if(_0x373035++,_0x1ecc25[_0x30d4d6(0xcc)]++,_0x373035>_0x4524d5){_0x2b7529=!0x0;break;}if(!_0x1ecc25[_0x30d4d6(0x95)]&&_0x1ecc25['autoExpand']&&_0x1ecc25[_0x30d4d6(0xcc)]>_0x1ecc25[_0x30d4d6(0x16c)]){_0x2b7529=!0x0;break;}_0x245b72[_0x30d4d6(0x93)](_0x456308[_0x30d4d6(0xac)](_0x4cff0b,_0x494779,_0x25df9b,_0x59a348,_0xde939b,_0x1ecc25));}}}}}if(_0x2d443b['type']=_0x59a348,_0x18447e?(_0x2d443b[_0x30d4d6(0xcf)]=_0x25df9b[_0x30d4d6(0x101)](),this[_0x30d4d6(0x110)](_0x59a348,_0x2d443b,_0x1ecc25,_0x321518)):_0x59a348===_0x30d4d6(0xd5)?_0x2d443b[_0x30d4d6(0xcf)]=this[_0x30d4d6(0x132)]['call'](_0x25df9b):_0x59a348==='bigint'?_0x2d443b[_0x30d4d6(0xcf)]=_0x25df9b['toString']():_0x59a348===_0x30d4d6(0x8d)?_0x2d443b[_0x30d4d6(0xcf)]=this[_0x30d4d6(0x157)][_0x30d4d6(0xbf)](_0x25df9b):_0x59a348==='symbol'&&this[_0x30d4d6(0x11e)]?_0x2d443b['value']=this[_0x30d4d6(0x11e)][_0x30d4d6(0x7d)]['toString'][_0x30d4d6(0xbf)](_0x25df9b):!_0x1ecc25['depth']&&!(_0x59a348===_0x30d4d6(0x84)||_0x59a348==='undefined')&&(delete _0x2d443b[_0x30d4d6(0xcf)],_0x2d443b[_0x30d4d6(0xc5)]=!0x0),_0x2b7529&&(_0x2d443b[_0x30d4d6(0xad)]=!0x0),_0xa59190=_0x1ecc25['node'][_0x30d4d6(0xfc)],_0x1ecc25[_0x30d4d6(0xbc)][_0x30d4d6(0xfc)]=_0x2d443b,this[_0x30d4d6(0x77)](_0x2d443b,_0x1ecc25),_0x245b72[_0x30d4d6(0x145)]){for(_0x343ffc=0x0,_0x15df46=_0x245b72[_0x30d4d6(0x145)];_0x343ffc<_0x15df46;_0x343ffc++)_0x245b72[_0x343ffc](_0x343ffc);}_0x4cff0b[_0x30d4d6(0x145)]&&(_0x2d443b[_0x30d4d6(0x162)]=_0x4cff0b);}catch(_0x30245c){_0x4ccc18(_0x30245c,_0x2d443b,_0x1ecc25);}this[_0x30d4d6(0x139)](_0x25df9b,_0x2d443b),this['_treeNodePropertiesAfterFullValue'](_0x2d443b,_0x1ecc25),_0x1ecc25[_0x30d4d6(0xbc)][_0x30d4d6(0xfc)]=_0xa59190,_0x1ecc25[_0x30d4d6(0x80)]--,_0x1ecc25['autoExpand']=_0x1fed79,_0x1ecc25[_0x30d4d6(0x82)]&&_0x1ecc25[_0x30d4d6(0x112)]['pop']();}finally{_0x4e2b2b&&(_0x2f0e57[_0x30d4d6(0x16f)]['error']=_0x4e2b2b),_0x1b1162&&(_0x2f0e57[_0x30d4d6(0x16f)][_0x30d4d6(0xed)]=_0x1b1162),_0x2f0e57['ninjaSuppressConsole']=_0x2d06d5;}return _0x2d443b;},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xb2)]=function(_0x3bb38d){var _0x1f9976=_0x14e14c;return Object[_0x1f9976(0x161)]?Object[_0x1f9976(0x161)](_0x3bb38d):[];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x7f)]=function(_0x296b7f){var _0xeb9306=_0x14e14c;return!!(_0x296b7f&&_0x2f0e57[_0xeb9306(0xa4)]&&this[_0xeb9306(0x8b)](_0x296b7f)===_0xeb9306(0x89)&&_0x296b7f[_0xeb9306(0xee)]);},_0x15bdba[_0x14e14c(0x7d)]['_blacklistedProperty']=function(_0x4e9662,_0x26026d,_0x2f539d){var _0x155232=_0x14e14c;if(!_0x2f539d[_0x155232(0xaa)]){let _0x3e8726=this[_0x155232(0x154)](_0x4e9662,_0x26026d);if(_0x3e8726&&_0x3e8726['get'])return!0x0;}return _0x2f539d[_0x155232(0x171)]?typeof _0x4e9662[_0x26026d]==_0x155232(0x117):!0x1;},_0x15bdba[_0x14e14c(0x7d)]['_type']=function(_0x124a0a){var _0x4d86a1=_0x14e14c,_0x401f2c='';return _0x401f2c=typeof _0x124a0a,_0x401f2c==='object'?this[_0x4d86a1(0x8b)](_0x124a0a)==='[object\\x20Array]'?_0x401f2c='array':this[_0x4d86a1(0x8b)](_0x124a0a)==='[object\\x20Date]'?_0x401f2c='date':this[_0x4d86a1(0x8b)](_0x124a0a)===_0x4d86a1(0x96)?_0x401f2c=_0x4d86a1(0x108):_0x124a0a===null?_0x401f2c=_0x4d86a1(0x84):_0x124a0a[_0x4d86a1(0xf7)]&&(_0x401f2c=_0x124a0a[_0x4d86a1(0xf7)][_0x4d86a1(0x86)]||_0x401f2c):_0x401f2c===_0x4d86a1(0x15c)&&this['_HTMLAllCollection']&&_0x124a0a instanceof this['_HTMLAllCollection']&&(_0x401f2c=_0x4d86a1(0x106)),_0x401f2c;},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x8b)]=function(_0x23e27b){var _0x11677b=_0x14e14c;return Object['prototype'][_0x11677b(0x124)][_0x11677b(0xbf)](_0x23e27b);},_0x15bdba['prototype']['_isPrimitiveType']=function(_0x48fd2d){var _0x2288a3=_0x14e14c;return _0x48fd2d==='boolean'||_0x48fd2d===_0x2288a3(0xe9)||_0x48fd2d===_0x2288a3(0x115);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x102)]=function(_0x43de66){var _0x54cdd5=_0x14e14c;return _0x43de66==='Boolean'||_0x43de66==='String'||_0x43de66===_0x54cdd5(0x143);},_0x15bdba['prototype'][_0x14e14c(0xc3)]=function(_0x258228,_0x4b4132,_0x4d9b21,_0x49b0b3,_0x464217,_0x5dc81a){var _0x17c832=this;return function(_0x4b3d78){var _0x19dd14=_0x4b0e,_0x5a116f=_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xfc)],_0x12a1bb=_0x464217[_0x19dd14(0xbc)]['index'],_0xbf4ca9=_0x464217['node'][_0x19dd14(0xc2)];_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xc2)]=_0x5a116f,_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xe5)]=typeof _0x49b0b3=='number'?_0x49b0b3:_0x4b3d78,_0x258228[_0x19dd14(0x93)](_0x17c832[_0x19dd14(0x160)](_0x4b4132,_0x4d9b21,_0x49b0b3,_0x464217,_0x5dc81a)),_0x464217[_0x19dd14(0xbc)][_0x19dd14(0xc2)]=_0xbf4ca9,_0x464217['node'][_0x19dd14(0xe5)]=_0x12a1bb;};},_0x15bdba['prototype'][_0x14e14c(0xac)]=function(_0x5c1cd0,_0x23b2b3,_0x44c77c,_0x48ea48,_0x589029,_0x5156f9,_0x29ac29){var _0x1e74c4=_0x14e14c,_0x391ed0=this;return _0x23b2b3[typeof _0x589029!=_0x1e74c4(0x12b)?_0x1e74c4(0x10e)+_0x589029[_0x1e74c4(0x124)]():_0x589029]=!0x0,function(_0x21b666){var _0x375d93=_0x1e74c4,_0x474373=_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xfc)],_0x153c66=_0x5156f9['node'][_0x375d93(0xe5)],_0x235695=_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)];_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)]=_0x474373,_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xe5)]=_0x21b666,_0x5c1cd0[_0x375d93(0x93)](_0x391ed0[_0x375d93(0x160)](_0x44c77c,_0x48ea48,_0x589029,_0x5156f9,_0x29ac29)),_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xc2)]=_0x235695,_0x5156f9[_0x375d93(0xbc)][_0x375d93(0xe5)]=_0x153c66;};},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x160)]=function(_0x1aa386,_0x3078fc,_0x1639a4,_0x42fb22,_0x3ae094){var _0x4f95ad=_0x14e14c,_0x506e3d=this;_0x3ae094||(_0x3ae094=function(_0x364050,_0x484f7a){return _0x364050[_0x484f7a];});var _0x25af09=_0x1639a4[_0x4f95ad(0x124)](),_0x84ef6d=_0x42fb22[_0x4f95ad(0x11d)]||{},_0x52f17e=_0x42fb22[_0x4f95ad(0x98)],_0xf4fa20=_0x42fb22[_0x4f95ad(0x95)];try{var _0x4d0558=this[_0x4f95ad(0x15e)](_0x1aa386),_0x4225ae=_0x25af09;_0x4d0558&&_0x4225ae[0x0]==='\\x27'&&(_0x4225ae=_0x4225ae[_0x4f95ad(0x14c)](0x1,_0x4225ae[_0x4f95ad(0x145)]-0x2));var _0x20c2c6=_0x42fb22['expressionsToEvaluate']=_0x84ef6d[_0x4f95ad(0x10e)+_0x4225ae];_0x20c2c6&&(_0x42fb22[_0x4f95ad(0x98)]=_0x42fb22[_0x4f95ad(0x98)]+0x1),_0x42fb22[_0x4f95ad(0x95)]=!!_0x20c2c6;var _0x1ac563=typeof _0x1639a4==_0x4f95ad(0x12b),_0x429d6a={'name':_0x1ac563||_0x4d0558?_0x25af09:this[_0x4f95ad(0xa8)](_0x25af09)};if(_0x1ac563&&(_0x429d6a[_0x4f95ad(0x12b)]=!0x0),!(_0x3078fc===_0x4f95ad(0x13a)||_0x3078fc===_0x4f95ad(0x9d))){var _0x521078=this['_getOwnPropertyDescriptor'](_0x1aa386,_0x1639a4);if(_0x521078&&(_0x521078[_0x4f95ad(0x8a)]&&(_0x429d6a[_0x4f95ad(0xc6)]=!0x0),_0x521078[_0x4f95ad(0xf2)]&&!_0x20c2c6&&!_0x42fb22[_0x4f95ad(0xaa)]))return _0x429d6a['getter']=!0x0,this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22),_0x429d6a;}var _0x3677ff;try{_0x3677ff=_0x3ae094(_0x1aa386,_0x1639a4);}catch(_0xd1b5ff){return _0x429d6a={'name':_0x25af09,'type':_0x4f95ad(0x83),'error':_0xd1b5ff['message']},this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22),_0x429d6a;}var _0x14b6b1=this['_type'](_0x3677ff),_0x1cdb28=this[_0x4f95ad(0xea)](_0x14b6b1);if(_0x429d6a[_0x4f95ad(0x118)]=_0x14b6b1,_0x1cdb28)this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22,_0x3677ff,function(){var _0x524e07=_0x4f95ad;_0x429d6a[_0x524e07(0xcf)]=_0x3677ff['valueOf'](),!_0x20c2c6&&_0x506e3d[_0x524e07(0x110)](_0x14b6b1,_0x429d6a,_0x42fb22,{});});else{var _0x2b6e95=_0x42fb22['autoExpand']&&_0x42fb22['level']<_0x42fb22['autoExpandMaxDepth']&&_0x42fb22[_0x4f95ad(0x112)][_0x4f95ad(0x73)](_0x3677ff)<0x0&&_0x14b6b1!=='function'&&_0x42fb22[_0x4f95ad(0xcc)]<_0x42fb22[_0x4f95ad(0x16c)];_0x2b6e95||_0x42fb22[_0x4f95ad(0x80)]<_0x52f17e||_0x20c2c6?this[_0x4f95ad(0x167)](_0x429d6a,_0x3677ff,_0x42fb22,_0x20c2c6||{}):this[_0x4f95ad(0xa3)](_0x429d6a,_0x42fb22,_0x3677ff,function(){var _0x4e4218=_0x4f95ad;_0x14b6b1===_0x4e4218(0x84)||_0x14b6b1===_0x4e4218(0x15c)||(delete _0x429d6a['value'],_0x429d6a[_0x4e4218(0xc5)]=!0x0);});}return _0x429d6a;}finally{_0x42fb22[_0x4f95ad(0x11d)]=_0x84ef6d,_0x42fb22[_0x4f95ad(0x98)]=_0x52f17e,_0x42fb22[_0x4f95ad(0x95)]=_0xf4fa20;}},_0x15bdba[_0x14e14c(0x7d)]['_capIfString']=function(_0x26b3ce,_0x532d93,_0x9260db,_0x2c5aae){var _0x17804f=_0x14e14c,_0x463932=_0x2c5aae[_0x17804f(0xce)]||_0x9260db[_0x17804f(0xce)];if((_0x26b3ce==='string'||_0x26b3ce===_0x17804f(0x151))&&_0x532d93[_0x17804f(0xcf)]){let _0xbd9509=_0x532d93[_0x17804f(0xcf)]['length'];_0x9260db[_0x17804f(0xbe)]+=_0xbd9509,_0x9260db[_0x17804f(0xbe)]>_0x9260db['totalStrLength']?(_0x532d93[_0x17804f(0xc5)]='',delete _0x532d93['value']):_0xbd9509>_0x463932&&(_0x532d93[_0x17804f(0xc5)]=_0x532d93['value']['substr'](0x0,_0x463932),delete _0x532d93[_0x17804f(0xcf)]);}},_0x15bdba['prototype']['_isMap']=function(_0x2f18b8){var _0x50a123=_0x14e14c;return!!(_0x2f18b8&&_0x2f0e57[_0x50a123(0xab)]&&this[_0x50a123(0x8b)](_0x2f18b8)===_0x50a123(0x10b)&&_0x2f18b8[_0x50a123(0xee)]);},_0x15bdba[_0x14e14c(0x7d)]['_propertyName']=function(_0x49bb76){var _0x4d542f=_0x14e14c;if(_0x49bb76[_0x4d542f(0xe6)](/^\\d+$/))return _0x49bb76;var _0xdb8fca;try{_0xdb8fca=JSON['stringify'](''+_0x49bb76);}catch{_0xdb8fca='\\x22'+this[_0x4d542f(0x8b)](_0x49bb76)+'\\x22';}return _0xdb8fca['match'](/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?_0xdb8fca=_0xdb8fca[_0x4d542f(0x14c)](0x1,_0xdb8fca[_0x4d542f(0x145)]-0x2):_0xdb8fca=_0xdb8fca['replace'](/'/g,'\\x5c\\x27')[_0x4d542f(0xe0)](/\\\\"/g,'\\x22')[_0x4d542f(0xe0)](/(^"|"$)/g,'\\x27'),_0xdb8fca;},_0x15bdba['prototype'][_0x14e14c(0xa3)]=function(_0x59d7f0,_0x435c19,_0x323724,_0x509245){var _0x4ce022=_0x14e14c;this['_treeNodePropertiesBeforeFullValue'](_0x59d7f0,_0x435c19),_0x509245&&_0x509245(),this[_0x4ce022(0x139)](_0x323724,_0x59d7f0),this[_0x4ce022(0x16e)](_0x59d7f0,_0x435c19);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x77)]=function(_0x37cbfb,_0x2edc5d){var _0x3be80d=_0x14e14c;this['_setNodeId'](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0x75)](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0x130)](_0x37cbfb,_0x2edc5d),this[_0x3be80d(0xc7)](_0x37cbfb,_0x2edc5d);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xec)]=function(_0x9f184a,_0x1abd18){},_0x15bdba[_0x14e14c(0x7d)]['_setNodeQueryPath']=function(_0x109952,_0x84e307){},_0x15bdba[_0x14e14c(0x7d)]['_setNodeLabel']=function(_0x392bdd,_0x55902b){},_0x15bdba['prototype'][_0x14e14c(0x140)]=function(_0x23dc27){return _0x23dc27===this['_undefined'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x16e)]=function(_0x48382c,_0x444fa8){var _0x5bc6ef=_0x14e14c;this[_0x5bc6ef(0xc9)](_0x48382c,_0x444fa8),this['_setNodeExpandableState'](_0x48382c),_0x444fa8[_0x5bc6ef(0x6f)]&&this['_sortProps'](_0x48382c),this[_0x5bc6ef(0xd8)](_0x48382c,_0x444fa8),this[_0x5bc6ef(0xd9)](_0x48382c,_0x444fa8),this[_0x5bc6ef(0xa2)](_0x48382c);},_0x15bdba[_0x14e14c(0x7d)]['_additionalMetadata']=function(_0x5a2ca4,_0x13ba41){var _0x167e9f=_0x14e14c;try{_0x5a2ca4&&typeof _0x5a2ca4[_0x167e9f(0x145)]==_0x167e9f(0x115)&&(_0x13ba41['length']=_0x5a2ca4[_0x167e9f(0x145)]);}catch{}if(_0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x115)||_0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x143)){if(isNaN(_0x13ba41[_0x167e9f(0xcf)]))_0x13ba41[_0x167e9f(0x9e)]=!0x0,delete _0x13ba41['value'];else switch(_0x13ba41[_0x167e9f(0xcf)]){case Number[_0x167e9f(0xda)]:_0x13ba41['positiveInfinity']=!0x0,delete _0x13ba41[_0x167e9f(0xcf)];break;case Number[_0x167e9f(0x6e)]:_0x13ba41[_0x167e9f(0xf5)]=!0x0,delete _0x13ba41['value'];break;case 0x0:this[_0x167e9f(0xbb)](_0x13ba41[_0x167e9f(0xcf)])&&(_0x13ba41['negativeZero']=!0x0);break;}}else _0x13ba41[_0x167e9f(0x118)]===_0x167e9f(0x117)&&typeof _0x5a2ca4[_0x167e9f(0x86)]==_0x167e9f(0xe9)&&_0x5a2ca4[_0x167e9f(0x86)]&&_0x13ba41['name']&&_0x5a2ca4[_0x167e9f(0x86)]!==_0x13ba41['name']&&(_0x13ba41['funcName']=_0x5a2ca4[_0x167e9f(0x86)]);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xbb)]=function(_0x1e877b){return 0x1/_0x1e877b===Number['NEGATIVE_INFINITY'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xf6)]=function(_0x4fd3a6){var _0x4f85fe=_0x14e14c;!_0x4fd3a6['props']||!_0x4fd3a6[_0x4f85fe(0x162)]['length']||_0x4fd3a6[_0x4f85fe(0x118)]==='array'||_0x4fd3a6[_0x4f85fe(0x118)]===_0x4f85fe(0xab)||_0x4fd3a6[_0x4f85fe(0x118)]===_0x4f85fe(0xa4)||_0x4fd3a6[_0x4f85fe(0x162)][_0x4f85fe(0xa5)](function(_0x5c1ef5,_0x4a7ec6){var _0x221367=_0x4f85fe,_0x2ebddf=_0x5c1ef5[_0x221367(0x86)][_0x221367(0x138)](),_0x5797ad=_0x4a7ec6[_0x221367(0x86)][_0x221367(0x138)]();return _0x2ebddf<_0x5797ad?-0x1:_0x2ebddf>_0x5797ad?0x1:0x0;});},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xd8)]=function(_0x53f4c6,_0x4f8fda){var _0x4549a2=_0x14e14c;if(!(_0x4f8fda['noFunctions']||!_0x53f4c6[_0x4549a2(0x162)]||!_0x53f4c6[_0x4549a2(0x162)][_0x4549a2(0x145)])){for(var _0x32873c=[],_0xb2b825=[],_0x527dd6=0x0,_0x3292f1=_0x53f4c6['props']['length'];_0x527dd6<_0x3292f1;_0x527dd6++){var _0x32c24e=_0x53f4c6[_0x4549a2(0x162)][_0x527dd6];_0x32c24e[_0x4549a2(0x118)]===_0x4549a2(0x117)?_0x32873c[_0x4549a2(0x93)](_0x32c24e):_0xb2b825[_0x4549a2(0x93)](_0x32c24e);}if(!(!_0xb2b825['length']||_0x32873c['length']<=0x1)){_0x53f4c6[_0x4549a2(0x162)]=_0xb2b825;var _0x4a1421={'functionsNode':!0x0,'props':_0x32873c};this[_0x4549a2(0xec)](_0x4a1421,_0x4f8fda),this['_setNodeLabel'](_0x4a1421,_0x4f8fda),this[_0x4549a2(0x71)](_0x4a1421),this[_0x4549a2(0xc7)](_0x4a1421,_0x4f8fda),_0x4a1421['id']+='\\x20f',_0x53f4c6[_0x4549a2(0x162)][_0x4549a2(0x105)](_0x4a1421);}}},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xd9)]=function(_0xbd163b,_0x34b9f2){},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x71)]=function(_0x2dba9d){},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x11f)]=function(_0x139d1f){var _0x1ff41f=_0x14e14c;return Array[_0x1ff41f(0x99)](_0x139d1f)||typeof _0x139d1f==_0x1ff41f(0x15d)&&this[_0x1ff41f(0x8b)](_0x139d1f)===_0x1ff41f(0x10a);},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0xc7)]=function(_0x5de8d2,_0x564e51){},_0x15bdba['prototype'][_0x14e14c(0xa2)]=function(_0x419879){var _0x11162c=_0x14e14c;delete _0x419879['_hasSymbolPropertyOnItsPath'],delete _0x419879[_0x11162c(0x109)],delete _0x419879['_hasMapOnItsPath'];},_0x15bdba[_0x14e14c(0x7d)][_0x14e14c(0x130)]=function(_0x59d1c0,_0x3aa4e2){};let _0x49843c=new _0x15bdba(),_0x44933a={'props':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0x162)]||0x64,'elements':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0x11b)]||0x64,'strLength':_0x157890[_0x14e14c(0xb6)][_0x14e14c(0xce)]||0x400*0x32,'totalStrLength':_0x157890['defaultLimits'][_0x14e14c(0x14e)]||0x400*0x32,'autoExpandLimit':_0x157890['defaultLimits']['autoExpandLimit']||0x1388,'autoExpandMaxDepth':_0x157890[_0x14e14c(0xb6)]['autoExpandMaxDepth']||0xa},_0x2434a4={'props':_0x157890['reducedLimits'][_0x14e14c(0x162)]||0x5,'elements':_0x157890[_0x14e14c(0x12a)][_0x14e14c(0x11b)]||0x5,'strLength':_0x157890[_0x14e14c(0x12a)]['strLength']||0x100,'totalStrLength':_0x157890[_0x14e14c(0x12a)][_0x14e14c(0x14e)]||0x100*0x3,'autoExpandLimit':_0x157890['reducedLimits'][_0x14e14c(0x16c)]||0x1e,'autoExpandMaxDepth':_0x157890[_0x14e14c(0x12a)]['autoExpandMaxDepth']||0x2};if(_0x2730b9){let _0x3e1b5e=_0x49843c[_0x14e14c(0x167)][_0x14e14c(0x8c)](_0x49843c);_0x49843c[_0x14e14c(0x167)]=function(_0x1652e0,_0x3cfbbf,_0x2dcdac,_0x11b90d){return _0x3e1b5e(_0x1652e0,_0x2730b9(_0x3cfbbf),_0x2dcdac,_0x11b90d);};}function _0x21f848(_0x17007d,_0x35a97d,_0x22fa88,_0x39b20f,_0x46b19e,_0x71e2b7){var _0x472084=_0x14e14c;let _0x2f7e13,_0x28c36b;try{_0x28c36b=_0x59ca1d(),_0x2f7e13=_0x2e2eb5[_0x35a97d],!_0x2f7e13||_0x28c36b-_0x2f7e13['ts']>_0x47dd45['perLogpoint'][_0x472084(0x12f)]&&_0x2f7e13[_0x472084(0xb3)]&&_0x2f7e13[_0x472084(0x76)]/_0x2f7e13[_0x472084(0xb3)]<_0x47dd45[_0x472084(0x166)][_0x472084(0xdc)]?(_0x2e2eb5[_0x35a97d]=_0x2f7e13={'count':0x0,'time':0x0,'ts':_0x28c36b},_0x2e2eb5[_0x472084(0x128)]={}):_0x28c36b-_0x2e2eb5['hits']['ts']>_0x47dd45[_0x472084(0x16a)]['resetWhenQuietMs']&&_0x2e2eb5['hits'][_0x472084(0xb3)]&&_0x2e2eb5['hits']['time']/_0x2e2eb5['hits'][_0x472084(0xb3)]<_0x47dd45['global']['resetOnProcessingTimeAverageMs']&&(_0x2e2eb5['hits']={});let _0x1e7025=[],_0x358350=_0x2f7e13['reduceLimits']||_0x2e2eb5[_0x472084(0x128)][_0x472084(0x12c)]?_0x2434a4:_0x44933a,_0x1e1be5=_0x369196=>{var _0x238243=_0x472084;let _0x1f647e={};return _0x1f647e[_0x238243(0x162)]=_0x369196[_0x238243(0x162)],_0x1f647e[_0x238243(0x11b)]=_0x369196['elements'],_0x1f647e['strLength']=_0x369196[_0x238243(0xce)],_0x1f647e['totalStrLength']=_0x369196[_0x238243(0x14e)],_0x1f647e[_0x238243(0x16c)]=_0x369196[_0x238243(0x16c)],_0x1f647e['autoExpandMaxDepth']=_0x369196['autoExpandMaxDepth'],_0x1f647e[_0x238243(0x6f)]=!0x1,_0x1f647e[_0x238243(0x171)]=!_0x105dac,_0x1f647e[_0x238243(0x98)]=0x1,_0x1f647e[_0x238243(0x80)]=0x0,_0x1f647e[_0x238243(0xb4)]='root_exp_id',_0x1f647e['rootExpression']=_0x238243(0x11c),_0x1f647e[_0x238243(0x82)]=!0x0,_0x1f647e[_0x238243(0x112)]=[],_0x1f647e[_0x238243(0xcc)]=0x0,_0x1f647e['resolveGetters']=_0x157890[_0x238243(0xaa)],_0x1f647e[_0x238243(0xbe)]=0x0,_0x1f647e[_0x238243(0xbc)]={'current':void 0x0,'parent':void 0x0,'index':0x0},_0x1f647e;};for(var _0x46d82b=0x0;_0x46d82b<_0x46b19e[_0x472084(0x145)];_0x46d82b++)_0x1e7025['push'](_0x49843c[_0x472084(0x167)]({'timeNode':_0x17007d===_0x472084(0x76)||void 0x0},_0x46b19e[_0x46d82b],_0x1e1be5(_0x358350),{}));if(_0x17007d==='trace'||_0x17007d===_0x472084(0x126)){let _0x61389a=Error[_0x472084(0xfe)];try{Error[_0x472084(0xfe)]=0x1/0x0,_0x1e7025['push'](_0x49843c['serialize']({'stackNode':!0x0},new Error()[_0x472084(0x15f)],_0x1e1be5(_0x358350),{'strLength':0x1/0x0}));}finally{Error[_0x472084(0xfe)]=_0x61389a;}}return{'method':_0x472084(0xa7),'version':_0x13b43c,'args':[{'ts':_0x22fa88,'session':_0x39b20f,'args':_0x1e7025,'id':_0x35a97d,'context':_0x71e2b7}]};}catch(_0x70970b){return{'method':'log','version':_0x13b43c,'args':[{'ts':_0x22fa88,'session':_0x39b20f,'args':[{'type':_0x472084(0x83),'error':_0x70970b&&_0x70970b['message']}],'id':_0x35a97d,'context':_0x71e2b7}]};}finally{try{if(_0x2f7e13&&_0x28c36b){let _0x12cb09=_0x59ca1d();_0x2f7e13[_0x472084(0xb3)]++,_0x2f7e13[_0x472084(0x76)]+=_0x300ed1(_0x28c36b,_0x12cb09),_0x2f7e13['ts']=_0x12cb09,_0x2e2eb5[_0x472084(0x128)]['count']++,_0x2e2eb5['hits'][_0x472084(0x76)]+=_0x300ed1(_0x28c36b,_0x12cb09),_0x2e2eb5[_0x472084(0x128)]['ts']=_0x12cb09,(_0x2f7e13[_0x472084(0xb3)]>_0x47dd45[_0x472084(0x166)][_0x472084(0x137)]||_0x2f7e13[_0x472084(0x76)]>_0x47dd45['perLogpoint']['reduceOnAccumulatedProcessingTimeMs'])&&(_0x2f7e13[_0x472084(0x12c)]=!0x0),(_0x2e2eb5[_0x472084(0x128)][_0x472084(0xb3)]>_0x47dd45[_0x472084(0x16a)][_0x472084(0x137)]||_0x2e2eb5[_0x472084(0x128)][_0x472084(0x76)]>_0x47dd45[_0x472084(0x16a)]['reduceOnAccumulatedProcessingTimeMs'])&&(_0x2e2eb5[_0x472084(0x128)][_0x472084(0x12c)]=!0x0);}}catch{}}}return _0x21f848;}function G(_0x3be696){var _0x46c6d9=_0x2d0e46;if(_0x3be696&&typeof _0x3be696==_0x46c6d9(0x15d)&&_0x3be696[_0x46c6d9(0xf7)])switch(_0x3be696[_0x46c6d9(0xf7)]['name']){case _0x46c6d9(0x147):return _0x3be696['hasOwnProperty'](Symbol[_0x46c6d9(0x127)])?Promise[_0x46c6d9(0xef)]():_0x3be696;case _0x46c6d9(0x100):return Promise['resolve']();}return _0x3be696;}function _0x25c1(){var _0x23e53f=['584FNhvcu','depth','isArray','failed\\x20to\\x20connect\\x20to\\x20host:\\x20','181696WbLlCU','port','Error','nan','unref','emulator','url','_cleanNode','_processTreeNodeResult','Set','sort','1HmYSRt','log','_propertyName','_p_length','resolveGetters','Map','_addObjectProperty','cappedProps',',\\x20see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','background:\\x20rgb(30,30,30);\\x20color:\\x20rgb(255,213,92)','_socket','ExpoDevice','_getOwnPropertySymbols','count','expId','406426XGONyb','defaultLimits','remix','67669xJppUN','endsWith','send','_isNegativeZero','node','194070ShBIXL','allStrLength','call','33763','5FsGXyE','parent','_addProperty','_connecting','capped','setter','_setNodePermissions','15179373iCDJWQ','_setNodeLabel','getWebSocketClass','react-native','autoExpandPropertyCount','default','strLength','value','then','_WebSocket','_quotedRegExp','host','hrtime','date','getOwnPropertyDescriptor','_consoleNinjaAllowedToStart','_addFunctionsNode','_addLoadNode','POSITIVE_INFINITY','env','resetOnProcessingTimeAverageMs','_attemptToReconnectShortly','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20refreshing\\x20the\\x20page\\x20may\\x20help;\\x20also\\x20see\\x20','_WebSocketClass','replace','perf_hooks','_reconnectTimeout','gateway.docker.internal','_allowedToConnectOnSend','index','match','10.0.2.2','getOwnPropertyNames','string','_isPrimitiveType','ninjaSuppressConsole','_setNodeId','warn','forEach','resolve','import(\\x27url\\x27)','fromCharCode','get','Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','now','negativeInfinity','_sortProps','constructor','onmessage','eventReceivedCallback','message','onopen','current','_extendedWarning','stackTraceLimit','expo','bound\\x20Promise','valueOf','_isPrimitiveWrapperType','Symbol','_console_ninja','unshift','HTMLAllCollection','data','bigint','_hasSetOnItsPath','[object\\x20Array]','[object\\x20Map]','_disposeWebsocket','return\\x20import(url.pathToFileURL(path.join(nodeModules,\\x20\\x27ws/index.js\\x27)).toString());','_p_','logger\\x20websocket\\x20error','_capIfString','origin','autoExpandPreviousObjects','_ninjaIgnoreNextError','_type','number','close','function','type','cappedElements','failed\\x20to\\x20find\\x20and\\x20load\\x20WebSocket','elements','root_exp','expressionsToEvaluate','_Symbol','_isArray','timeStamp','_connectToHostNow','includes','_connected','toString','NEXT_RUNTIME','error','iterator','hits','modules','reducedLimits','symbol','reduceLimits','args','\\x20browser','resetWhenQuietMs','_setNodeExpressionPath','next.js','_dateToString','charAt','8013680rSmsWy','_keyStrRegExp','startsWith','reduceOnCount','toLowerCase','_additionalMetadata','array','osName','logger\\x20failed\\x20to\\x20connect\\x20to\\x20host,\\x20see\\x20','%c\\x20Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','_ws','Buffer','_isUndefined','1777834244956','_connectAttemptCount','Number','edge','length',["localhost","127.0.0.1","example.cypress.io","10.0.2.2","henry-tercero-Victus-by-HP-Gaming-Laptop-15-fa2xxx","192.168.1.82"],'Promise','path','_console_ninja_session','_p_name','disabledLog','substr','_blacklistedProperty','totalStrLength','location','reduceOnAccumulatedProcessingTimeMs','String','elapsed','stringify','_getOwnPropertyDescriptor','performance','method','_regExpToString','_inNextEdge','versions','9GpoAse','nodeModules','undefined','object','_isMap','stack','_property','getOwnPropertySymbols','props','angular','process','_allowedToSend','perLogpoint','serialize','onerror','hostname','global','...','autoExpandLimit','slice','_treeNodePropertiesAfterFullValue','console','reload','noFunctions','_maxConnectAttemptCount','test','readyState','WebSocket','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20restarting\\x20the\\x20process\\x20may\\x20help;\\x20also\\x20see\\x20','NEGATIVE_INFINITY','sortProps','reducePolicy','_setNodeExpandableState','parse','indexOf','_undefined','_setNodeQueryPath','time','_treeNodePropertiesBeforeFullValue','coverage','_webSocketErrorDocsLink','see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.',{"resolveGetters":false,"defaultLimits":{"props":100,"elements":100,"strLength":51200,"totalStrLength":51200,"autoExpandLimit":5000,"autoExpandMaxDepth":10},"reducedLimits":{"props":5,"elements":5,"strLength":256,"totalStrLength":768,"autoExpandLimit":30,"autoExpandMaxDepth":2},"reducePolicy":{"perLogpoint":{"reduceOnCount":50,"reduceOnAccumulatedProcessingTimeMs":100,"resetWhenQuietMs":500,"resetOnProcessingTimeAverageMs":100},"global":{"reduceOnCount":1000,"reduceOnAccumulatedProcessingTimeMs":300,"resetWhenQuietMs":50,"resetOnProcessingTimeAverageMs":100}}},'2406444klbbNi','prototype','some','_isSet','level','catch','autoExpand','unknown','null','trace','name','https://tinyurl.com/37x8b79t','_sendErrorMessage','[object\\x20Set]','set','_objectToString','bind','RegExp','_getOwnPropertyNames','127.0.0.1','concat','onclose','_inBrowser','push','toUpperCase','isExpressionToEvaluate','[object\\x20BigInt]'];_0x25c1=function(){return _0x23e53f;};return _0x25c1();}((_0x310788,_0x34a169,_0xda7e90,_0x2b96e0,_0xbdb288,_0xb7253e,_0x95c4a4,_0x17022f,_0x2075e1,_0x4b9be4,_0xfe705b,_0xbd257b)=>{var _0x5c26f9=_0x2d0e46;if(_0x310788[_0x5c26f9(0x104)])return _0x310788[_0x5c26f9(0x104)];let _0x5991f1={'consoleLog':()=>{},'consoleTrace':()=>{},'consoleTime':()=>{},'consoleTimeEnd':()=>{},'autoLog':()=>{},'autoLogMany':()=>{},'autoTraceMany':()=>{},'coverage':()=>{},'autoTrace':()=>{},'autoTime':()=>{},'autoTimeEnd':()=>{}};if(!X(_0x310788,_0x17022f,_0xbdb288))return _0x310788[_0x5c26f9(0x104)]=_0x5991f1,_0x310788['_console_ninja'];let _0x4b5c88=b(_0x310788),_0xb6ade8=_0x4b5c88['elapsed'],_0x47a25b=_0x4b5c88[_0x5c26f9(0x120)],_0x3e6e1e=_0x4b5c88[_0x5c26f9(0xf4)],_0x2c8192={'hits':{},'ts':{}},_0x242dc4=J(_0x310788,_0x2075e1,_0x2c8192,_0xb7253e,_0xbd257b,_0xbdb288===_0x5c26f9(0x131)?G:void 0x0),_0xa6227d=(_0x57a80d,_0x2aff63,_0x2519e5,_0x1505b7,_0x2df6ce,_0x1cd947)=>{var _0x429ab5=_0x5c26f9;let _0x20b358=_0x310788[_0x429ab5(0x104)];try{return _0x310788[_0x429ab5(0x104)]=_0x5991f1,_0x242dc4(_0x57a80d,_0x2aff63,_0x2519e5,_0x1505b7,_0x2df6ce,_0x1cd947);}finally{_0x310788[_0x429ab5(0x104)]=_0x20b358;}},_0x53c51e=_0x5ae6ca=>{_0x2c8192['ts'][_0x5ae6ca]=_0x47a25b();},_0x3a2f9a=(_0x5852d8,_0x300afc)=>{var _0x4e6575=_0x5c26f9;let _0x32dd38=_0x2c8192['ts'][_0x300afc];if(delete _0x2c8192['ts'][_0x300afc],_0x32dd38){let _0x1c1d91=_0xb6ade8(_0x32dd38,_0x47a25b());_0x15ff32(_0xa6227d(_0x4e6575(0x76),_0x5852d8,_0x3e6e1e(),_0x3cc683,[_0x1c1d91],_0x300afc));}},_0x2e42ea=_0x4e959d=>{var _0x22e95d=_0x5c26f9,_0x25cb91;return _0xbdb288===_0x22e95d(0x131)&&_0x310788[_0x22e95d(0x111)]&&((_0x25cb91=_0x4e959d==null?void 0x0:_0x4e959d[_0x22e95d(0x12d)])==null?void 0x0:_0x25cb91[_0x22e95d(0x145)])&&(_0x4e959d[_0x22e95d(0x12d)][0x0][_0x22e95d(0x111)]=_0x310788[_0x22e95d(0x111)]),_0x4e959d;};_0x310788['_console_ninja']={'consoleLog':(_0x57e34e,_0x1291ab)=>{var _0x2ca6cf=_0x5c26f9;_0x310788[_0x2ca6cf(0x16f)]['log'][_0x2ca6cf(0x86)]!==_0x2ca6cf(0x14b)&&_0x15ff32(_0xa6227d(_0x2ca6cf(0xa7),_0x57e34e,_0x3e6e1e(),_0x3cc683,_0x1291ab));},'consoleTrace':(_0x2bceca,_0x2e6407)=>{var _0x16a162=_0x5c26f9,_0x197dfe,_0x147761;_0x310788[_0x16a162(0x16f)][_0x16a162(0xa7)][_0x16a162(0x86)]!=='disabledTrace'&&((_0x147761=(_0x197dfe=_0x310788[_0x16a162(0x164)])==null?void 0x0:_0x197dfe[_0x16a162(0x159)])!=null&&_0x147761[_0x16a162(0xbc)]&&(_0x310788[_0x16a162(0x113)]=!0x0),_0x15ff32(_0x2e42ea(_0xa6227d('trace',_0x2bceca,_0x3e6e1e(),_0x3cc683,_0x2e6407))));},'consoleError':(_0x383b9b,_0x5a7771)=>{var _0x132cf8=_0x5c26f9;_0x310788[_0x132cf8(0x113)]=!0x0,_0x15ff32(_0x2e42ea(_0xa6227d(_0x132cf8(0x126),_0x383b9b,_0x3e6e1e(),_0x3cc683,_0x5a7771)));},'consoleTime':_0x3363f7=>{_0x53c51e(_0x3363f7);},'consoleTimeEnd':(_0x27785a,_0x2648d7)=>{_0x3a2f9a(_0x2648d7,_0x27785a);},'autoLog':(_0x4aebf6,_0x392081)=>{var _0x3a473f=_0x5c26f9;_0x15ff32(_0xa6227d(_0x3a473f(0xa7),_0x392081,_0x3e6e1e(),_0x3cc683,[_0x4aebf6]));},'autoLogMany':(_0x2fc044,_0x372be9)=>{var _0x39bffd=_0x5c26f9;_0x15ff32(_0xa6227d(_0x39bffd(0xa7),_0x2fc044,_0x3e6e1e(),_0x3cc683,_0x372be9));},'autoTrace':(_0x34c5e8,_0x42347d)=>{var _0x5abd64=_0x5c26f9;_0x15ff32(_0x2e42ea(_0xa6227d(_0x5abd64(0x85),_0x42347d,_0x3e6e1e(),_0x3cc683,[_0x34c5e8])));},'autoTraceMany':(_0xa13ed2,_0x156a4e)=>{_0x15ff32(_0x2e42ea(_0xa6227d('trace',_0xa13ed2,_0x3e6e1e(),_0x3cc683,_0x156a4e)));},'autoTime':(_0x40c075,_0x354404,_0x580725)=>{_0x53c51e(_0x580725);},'autoTimeEnd':(_0x169ff4,_0x1a7c4e,_0x3eadb8)=>{_0x3a2f9a(_0x1a7c4e,_0x3eadb8);},'coverage':_0xb8473d=>{var _0x5b2de5=_0x5c26f9;_0x15ff32({'method':_0x5b2de5(0x78),'version':_0xb7253e,'args':[{'id':_0xb8473d}]});}};let _0x15ff32=H(_0x310788,_0x34a169,_0xda7e90,_0x2b96e0,_0xbdb288,_0x4b9be4,_0xfe705b),_0x3cc683=_0x310788[_0x5c26f9(0x149)];return _0x310788[_0x5c26f9(0x104)];})(globalThis,_0x2d0e46(0x8f),_0x2d0e46(0xc0),"/home/henry-tercero/.vscode/extensions/wallabyjs.console-ninja-1.0.526/node_modules",'vite','1.0.0',_0x2d0e46(0x141),_0x2d0e46(0x146),'','','1',_0x2d0e46(0x7b));`);
  } catch (e) {
    console.error(e);
  }
}
function oo_oo(i, ...v) {
  try {
    oo_cm().consoleLog(i, v);
  } catch (e) {
  }
  return v;
}
const { app, BrowserWindow, Menu } = _electron;
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(app.getAppPath(), "dist-electron", "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(join(app.getAppPath(), "dist", "index.html"));
  }
}
function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "Archivo",
      submenu: [
        { role: "quit", label: "Salir" }
      ]
    },
    {
      label: "Vista",
      submenu: [
        { role: "reload", label: "Recargar", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", label: "Recargar (forzado)", accelerator: "CmdOrCtrl+Shift+R" },
        { role: "toggleDevTools", label: "Herramientas de dev", accelerator: "F12" },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom normal", accelerator: "CmdOrCtrl+0" },
        { role: "zoomIn", label: "Acercar", accelerator: "CmdOrCtrl+=" },
        { role: "zoomOut", label: "Alejar", accelerator: "CmdOrCtrl+-" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa", accelerator: "F11" }
      ]
    }
  ]);
}
app.whenReady().then(() => {
  Menu.setApplicationMenu(buildMenu());
  bootstrap();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
