var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import { app, ipcMain, dialog, BrowserWindow, Menu } from "electron";
import path, { join } from "node:path";
import path$1 from "path";
import Database from "better-sqlite3";
import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
var require_index = __commonJS({
  "index.cjs"() {
    const __vite_glob_0_0 = "-- 001_init.sql\n-- Preserva el esquema actual (products, sales, sale_items) y la data semilla.\n-- No cambia estructura: solo mueve la creacion a una migracion versionada.\n-- Los redisenios de negocio iran en migraciones posteriores.\n\nCREATE TABLE IF NOT EXISTS products (\n  id    INTEGER PRIMARY KEY AUTOINCREMENT,\n  code  TEXT    NOT NULL UNIQUE,\n  name  TEXT    NOT NULL,\n  price REAL    NOT NULL,\n  stock INTEGER NOT NULL DEFAULT 0\n);\n\nCREATE TABLE IF NOT EXISTS sales (\n  id    INTEGER PRIMARY KEY AUTOINCREMENT,\n  total REAL    NOT NULL,\n  date  TEXT    DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS sale_items (\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  sale_id    INTEGER NOT NULL,\n  product_id INTEGER NOT NULL,\n  qty        INTEGER NOT NULL,\n  price      REAL    NOT NULL,\n  FOREIGN KEY (sale_id)    REFERENCES sales(id),\n  FOREIGN KEY (product_id) REFERENCES products(id)\n);\n\n-- Data semilla. INSERT OR IGNORE garantiza idempotencia si alguna instalacion\n-- ya la tuviera (por ejemplo una DB preexistente del bootstrap antiguo).\nINSERT OR IGNORE INTO products (code, name, price, stock) VALUES\n  ('ACE-001', 'Aceite de Motor 10W40 Chevron',    45.00,  12),\n  ('FIL-002', 'Filtro de Aceite ECOBREX',         15.50,   5),\n  ('FRE-003', 'Pastillas de Freno Ceramicas',    120.00,   8),\n  ('BAT-004', 'Bateria 12V 70Ah LTH',            650.00,   2),\n  ('SRV-001', 'Servicio de Diagnostico Escaner', 150.00, 999);\n";
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
    const __vite_glob_0_22 = "-- 023_categories.sql\n-- Tabla de categorias de productos. Reemplaza el arreglo hardcodeado en ProductForm.\nCREATE TABLE IF NOT EXISTS categories (\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\n  name       TEXT    NOT NULL UNIQUE,\n  is_active  INTEGER NOT NULL DEFAULT 1,\n  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\n);\n\n-- Semilla: categorias que estaban hardcodeadas en el frontend\nINSERT OR IGNORE INTO categories (name) VALUES\n  ('Aceites y lubricantes'),\n  ('Frenos e hidráulico'),\n  ('Filtros'),\n  ('Bujías y encendido'),\n  ('Químicos y aerosoles'),\n  ('Refrigeración'),\n  ('Eléctrico'),\n  ('Servicios'),\n  ('Otro');\n";
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
    let instance = null;
    function getDb() {
      if (instance) return instance;
      const dbPath = path.join(app.getPath("userData"), "taller_pos.sqlite");
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
  }
});
export default require_index();
