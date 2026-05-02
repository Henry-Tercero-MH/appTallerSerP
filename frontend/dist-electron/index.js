import { app as y, ipcMain as l, dialog as Ae, BrowserWindow as x, Menu as ye } from "electron";
import v, { join as te } from "node:path";
import Le from "path";
import ge from "better-sqlite3";
import he, { createHash as Ue } from "node:crypto";
import L from "node:fs";
const be = `-- 001_init.sql
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
`, Ce = `-- 002_settings.sql
-- Tabla de configuracion parametrica. \`type\` restringe los valores que el
-- service aceptara y como deserializa \`value\` (que siempre se almacena TEXT).
-- CHECK evita que la capa de datos quede en estado invalido incluso si alguien
-- escribe sin pasar por el service.

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'json')),
  category    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Valores por defecto. INSERT OR IGNORE para no sobrescribir nada que el
-- usuario haya editado antes (ej. tras reinstalar con DB preservada).
-- Booleans se almacenan como '0'/'1' por consistencia con el serializador.
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('tax_rate',               '0.12',  'number',  'tax',      'IVA aplicado a ventas (decimal, ej. 0.12 = 12%)'),
  ('tax_included_in_price',  '0',     'boolean', 'tax',      'Si los precios ya incluyen IVA'),
  ('currency_code',          'GTQ',   'string',  'currency', 'Codigo ISO 4217 de la moneda'),
  ('currency_symbol',        'Q',     'string',  'currency', 'Simbolo que se muestra en UI/tickets'),
  ('decimal_places',         '2',     'number',  'currency', 'Decimales para mostrar importes'),
  ('allow_negative_stock',   '0',     'boolean', 'inventory','Permitir vender sin stock disponible'),
  ('business_name',          '',      'string',  'business', 'Razon social / nombre comercial'),
  ('business_nit',           '',      'string',  'business', 'NIT del emisor'),
  ('business_address',       '',      'string',  'business', 'Direccion fiscal'),
  ('business_phone',         '',      'string',  'business', 'Telefono de contacto');
`, De = `-- 003_sales_tax_snapshot.sql
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
`, we = `-- 004_customers.sql
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
`, ve = `-- 005_products_extended.sql
-- Extiende la tabla products con los campos que usa el modulo de Inventario:
-- categoria, marca, ubicacion, condicion, stock minimo y estado activo.
--
-- Se usa ALTER TABLE ... ADD COLUMN porque la tabla ya existe con datos.
-- Todas las columnas nuevas tienen DEFAULT para que los 5 registros semilla
-- queden validos sin backfill manual.
--
-- is_active: 1=activo, 0=inactivo (soft-delete). Default 1 para no romper
-- productos existentes.

ALTER TABLE products ADD COLUMN category  TEXT    NOT NULL DEFAULT 'General';
ALTER TABLE products ADD COLUMN brand     TEXT    NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN location  TEXT    NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN condition TEXT    NOT NULL DEFAULT 'Nuevo';
ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
`, Me = `-- 006_users.sql
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
`, Be = `-- 007_settings_extended.sql
-- Amplía la tabla settings con configuraciones de negocio genéricas:
-- identidad visual, contacto, ticket y preferencias de app.
-- INSERT OR IGNORE: nunca pisa valores que el usuario ya haya guardado.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  -- Identidad
  ('business_email',       '',           'string',  'business',  'Correo electronico de contacto'),
  ('business_website',     '',           'string',  'business',  'Sitio web del negocio'),
  ('business_city',        '',           'string',  'business',  'Ciudad / municipio'),
  ('business_country',     'Guatemala',  'string',  'business',  'Pais'),
  ('business_logo_base64', '',           'string',  'business',  'Logo en base64 (data URL completa)'),

  -- Ticket / impresion
  ('ticket_footer_line1',  '',           'string',  'ticket',    'Primera linea del pie de ticket'),
  ('ticket_footer_line2',  '',           'string',  'ticket',    'Segunda linea del pie de ticket'),
  ('ticket_show_logo',     '1',          'boolean', 'ticket',    'Mostrar logo en el ticket impreso'),
  ('ticket_show_tax',      '1',          'boolean', 'ticket',    'Desglosar IVA en el ticket'),
  ('ticket_copies',        '1',          'number',  'ticket',    'Copias a imprimir por venta'),

  -- Apariencia / app
  ('app_name',             'SerProMec',  'string',  'app',       'Nombre que aparece en la barra lateral y titulo'),
  ('app_accent_color',     '#e5001f',    'string',  'app',       'Color de acento principal (hex)');
`, Fe = `-- 008_settings_theme.sql
-- Agrega la clave app_theme para persistir la paleta de colores seleccionada.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('app_theme', 'crimson', 'string', 'app', 'Paleta de colores del sistema (slug de tema)');
`, qe = `-- 009_sales_payment.sql
-- Agrega método de pago y tipo de cliente a la tabla de ventas.

ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'credit', 'card', 'transfer'));

ALTER TABLE sales ADD COLUMN client_type TEXT NOT NULL DEFAULT 'cf'
  CHECK (client_type IN ('cf', 'registered', 'company'));
`, Pe = `-- 010_sales_void_audit.sql
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
`, ke = `ALTER TABLE users ADD COLUMN avatar TEXT;
`, He = `-- 012_cash_sessions.sql
-- Apertura y cierre de caja con movimientos manuales.

CREATE TABLE IF NOT EXISTS cash_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by        INTEGER NOT NULL REFERENCES users(id),
  opened_by_name   TEXT    NOT NULL,
  opened_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  opening_amount   REAL    NOT NULL DEFAULT 0,
  closed_by        INTEGER REFERENCES users(id),
  closed_by_name   TEXT,
  closed_at        TEXT,
  closing_amount   REAL,
  expected_amount  REAL,
  difference       REAL,
  notes            TEXT,
  status           TEXT    NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES cash_sessions(id),
  type        TEXT    NOT NULL CHECK (type IN ('in', 'out')),
  amount      REAL    NOT NULL CHECK (amount > 0),
  concept     TEXT    NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_status    ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session  ON cash_movements(session_id);
`, Xe = `-- 013_purchases.sql
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
`, xe = `-- Cuentas por cobrar
CREATE TABLE IF NOT EXISTS receivables (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER,
  customer_name TEXT    NOT NULL,
  customer_nit  TEXT,
  description   TEXT    NOT NULL,
  amount        REAL    NOT NULL DEFAULT 0,
  amount_paid   REAL    NOT NULL DEFAULT 0,
  due_date      TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','cancelled')),
  notes         TEXT,
  created_by    INTEGER,
  created_by_name TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

-- Pagos aplicados a cada cuenta
CREATE TABLE IF NOT EXISTS receivable_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receivable_id   INTEGER NOT NULL REFERENCES receivables(id),
  amount          REAL    NOT NULL,
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  notes           TEXT,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);
`, je = `CREATE TABLE IF NOT EXISTS quotes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER,
  customer_name   TEXT    NOT NULL,
  customer_nit    TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','converted')),
  notes           TEXT,
  valid_until     TEXT,
  subtotal        REAL    NOT NULL DEFAULT 0,
  tax_rate        REAL    NOT NULL DEFAULT 0,
  tax_amount      REAL    NOT NULL DEFAULT 0,
  total           REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER,
  created_by_name TEXT,
  sale_id         INTEGER,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id     INTEGER NOT NULL REFERENCES quotes(id),
  product_id   INTEGER,
  product_name TEXT    NOT NULL,
  product_code TEXT,
  qty          REAL    NOT NULL DEFAULT 1,
  unit_price   REAL    NOT NULL DEFAULT 0,
  subtotal     REAL    NOT NULL DEFAULT 0
);
`, Ye = `-- Descuentos en ventas
ALTER TABLE sales ADD COLUMN discount_type   TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sales ADD COLUMN discount_value  REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
`, Ve = `-- Gastos / egresos operativos
CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT    NOT NULL DEFAULT 'otros',
  description     TEXT    NOT NULL,
  amount          REAL    NOT NULL DEFAULT 0,
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  expense_date    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d','now','localtime')),
  notes           TEXT,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);
`, Ge = `-- Devoluciones de ventas
CREATE TABLE IF NOT EXISTS returns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES sales(id),
  reason          TEXT    NOT NULL,
  notes           TEXT,
  total_refund    REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE TABLE IF NOT EXISTS return_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id     INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id  INTEGER NOT NULL,
  product_id    INTEGER NOT NULL,
  product_name  TEXT    NOT NULL,
  qty_returned  REAL    NOT NULL DEFAULT 0,
  unit_price    REAL    NOT NULL DEFAULT 0,
  subtotal      REAL    NOT NULL DEFAULT 0
);
`, We = `-- Movimientos de inventario (kardex)
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL,
  product_name   TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK(type IN ('in','out','adjustment','sale','purchase','return')),
  qty            REAL    NOT NULL,
  qty_before     REAL    NOT NULL DEFAULT 0,
  qty_after      REAL    NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id   INTEGER,
  notes          TEXT,
  created_by     INTEGER,
  created_by_name TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
`, $e = `-- Configuración del backup automático
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('backup_interval_hours', '720',  'number', 'backup', 'Intervalo entre backups automáticos en horas (24=diario, 168=semanal, 720=mensual)'),
  ('backup_max_copies',     '10',   'number', 'backup', 'Número máximo de copias automáticas a conservar');
`, Ke = `-- 021_tax_enabled.sql
-- Agrega el interruptor global de IVA.
-- Por defecto desactivado: los precios ya incluyen IVA y no se desglosa en ningun lado.
-- INSERT OR IGNORE: no pisa el valor si el usuario ya lo cambio.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('tax_enabled', '0', 'boolean', 'tax', 'Habilitar calculo y visualizacion de IVA en toda la app');
`, Qe = `-- 022_printer_settings.sql
-- Configuracion de impresora para recibos.
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('receipt_printer',    '',              'string', 'ticket', 'Nombre exacto de la impresora para recibos (vacío = abre diálogo del sistema)'),
  ('receipt_paper_size', 'half-letter',   'string', 'ticket', 'Tamaño de papel: half-letter | letter | thermal-80');
`, ze = `-- 023_categories.sql
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
`;
let Y = null;
function Ze() {
  if (Y) return Y;
  const e = v.join(y.getPath("userData"), "taller_pos.sqlite"), n = new ge(e);
  return n.pragma("journal_mode = WAL"), n.pragma("foreign_keys = ON"), n.pragma("synchronous = NORMAL"), Y = n, n;
}
const Je = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    checksum    TEXT    NOT NULL,
    executed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;
function et(e) {
  const n = e.replace(/\r\n/g, `
`);
  return he.createHash("sha256").update(n, "utf8").digest("hex");
}
function tt(e, n) {
  e.exec(Je);
  const t = e.prepare("SELECT checksum FROM schema_migrations WHERE name = ?"), r = e.prepare(
    "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)"
  ), a = [...n].sort((o, c) => o.name.localeCompare(c.name)), s = [], i = [];
  for (const o of a) {
    const c = et(o.sql), d = t.get(o.name);
    if (d) {
      if (d.checksum !== c)
        throw new Error(
          `Migration tampering detected: "${o.name}" fue aplicada con checksum ${d.checksum} pero el archivo actual tiene ${c}. Nunca modifiques migraciones ya aplicadas; crea una nueva.`
        );
      i.push(o.name);
      continue;
    }
    e.transaction(() => {
      e.exec(o.sql), r.run(o.name, c);
    })(), s.push(o.name);
  }
  return { applied: s, skipped: i };
}
function nt(e) {
  const n = {
    selectAll: e.prepare("SELECT key, value, type, category, description, updated_at FROM settings"),
    selectByKey: e.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE key = ?"
    ),
    selectByCategory: e.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE category = ?"
    ),
    updateValue: e.prepare(
      `UPDATE settings
         SET value = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE key = ?`
    ),
    upsertValue: e.prepare(
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
      return n.selectAll.all();
    },
    /**
     * @param {string} key
     * @returns {SettingRow | undefined}
     */
    findByKey(t) {
      return n.selectByKey.get(t);
    },
    /**
     * @param {string} category
     * @returns {SettingRow[]}
     */
    findByCategory(t) {
      return n.selectByCategory.all(t);
    },
    /**
     * Actualiza solo el valor (ya serializado a TEXT).
     * No inserta: la creacion de claves es responsabilidad de migraciones.
     * @param {string} key
     * @param {string} serializedValue
     * @returns {number} filas afectadas (0 si key no existe)
     */
    updateValue(t, r) {
      return n.updateValue.run(r, t).changes;
    },
    /**
     * INSERT OR UPDATE: crea la fila si no existe, actualiza si existe.
     * Solo para keys de tipo string que pueden llegar antes de que la
     * migracion las haya creado (ej. app_theme durante desarrollo).
     * @param {string} key
     * @param {string} serializedValue
     */
    upsertValue(t, r) {
      n.upsertValue.run(t, r);
    }
  };
}
class de extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(n, t) {
    super(t), this.name = "SettingError", this.code = n;
  }
}
class V extends de {
  /** @param {string} key */
  constructor(n) {
    super("SETTING_NOT_FOUND", `Setting no encontrado: "${n}"`), this.name = "SettingNotFoundError", this.key = n;
  }
}
class A extends de {
  /**
   * @param {string} key
   * @param {string} expectedType
   * @param {unknown} receivedValue
   */
  constructor(n, t, r) {
    super(
      "SETTING_INVALID_VALUE",
      `Setting "${n}" requiere tipo "${t}" pero recibio ${typeof r} (${String(
        r
      )})`
    ), this.name = "SettingValidationError", this.key = n, this.expectedType = t;
  }
}
function G(e) {
  return { ...e, value: rt(e.value, e.type, e.key) };
}
function rt(e, n, t) {
  switch (n) {
    case "string":
      return e;
    case "number": {
      const r = Number(e);
      if (!Number.isFinite(r))
        throw new A(t, "number", e);
      return r;
    }
    case "boolean":
      return e === "1" || e === "true";
    case "json":
      try {
        return JSON.parse(e);
      } catch {
        throw new A(t, "json", e);
      }
    default:
      throw new A(t, n, e);
  }
}
function at(e, n, t) {
  switch (n) {
    case "string":
      if (typeof e != "string") throw new A(t, "string", e);
      return e;
    case "number":
      if (typeof e != "number" || !Number.isFinite(e))
        throw new A(t, "number", e);
      return String(e);
    case "boolean":
      if (typeof e != "boolean") throw new A(t, "boolean", e);
      return e ? "1" : "0";
    case "json":
      try {
        return JSON.stringify(e);
      } catch {
        throw new A(t, "json", e);
      }
    default:
      throw new A(t, n, e);
  }
}
function st(e) {
  const n = /* @__PURE__ */ new Map();
  let t = !1;
  function r() {
    n.clear();
    for (const s of e.findAll())
      n.set(s.key, G(s));
    t = !0;
  }
  function a() {
    t || r();
  }
  return {
    init: r,
    /**
     * @param {string} key
     * @returns {TypedSetting['value']}
     * @throws {SettingNotFoundError}
     */
    get(s) {
      a();
      const i = n.get(s);
      if (!i) throw new V(s);
      return i.value;
    },
    /**
     * Devuelve settings agrupados por `category`:
     *   { tax: { tax_rate: 0.12, ... }, business: { ... }, ... }
     * @returns {Record<string, Record<string, TypedSetting['value']>>}
     */
    getAll() {
      a();
      const s = {};
      for (const i of n.values())
        s[i.category] || (s[i.category] = {}), s[i.category][i.key] = i.value;
      return s;
    },
    /**
     * @param {string} category
     * @returns {Record<string, TypedSetting['value']>}
     */
    getByCategory(s) {
      a();
      const i = {};
      for (const o of n.values())
        o.category === s && (i[o.key] = o.value);
      return i;
    },
    /**
     * Valida tipo, persiste y actualiza el cache. Si la key no existe en DB
     * lanza SettingNotFoundError (no creamos claves: eso va por migraciones).
     *
     * @param {string} key
     * @param {unknown} value
     * @throws {SettingNotFoundError | SettingValidationError}
     */
    set(s, i) {
      a();
      const o = n.get(s);
      if (!o) throw new V(s);
      const c = at(i, o.type, s);
      if (e.updateValue(s, c) === 0)
        throw n.delete(s), new V(s);
      const E = e.findByKey(s);
      n.set(s, G(E));
    },
    /**
     * Como set() pero crea la clave si no existe (tipo string).
     * Usar solo para keys que pueden llegar antes de su migracion.
     * @param {string} key
     * @param {string} value
     */
    upsert(s, i) {
      if (typeof i != "string") throw new A(s, "string", i);
      e.upsertValue(s, i);
      const o = e.findByKey(s);
      o && n.set(s, G(o));
    }
  };
}
function u(e) {
  return (...n) => {
    try {
      return { ok: !0, data: e(...n) };
    } catch (t) {
      const r = t && typeof t == "object" && "code" in t && typeof t.code == "string" ? t.code : "UNEXPECTED_ERROR", a = t instanceof Error ? t.message : String(t);
      return t && typeof t == "object" && "code" in t || console.error("[ipc] unexpected error:", t), { ok: !1, error: { code: r, message: a } };
    }
  };
}
function ot(e) {
  l.handle("settings:get-all", u(() => e.getAll())), l.handle("settings:get", u((n, t) => e.get(t))), l.handle("settings:get-by-category", u((n, t) => e.getByCategory(t))), l.handle("settings:set", u((n, t, r) => (e.set(t, r), !0))), l.handle("settings:upsert", u((n, t, r) => (e.upsert(t, r), !0)));
}
function it(e) {
  const n = {
    findAll: e.prepare("SELECT id, name, is_active FROM categories ORDER BY name"),
    findActive: e.prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name"),
    insert: e.prepare("INSERT INTO categories (name) VALUES (@name)"),
    update: e.prepare("UPDATE categories SET name = @name WHERE id = @id"),
    setActive: e.prepare("UPDATE categories SET is_active = @active WHERE id = @id")
  };
  return {
    /** @returns {CategoryRow[]} */
    findAll() {
      return n.findAll.all();
    },
    /** @returns {Pick<CategoryRow,'id'|'name'>[]} */
    findActive() {
      return n.findActive.all();
    },
    /** @param {string} name @returns {number} */
    create(t) {
      return Number(n.insert.run({ name: t }).lastInsertRowid);
    },
    /** @param {number} id @param {string} name */
    update(t, r) {
      n.update.run({ id: t, name: r });
    },
    /** @param {number} id @param {0|1} active */
    setActive(t, r) {
      n.setActive.run({ id: t, active: r });
    }
  };
}
function ct(e) {
  return {
    list() {
      return e.findAll();
    },
    listActive() {
      return e.findActive();
    },
    create(n) {
      const t = (n ?? "").trim();
      if (!t) throw new Error("El nombre de la categoría es requerido");
      return { id: e.create(t), name: t, is_active: 1 };
    },
    update(n, t) {
      const r = (t ?? "").trim();
      if (!r) throw new Error("El nombre de la categoría es requerido");
      e.update(n, r);
    },
    setActive(n, t) {
      e.setActive(n, t ? 1 : 0);
    }
  };
}
function dt(e) {
  l.handle("categories:list", u(() => e.list())), l.handle("categories:list-active", u(() => e.listActive())), l.handle("categories:create", u((n, t) => e.create(t))), l.handle("categories:update", u((n, t, r) => e.update(t, r))), l.handle("categories:set-active", u((n, t, r) => e.setActive(t, r)));
}
const k = "id, code, name, price, stock, category, brand, location, condition, min_stock, is_active";
function lt(e) {
  const n = {
    selectAll: e.prepare(
      `SELECT ${k} FROM products ORDER BY name`
    ),
    selectActive: e.prepare(
      `SELECT ${k} FROM products WHERE is_active = 1 ORDER BY name`
    ),
    selectById: e.prepare(
      `SELECT ${k} FROM products WHERE id = ?`
    ),
    search: e.prepare(
      `SELECT ${k} FROM products
        WHERE (name LIKE ? OR code LIKE ? OR category LIKE ?)
        ORDER BY name`
    ),
    insert: e.prepare(
      `INSERT INTO products (code, name, price, stock, category, brand, location, condition, min_stock, is_active)
       VALUES (@code, @name, @price, @stock, @category, @brand, @location, @condition, @min_stock, 1)`
    ),
    update: e.prepare(
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
    setActive: e.prepare(
      "UPDATE products SET is_active = @active WHERE id = @id"
    ),
    adjustStock: e.prepare(
      "UPDATE products SET stock = MAX(0, stock + @delta) WHERE id = @id"
    )
  };
  return {
    /** @returns {ProductRow[]} */
    findAll() {
      return n.selectAll.all();
    },
    /** @returns {ProductRow[]} */
    findActive() {
      return n.selectActive.all();
    },
    /**
     * @param {number} id
     * @returns {ProductRow | undefined}
     */
    findById(t) {
      return n.selectById.get(t);
    },
    /**
     * @param {string} query
     * @returns {ProductRow[]}
     */
    search(t) {
      const r = `%${t}%`;
      return n.search.all(r, r, r);
    },
    /**
     * @param {{ code: string, name: string, price: number, stock: number,
     *           category: string, brand: string, location: string,
     *           condition: string, min_stock: number }} data
     * @returns {number} new id
     */
    create(t) {
      const r = n.insert.run(t);
      return Number(r.lastInsertRowid);
    },
    /**
     * @param {number} id
     * @param {{ name: string, price: number, category: string, brand: string,
     *           location: string, condition: string, min_stock: number }} data
     */
    update(t, r) {
      n.update.run({ ...r, id: t });
    },
    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(t, r) {
      n.setActive.run({ id: t, active: r });
    },
    /**
     * @param {number} id
     * @param {number} delta  positive = entrada, negative = salida
     */
    adjustStock(t, r) {
      n.adjustStock.run({ id: t, delta: r });
    }
  };
}
function ut(e) {
  function n(r) {
    if (!Number.isInteger(r) || r <= 0)
      throw Object.assign(new Error(`product id invalido: ${r}`), {
        code: "PRODUCT_INVALID_ID"
      });
  }
  function t(r) {
    n(r);
    const a = e.findById(r);
    if (!a)
      throw Object.assign(new Error(`producto no encontrado: ${r}`), {
        code: "PRODUCT_NOT_FOUND"
      });
    return a;
  }
  return {
    /** Todos los productos (activos e inactivos). */
    list() {
      return e.findAll();
    },
    /** Solo los productos activos (para POS y búsqueda rápida). */
    listActive() {
      return e.findActive();
    },
    /** @param {string} query */
    search(r) {
      const a = typeof r == "string" ? r.trim() : "";
      return a.length === 0 ? e.findActive() : e.search(a);
    },
    /** @param {number} id */
    getById(r) {
      return n(r), e.findById(r) ?? null;
    },
    /** @param {ProductInput} input */
    create(r) {
      const a = (r.code ?? "").trim(), s = (r.name ?? "").trim();
      if (!a) throw Object.assign(new Error("code requerido"), { code: "PRODUCT_MISSING_CODE" });
      if (!s) throw Object.assign(new Error("name requerido"), { code: "PRODUCT_MISSING_NAME" });
      const i = Number(r.price);
      if (!Number.isFinite(i) || i < 0)
        throw Object.assign(new Error("price invalido"), { code: "PRODUCT_INVALID_PRICE" });
      const o = e.create({
        code: a,
        name: s,
        price: i,
        stock: Math.max(0, Math.round(Number(r.stock) || 0)),
        category: (r.category ?? "General").trim() || "General",
        brand: (r.brand ?? "").trim(),
        location: (r.location ?? "").trim(),
        condition: (r.condition ?? "Nuevo").trim() || "Nuevo",
        min_stock: Math.max(0, Math.round(Number(r.min_stock) || 5))
      });
      return e.findById(o);
    },
    /**
     * @param {number} id
     * @param {ProductPatch} patch
     */
    update(r, a) {
      const s = t(r), i = (a.name ?? s.name).trim();
      if (!i) throw Object.assign(new Error("name requerido"), { code: "PRODUCT_MISSING_NAME" });
      const o = a.price !== void 0 ? Number(a.price) : s.price;
      if (!Number.isFinite(o) || o < 0)
        throw Object.assign(new Error("price invalido"), { code: "PRODUCT_INVALID_PRICE" });
      return e.update(r, {
        name: i,
        price: o,
        category: (a.category ?? s.category ?? "General").trim() || "General",
        brand: (a.brand ?? s.brand ?? "").trim(),
        location: (a.location ?? s.location ?? "").trim(),
        condition: (a.condition ?? s.condition ?? "Nuevo").trim() || "Nuevo",
        min_stock: a.min_stock !== void 0 ? Math.max(0, Math.round(Number(a.min_stock))) : s.min_stock
      }), e.findById(r);
    },
    /** Soft-delete: marca is_active = 0. @param {number} id */
    remove(r) {
      t(r), e.setActive(r, 0);
    },
    /** Reactiva un producto. @param {number} id */
    restore(r) {
      t(r), e.setActive(r, 1);
    },
    /**
     * Registra un movimiento de stock.
     * @param {number} id
     * @param {'entry'|'exit'} type
     * @param {number} qty
     */
    adjustStock(r, a, s) {
      t(r);
      const i = Math.round(Number(s));
      if (!Number.isFinite(i) || i <= 0)
        throw Object.assign(new Error("qty invalido"), { code: "PRODUCT_INVALID_QTY" });
      const o = a === "entry" ? i : -i;
      return e.adjustStock(r, o), e.findById(r);
    }
  };
}
function Et(e) {
  l.handle("products:list", u(() => e.list())), l.handle("products:list-active", u(() => e.listActive())), l.handle("products:search", u((n, t) => e.search(t))), l.handle("products:get-by-id", u((n, t) => e.getById(t))), l.handle("products:create", u((n, t) => e.create(t))), l.handle("products:update", u((n, t, r) => e.update(t, r))), l.handle("products:remove", u((n, t) => e.remove(t))), l.handle("products:restore", u((n, t) => e.restore(t))), l.handle("products:adjust-stock", u((n, t, r, a) => e.adjustStock(t, r, a)));
}
const h = "id, nit, name, email, phone, address, active, created_at, updated_at";
function mt(e) {
  const n = {
    selectAllActive: e.prepare(`SELECT ${h} FROM customers WHERE active = 1 ORDER BY name`),
    selectAllAny: e.prepare(`SELECT ${h} FROM customers ORDER BY name`),
    selectById: e.prepare(`SELECT ${h} FROM customers WHERE id = ?`),
    searchActive: e.prepare(
      `SELECT ${h} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?) AND active = 1
     ORDER BY name
        LIMIT 50`
    ),
    searchAny: e.prepare(
      `SELECT ${h} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?)
     ORDER BY name
        LIMIT 50`
    ),
    selectByNit: e.prepare(`SELECT ${h} FROM customers WHERE nit = ?`),
    insert: e.prepare(
      `INSERT INTO customers (nit, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    ),
    setActive: e.prepare(
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
    findAll(t = {}) {
      return (t.includeInactive ? n.selectAllAny : n.selectAllActive).all();
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | undefined}
     */
    findById(t) {
      return n.selectById.get(t);
    },
    /**
     * @param {string} nit
     * @returns {CustomerRow | undefined}
     */
    findByNit(t) {
      return n.selectByNit.get(t);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(t, r = {}) {
      const a = `%${t}%`;
      return (r.includeInactive ? n.searchAny : n.searchActive).all(a, a);
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {number|bigint} id insertado
     */
    insert(t) {
      return n.insert.run(
        t.nit,
        t.name,
        t.email ?? null,
        t.phone ?? null,
        t.address ?? null
      ).lastInsertRowid;
    },
    /**
     * UPDATE dinamico. Solo toca las columnas provistas en `patch` — evita
     * sobrescribir con undefined y requiere una unica sentencia por forma.
     *
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {number} rows affected
     */
    update(t, r) {
      const a = [], s = [];
      for (const [c, d] of Object.entries(r))
        d !== void 0 && (a.push(`${c} = ?`), s.push(d));
      if (a.length === 0) return 0;
      a.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
      const i = `UPDATE customers SET ${a.join(", ")} WHERE id = ?`;
      return s.push(t), e.prepare(i).run(...s).changes;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     * @returns {number} rows affected
     */
    setActive(t, r) {
      return n.setActive.run(r ? 1 : 0, t).changes;
    }
  };
}
class le extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(n, t) {
    super(t), this.name = "CustomerError", this.code = n;
  }
}
class H extends le {
  /** @param {number} id */
  constructor(n) {
    super("CUSTOMER_NOT_FOUND", `Cliente no encontrado: #${n}`), this.id = n;
  }
}
class f extends le {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(n, t) {
    super("CUSTOMER_INVALID", `${n}: ${t}`), this.field = n;
  }
}
const _t = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function ne(e) {
  const n = (e ?? "").trim().toUpperCase();
  return n.length === 0 ? "C/F" : n;
}
function re(e) {
  if (typeof e != "string" || e.trim().length < 2)
    throw new f("name", "nombre requerido (minimo 2 caracteres)");
}
function ae(e) {
  if (!(e == null || e === "") && !_t.test(e))
    throw new f("email", "formato de email invalido");
}
function Tt(e) {
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    list(n = {}) {
      return e.findAll(n);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(n, t = {}) {
      const r = typeof n == "string" ? n.trim() : "";
      return r.length === 0 ? e.findAll(t) : e.search(r, t);
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | null}
     */
    getById(n) {
      if (!Number.isInteger(n) || n <= 0)
        throw new f("id", `id invalido: ${n}`);
      return e.findById(n) ?? null;
    },
    /**
     * Version "throw on not found" usada internamente por sales.service.create
     * cuando necesita snapshot garantizado (el POS ya seleccionó un cliente).
     *
     * @param {number} id
     * @returns {CustomerRow}
     * @throws {CustomerNotFoundError}
     */
    requireById(n) {
      const t = e.findById(n);
      if (!t) throw new H(n);
      return t;
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {CustomerRow}
     */
    create(n) {
      var i, o, c;
      re(n.name), ae(n.email);
      const t = ne(n.nit);
      if (t !== "C/F" && e.findByNit(t))
        throw new f("nit", `El NIT ${t} ya esta registrado`);
      const r = e.insert({
        nit: t,
        name: n.name.trim(),
        email: ((i = n.email) == null ? void 0 : i.trim()) || null,
        phone: ((o = n.phone) == null ? void 0 : o.trim()) || null,
        address: ((c = n.address) == null ? void 0 : c.trim()) || null
      }), a = typeof r == "bigint" ? Number(r) : r, s = e.findById(a);
      if (!s) throw new Error("Cliente recien insertado no encontrado (race imposible)");
      return s;
    },
    /**
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {CustomerRow}
     */
    update(n, t) {
      var o, c, d;
      if (!Number.isInteger(n) || n <= 0)
        throw new f("id", `id invalido: ${n}`);
      if (n === 1)
        throw new f("id", 'No se puede editar "Consumidor Final"');
      t.name !== void 0 && re(t.name), t.email !== void 0 && ae(t.email);
      const r = t.nit !== void 0 ? ne(t.nit) : void 0;
      if (r && r !== "C/F") {
        const E = e.findByNit(r);
        if (E && E.id !== n)
          throw new f("nit", `El NIT ${r} ya esta registrado en otro cliente`);
      }
      const a = {};
      if (r !== void 0 && (a.nit = r), t.name !== void 0 && (a.name = t.name.trim()), t.email !== void 0 && (a.email = ((o = t.email) == null ? void 0 : o.trim()) || null), t.phone !== void 0 && (a.phone = ((c = t.phone) == null ? void 0 : c.trim()) || null), t.address !== void 0 && (a.address = ((d = t.address) == null ? void 0 : d.trim()) || null), t.active !== void 0 && (a.active = t.active ? 1 : 0), e.update(n, a) === 0) throw new H(n);
      const i = e.findById(n);
      if (!i) throw new H(n);
      return i;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(n, t) {
      if (!Number.isInteger(n) || n <= 0)
        throw new f("id", `id invalido: ${n}`);
      if (n === 1)
        throw new f("id", 'No se puede desactivar "Consumidor Final"');
      if (e.setActive(n, t) === 0) throw new H(n);
      return !0;
    }
  };
}
function pt(e) {
  l.handle("customers:list", u((n, t) => e.list(t))), l.handle("customers:search", u((n, t, r) => e.search(t, r))), l.handle("customers:get-by-id", u((n, t) => e.getById(t))), l.handle("customers:create", u((n, t) => e.create(t))), l.handle("customers:update", u((n, t, r) => e.update(t, r))), l.handle("customers:set-active", u((n, t, r) => e.setActive(t, r)));
}
const se = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot,
  payment_method, client_type, status,
  discount_type, discount_value, discount_amount
`;
function Nt(e) {
  const n = {
    insertSale: e.prepare(
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
    insertItem: e.prepare(
      "INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)"
    ),
    updateStock: e.prepare("UPDATE products SET stock = stock - ? WHERE id = ?"),
    selectById: e.prepare(`SELECT ${se} FROM sales WHERE id = ?`),
    /**
     * LEFT JOIN a products para mostrar nombre/codigo actuales. NO es
     * snapshot; para el snapshot real a nivel linea, agregar columnas
     * product_code_snapshot/product_name_snapshot a sale_items en migracion
     * futura. Hoy vive como deuda conocida.
     */
    selectItems: e.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
     ORDER BY si.id ASC`
    ),
    findPageFiltered: e.prepare(`
      SELECT ${se}
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset
    `),
    countFiltered: e.prepare(`
      SELECT COUNT(*) AS total
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
    `),
    dailySummary: e.prepare(`
      SELECT
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(subtotal), 0)        AS subtotal,
        COALESCE(SUM(tax_amount), 0)      AS tax_amount,
        COALESCE(SUM(total), 0)           AS total,
        currency_code
      FROM sales
      WHERE date(date) = date('now', 'localtime')
      GROUP BY currency_code
    `),
    markVoided: e.prepare(
      "UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'active'"
    ),
    insertVoid: e.prepare(
      "INSERT INTO sale_voids (sale_id, reason, voided_by) VALUES (?, ?, ?)"
    ),
    restoreStock: e.prepare(
      "UPDATE products SET stock = stock + ? WHERE id = ?"
    ),
    getProductForMove: e.prepare(
      "SELECT id, name, stock FROM products WHERE id = ?"
    ),
    insertMovement: e.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    topProducts: e.prepare(`
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
    salesByDate: e.prepare(`
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
    topProductsRange: e.prepare(`
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
    salesByHour: e.prepare(`
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
    salesByWeekday: e.prepare(`
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
    salesByPaymentMethod: e.prepare(`
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
    salesByCashier: e.prepare(`
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
  return {
    insertSale: e.transaction((r) => {
      const s = n.insertSale.run(
        r.total,
        r.subtotal,
        r.taxRate,
        r.taxAmount,
        r.currencyCode,
        r.customerId,
        r.customerNameSnapshot,
        r.customerNitSnapshot,
        r.paymentMethod ?? "cash",
        r.clientType ?? "cf",
        r.discountType ?? "none",
        r.discountValue ?? 0,
        r.discountAmount ?? 0,
        r.userId ?? null,
        r.userName ?? null
      ).lastInsertRowid;
      for (const i of r.items) {
        const o = n.getProductForMove.get(i.id), c = (o == null ? void 0 : o.stock) ?? 0;
        n.insertItem.run(s, i.id, i.qty, i.price), n.updateStock.run(i.qty, i.id), n.insertMovement.run({
          product_id: i.id,
          product_name: (o == null ? void 0 : o.name) ?? "",
          type: "sale",
          qty: i.qty,
          qty_before: c,
          qty_after: c - i.qty,
          reference_type: "sale",
          reference_id: s,
          notes: null,
          created_by: null,
          created_by_name: null
        });
      }
      return s;
    }),
    /**
     * Anula una venta en transacción: marca status='voided', registra en
     * sale_voids y devuelve el stock de cada item.
     * @param {VoidInput} input
     * @param {import('../sales/sales.repository.js').SaleItemRow[]} items
     * @returns {boolean} true si se anuló, false si ya estaba anulada
     */
    voidSale: e.transaction((r, a) => {
      if (n.markVoided.run(r.saleId).changes === 0) return !1;
      n.insertVoid.run(r.saleId, r.reason, r.userId ?? null);
      for (const i of a) {
        const o = n.getProductForMove.get(i.product_id), c = (o == null ? void 0 : o.stock) ?? 0;
        n.restoreStock.run(i.qty, i.product_id), n.insertMovement.run({
          product_id: i.product_id,
          product_name: (o == null ? void 0 : o.name) ?? i.product_name ?? "",
          type: "in",
          qty: i.qty,
          qty_before: c,
          qty_after: c + i.qty,
          reference_type: "sale_void",
          reference_id: r.saleId,
          notes: `Anulación venta #${r.saleId}`,
          created_by: null,
          created_by_name: null
        });
      }
      return !0;
    }),
    /**
     * @param {number} id
     * @returns {SaleRow | undefined}
     */
    findSaleById(r) {
      return n.selectById.get(r);
    },
    /**
     * @param {number} saleId
     * @returns {SaleItemRow[]}
     */
    findSaleItems(r) {
      return n.selectItems.all(r);
    },
    /**
     * @param {{ limit: number, offset: number, search?: string|null, from?: string|null, to?: string|null, status?: string|null }} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit: r, offset: a, search: s = null, from: i = null, to: o = null, status: c = null }) {
      return n.findPageFiltered.all({ limit: r, offset: a, search: s, from: i, to: o, status: c });
    },
    /** @param {{ search?: string|null, from?: string|null, to?: string|null, status?: string|null }} [opts] */
    countAll({ search: r = null, from: a = null, to: s = null, status: i = null } = {}) {
      return /** @type {{ total: number }} */ n.countFiltered.get({ search: r, from: a, to: s, status: i }).total;
    },
    /**
     * Resumen del día actual (fecha local del servidor/electron).
     * @returns {{ sale_count: number, subtotal: number, tax_amount: number, total: number, currency_code: string } | null}
     */
    getDailySummary() {
      return (
        /** @type {any} */
        n.dailySummary.get() ?? null
      );
    },
    /**
     * Top 5 productos vendidos hoy por unidades.
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProducts() {
      return (
        /** @type {any[]} */
        n.topProducts.all()
      );
    },
    /**
     * Ventas agrupadas por día en un rango de fechas.
     * @param {{ from: string, to: string }} range  Fechas en formato YYYY-MM-DD
     * @returns {{ day: string, sale_count: number, subtotal: number, total: number }[]}
     */
    getSalesByDate({ from: r, to: a }) {
      return (
        /** @type {any[]} */
        n.salesByDate.all({ from: r, to: a })
      );
    },
    /**
     * Top 10 productos por unidades vendidas en un rango.
     * @param {{ from: string, to: string }} range
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProductsRange({ from: r, to: a }) {
      return (
        /** @type {any[]} */
        n.topProductsRange.all({ from: r, to: a })
      );
    },
    /**
     * Ventas agrupadas por hora del día (0-23).
     * @param {{ from: string, to: string }} range
     * @returns {{ hour: number, sale_count: number, total: number }[]}
     */
    getSalesByHour({ from: r, to: a }) {
      return (
        /** @type {any[]} */
        n.salesByHour.all({ from: r, to: a })
      );
    },
    /**
     * Ventas agrupadas por día de semana (0=Dom … 6=Sáb).
     * @param {{ from: string, to: string }} range
     * @returns {{ weekday: number, sale_count: number, total: number }[]}
     */
    getSalesByWeekday({ from: r, to: a }) {
      return (
        /** @type {any[]} */
        n.salesByWeekday.all({ from: r, to: a })
      );
    },
    /**
     * Ventas agrupadas por método de pago.
     * @param {{ from: string, to: string }} range
     * @returns {{ method: string, sale_count: number, total: number }[]}
     */
    getSalesByPaymentMethod({ from: r, to: a }) {
      return (
        /** @type {any[]} */
        n.salesByPaymentMethod.all({ from: r, to: a })
      );
    },
    /**
     * Ventas agrupadas por cajero (usuario que registró la venta).
     * @param {{ from: string, to: string }} range
     * @returns {any[]}
     */
    getSalesByCashier({ from: r, to: a }) {
      return (
        /** @type {any[]} */
        n.salesByCashier.all({ from: r, to: a })
      );
    }
  };
}
const Rt = 200, It = 1;
function St(e) {
  if (!e || !Array.isArray(e.items) || e.items.length === 0)
    throw Object.assign(new Error("La venta debe contener al menos un item"), {
      code: "SALE_EMPTY"
    });
  for (const n of e.items) {
    if (!Number.isInteger(n.id) || n.id <= 0)
      throw Object.assign(new Error(`product_id invalido: ${n.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    if (!Number.isInteger(n.qty) || n.qty <= 0)
      throw Object.assign(new Error(`qty invalida para producto ${n.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    if (!Number.isFinite(n.price) || n.price < 0)
      throw Object.assign(new Error(`price invalido para producto ${n.id}`), {
        code: "SALE_INVALID_ITEM"
      });
  }
  if (e.customerId !== void 0 && (!Number.isInteger(e.customerId) || e.customerId <= 0))
    throw Object.assign(new Error(`customer_id invalido: ${e.customerId}`), {
      code: "SALE_INVALID_CUSTOMER"
    });
}
function Ot(e, n, t, r) {
  const a = Math.pow(10, r), s = (d) => Math.round(d * a) / a;
  if (t) {
    const d = s(e), E = s(d - d / (1 + n));
    return { subtotal: s(d - E), taxAmount: E, total: d };
  }
  const i = s(e), o = s(i * n), c = s(i + o);
  return { subtotal: i, taxAmount: o, total: c };
}
function ft(e, n, t, r) {
  return {
    /**
     * @param {SaleInput} input
     * @returns {SaleCreatedResult}
     */
    create(a) {
      St(a);
      const s = (
        /** @type {number} */
        n.get("tax_rate")
      ), i = (
        /** @type {boolean} */
        n.get("tax_included_in_price")
      ), o = (
        /** @type {string} */
        n.get("currency_code")
      ), c = (
        /** @type {number} */
        n.get("decimal_places")
      );
      let d = !1;
      try {
        d = /** @type {boolean} */
        n.get("tax_enabled");
      } catch {
      }
      const E = a.customerId ?? It, m = t.requireById(E), _ = a.items.reduce((D, F) => D + F.price * F.qty, 0), N = a.discountType ?? "none", T = a.discountValue ?? 0, p = Math.pow(10, c), R = (D) => Math.round(D * p) / p;
      let g = 0;
      N === "percent" && T > 0 ? g = R(_ * (T / 100)) : N === "fixed" && T > 0 && (g = R(Math.min(T, _)));
      const U = R(Math.max(0, _ - g)), { subtotal: M, taxAmount: B, total: b } = d ? Ot(U, s, i, c) : { subtotal: U, taxAmount: 0, total: U }, C = e.insertSale({
        items: a.items,
        subtotal: M,
        taxRate: s,
        taxAmount: B,
        total: b,
        currencyCode: o,
        customerId: E,
        customerNameSnapshot: m.name,
        customerNitSnapshot: m.nit,
        paymentMethod: a.paymentMethod ?? "cash",
        clientType: a.clientType ?? "cf",
        discountType: N,
        discountValue: T,
        discountAmount: g,
        userId: a.userId,
        userName: a.userName
      });
      return {
        saleId: typeof C == "bigint" ? Number(C) : C,
        subtotal: M,
        taxRate: s,
        taxAmount: B,
        total: b,
        currencyCode: o,
        customerId: E,
        customerName: m.name,
        customerNit: m.nit
      };
    },
    /**
     * @param {number} id
     * @returns {SaleWithItems | null}
     */
    getById(a) {
      if (!Number.isInteger(a) || a <= 0)
        throw Object.assign(new Error(`sale id invalido: ${a}`), { code: "SALE_INVALID_ID" });
      const s = e.findSaleById(a);
      if (!s) return null;
      const i = e.findSaleItems(a);
      return { ...s, items: i };
    },
    /**
     * @param {{ page?: number, pageSize?: number }} [opts]
     * @returns {SaleListResult}
     */
    list(a = {}) {
      var N, T, p, R;
      const s = Number.isInteger(a.page) && /** @type {number} */
      a.page > 0 ? (
        /** @type {number} */
        a.page
      ) : 1, i = Number.isInteger(a.pageSize) && /** @type {number} */
      a.pageSize > 0 ? (
        /** @type {number} */
        a.pageSize
      ) : 50, o = Math.min(i, Rt), c = (s - 1) * o, d = ((N = a.search) == null ? void 0 : N.trim()) || null, E = ((T = a.from) == null ? void 0 : T.trim()) || null, m = ((p = a.to) == null ? void 0 : p.trim()) || null, _ = ((R = a.status) == null ? void 0 : R.trim()) || null;
      return {
        data: e.findPage({ limit: o, offset: c, search: d, from: E, to: m, status: _ }),
        total: e.countAll({ search: d, from: E, to: m, status: _ }),
        page: s,
        pageSize: o
      };
    },
    /**
     * Anula una venta, restaura stock y registra en bitácora.
     * @param {{ saleId: number, reason: string, userId?: number, userName?: string }} input
     */
    voidSale(a) {
      if (!Number.isInteger(a.saleId) || a.saleId <= 0)
        throw Object.assign(new Error(`sale id invalido: ${a.saleId}`), { code: "SALE_INVALID_ID" });
      if (!a.reason || a.reason.trim().length < 5)
        throw Object.assign(new Error("El motivo debe tener al menos 5 caracteres"), { code: "VOID_REASON_REQUIRED" });
      const s = e.findSaleById(a.saleId);
      if (!s)
        throw Object.assign(new Error(`Venta ${a.saleId} no encontrada`), { code: "SALE_NOT_FOUND" });
      if (s.status === "voided")
        throw Object.assign(new Error(`La venta ${a.saleId} ya está anulada`), { code: "SALE_ALREADY_VOIDED" });
      const i = e.findSaleItems(a.saleId), o = e.voidSale(
        { saleId: a.saleId, reason: a.reason.trim(), userId: a.userId },
        i
      );
      return o && (r == null || r.log({
        action: "sale_voided",
        entity: "sale",
        entityId: a.saleId,
        description: `Venta #${a.saleId} anulada. Motivo: ${a.reason.trim()}`,
        payload: { total: s.total, customer: s.customer_name_snapshot, reason: a.reason.trim() },
        userId: a.userId,
        userName: a.userName
      })), { voided: o, saleId: a.saleId };
    },
    /** Reporte del día: totales + top 5 productos. */
    dailyReport() {
      return {
        summary: e.getDailySummary(),
        topProducts: e.getTopProducts()
      };
    },
    /**
     * Reporte de ventas por rango de fechas: serie diaria, top productos,
     * horarios concurridos, días de semana y métodos de pago.
     * @param {{ from: string, to: string }} range  Formato YYYY-MM-DD
     */
    rangeReport({ from: a, to: s }) {
      if (!a || !s || a > s)
        throw Object.assign(new Error("Rango de fechas inválido"), { code: "INVALID_DATE_RANGE" });
      return {
        series: e.getSalesByDate({ from: a, to: s }),
        topProducts: e.getTopProductsRange({ from: a, to: s }),
        byHour: e.getSalesByHour({ from: a, to: s }),
        byWeekday: e.getSalesByWeekday({ from: a, to: s }),
        byPaymentMethod: e.getSalesByPaymentMethod({ from: a, to: s }),
        byCashier: e.getSalesByCashier({ from: a, to: s })
      };
    }
  };
}
function At(e) {
  l.handle("sales:create", u((n, t) => e.create(t))), l.handle("sales:get-by-id", u((n, t) => e.getById(t))), l.handle("sales:list", u((n, t) => e.list(t))), l.handle("sales:daily-report", u(() => e.dailyReport())), l.handle("sales:void", u((n, t) => e.voidSale(t))), l.handle("sales:range-report", u((n, t) => e.rangeReport(t)));
}
const oe = "id, email, full_name, role, active, avatar, created_at, updated_at", yt = "id, email, full_name, role, password_hash, active, avatar, created_at, updated_at";
function Lt(e) {
  const n = {
    findAll: e.prepare(
      `SELECT ${oe} FROM users ORDER BY role, full_name`
    ),
    findById: e.prepare(
      `SELECT ${oe} FROM users WHERE id = ?`
    ),
    findByEmail: e.prepare(
      `SELECT ${yt} FROM users WHERE email = ? COLLATE NOCASE`
    ),
    insert: e.prepare(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES (@email, @full_name, @role, @password_hash)`
    ),
    update: e.prepare(
      `UPDATE users
          SET full_name  = @full_name,
              role       = @role,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updateAvatar: e.prepare(
      `UPDATE users
          SET avatar     = @avatar,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updatePassword: e.prepare(
      `UPDATE users
          SET password_hash = @password_hash,
              updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    setActive: e.prepare(
      `UPDATE users
          SET active     = @active,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    )
  };
  return {
    /** @returns {Omit<UserRow, 'password_hash'>[]} */
    findAll() {
      return n.findAll.all();
    },
    /**
     * @param {number} id
     * @returns {Omit<UserRow, 'password_hash'> | undefined}
     */
    findById(t) {
      return n.findById.get(t);
    },
    /**
     * Incluye password_hash — solo para login.
     * @param {string} email
     * @returns {UserRow | undefined}
     */
    findByEmailWithHash(t) {
      return n.findByEmail.get(t);
    },
    /**
     * @param {{ email: string, full_name: string, role: string, password_hash: string }} data
     * @returns {number}
     */
    create(t) {
      return Number(n.insert.run(t).lastInsertRowid);
    },
    /**
     * @param {number} id
     * @param {{ full_name: string, role: string }} data
     */
    update(t, r) {
      n.update.run({ ...r, id: t });
    },
    /**
     * @param {number} id
     * @param {string} password_hash
     */
    updatePassword(t, r) {
      n.updatePassword.run({ id: t, password_hash: r });
    },
    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL o null para borrar
     */
    updateAvatar(t, r) {
      n.updateAvatar.run({ id: t, avatar: r ?? null });
    },
    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(t, r) {
      n.setActive.run({ id: t, active: r });
    }
  };
}
const ie = (
  /** @type {const} */
  ["admin", "cashier", "mechanic", "warehouse"]
);
function W(e) {
  return Ue("sha256").update(e).digest("hex");
}
function gt(e) {
  function n(r) {
    if (!Number.isInteger(r) || r <= 0)
      throw Object.assign(new Error(`user id invalido: ${r}`), { code: "USER_INVALID_ID" });
  }
  function t(r) {
    n(r);
    const a = e.findById(r);
    if (!a) throw Object.assign(new Error(`usuario no encontrado: ${r}`), { code: "USER_NOT_FOUND" });
    return a;
  }
  return {
    /** Lista todos los usuarios sin exponer password_hash. */
    list() {
      return e.findAll();
    },
    /** @param {number} id */
    getById(r) {
      return n(r), e.findById(r) ?? null;
    },
    /**
     * Login: valida credenciales y devuelve el usuario sin hash.
     * @param {string} email
     * @param {string} password
     */
    login(r, a) {
      if (!r || !a)
        throw Object.assign(new Error("Email y contraseña requeridos"), { code: "AUTH_MISSING_FIELDS" });
      const s = e.findByEmailWithHash(r.trim());
      if (!s)
        throw Object.assign(new Error("Credenciales incorrectas"), { code: "AUTH_INVALID" });
      if (s.active === 0)
        throw Object.assign(new Error("Usuario desactivado"), { code: "AUTH_INACTIVE" });
      if (s.password_hash !== W(a))
        throw Object.assign(new Error("Credenciales incorrectas"), { code: "AUTH_INVALID" });
      const { password_hash: i, ...o } = s;
      return o;
    },
    /**
     * @param {{ email: string, full_name: string, role: string, password: string }} input
     */
    create(r) {
      const a = (r.email ?? "").trim().toLowerCase(), s = (r.full_name ?? "").trim(), i = r.role;
      if (!a) throw Object.assign(new Error("Email requerido"), { code: "USER_MISSING_EMAIL" });
      if (!s) throw Object.assign(new Error("Nombre requerido"), { code: "USER_MISSING_NAME" });
      if (!ie.includes(
        /** @type {any} */
        i
      ))
        throw Object.assign(new Error(`Rol invalido: ${i}`), { code: "USER_INVALID_ROLE" });
      if (!r.password || r.password.length < 6)
        throw Object.assign(new Error("Contraseña minimo 6 caracteres"), { code: "USER_WEAK_PASSWORD" });
      if (e.findByEmailWithHash(a)) throw Object.assign(new Error("El email ya está en uso"), { code: "USER_EMAIL_TAKEN" });
      const c = e.create({ email: a, full_name: s, role: i, password_hash: W(r.password) });
      return e.findById(c);
    },
    /**
     * @param {number} id
     * @param {{ full_name?: string, role?: string }} patch
     */
    update(r, a) {
      const s = t(r), i = (a.full_name ?? s.full_name).trim(), o = a.role ?? s.role;
      if (!i) throw Object.assign(new Error("Nombre requerido"), { code: "USER_MISSING_NAME" });
      if (!ie.includes(
        /** @type {any} */
        o
      ))
        throw Object.assign(new Error(`Rol invalido: ${o}`), { code: "USER_INVALID_ROLE" });
      if (s.role === "admin" && o !== "admin" && e.findAll().filter((d) => d.role === "admin" && d.active === 1).length <= 1)
        throw Object.assign(new Error("Debe existir al menos un administrador activo"), { code: "USER_LAST_ADMIN" });
      return e.update(r, { full_name: i, role: o }), e.findById(r);
    },
    /**
     * @param {number} id
     * @param {string} newPassword
     */
    changePassword(r, a) {
      if (t(r), !a || a.length < 6)
        throw Object.assign(new Error("Contraseña minimo 6 caracteres"), { code: "USER_WEAK_PASSWORD" });
      return e.updatePassword(r, W(a)), e.findById(r);
    },
    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL (max ~300 KB) o null
     */
    updateAvatar(r, a) {
      if (t(r), a !== null && typeof a != "string")
        throw Object.assign(new Error("Avatar invalido"), { code: "USER_INVALID_AVATAR" });
      if (a && a.length > 4e5)
        throw Object.assign(new Error("Imagen demasiado grande (max 300 KB)"), { code: "USER_AVATAR_TOO_LARGE" });
      return e.updateAvatar(r, a), e.findById(r);
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(r, a) {
      const s = t(r);
      if (!a && s.role === "admin" && e.findAll().filter((o) => o.role === "admin" && o.active === 1).length <= 1)
        throw Object.assign(new Error("Debe existir al menos un administrador activo"), { code: "USER_LAST_ADMIN" });
      return e.setActive(r, a ? 1 : 0), e.findById(r);
    }
  };
}
function ht(e) {
  l.handle("users:login", u((n, t, r) => e.login(t, r))), l.handle("users:list", u(() => e.list())), l.handle("users:get-by-id", u((n, t) => e.getById(t))), l.handle("users:create", u((n, t) => e.create(t))), l.handle("users:update", u((n, t, r) => e.update(t, r))), l.handle("users:change-password", u((n, t, r) => e.changePassword(t, r))), l.handle("users:set-active", u((n, t, r) => e.setActive(t, r))), l.handle("users:update-avatar", u((n, t, r) => e.updateAvatar(t, r)));
}
const Ut = 200;
function bt(e) {
  const n = {
    insert: e.prepare(`
      INSERT INTO audit_log (action, entity, entity_id, description, payload_json, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    selectPage: e.prepare(`
      SELECT id, action, entity, entity_id, description, payload_json, user_id, user_name, created_at
      FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
      ORDER BY id DESC
      LIMIT :limit OFFSET :offset
    `),
    countFiltered: e.prepare(`
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
    log(t) {
      n.insert.run(
        t.action,
        t.entity ?? null,
        t.entityId ?? null,
        t.description ?? null,
        t.payload ? JSON.stringify(t.payload) : null,
        t.userId ?? null,
        t.userName ?? null
      );
    },
    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     * @returns {{ data: AuditRow[], total: number, page: number, pageSize: number }}
     */
    findPage(t = {}) {
      const r = t.page ?? 1, a = Math.min(t.pageSize ?? 50, Ut), s = (r - 1) * a, i = {
        action: t.action ?? null,
        entity: t.entity ?? null,
        from: t.from ?? null,
        to: t.to ?? null,
        limit: a,
        offset: s
      }, o = (
        /** @type {AuditRow[]} */
        n.selectPage.all(i)
      ), c = (
        /** @type {{ total: number }} */
        n.countFiltered.get(i).total
      );
      return { data: o, total: c, page: r, pageSize: a };
    }
  };
}
function Ct(e) {
  return {
    /**
     * @param {import('./audit.repository.js').AuditEntry} entry
     */
    log(n) {
      e.log(n);
    },
    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     */
    list(n = {}) {
      return e.findPage(n);
    }
  };
}
function Dt(e) {
  l.handle("audit:list", u((n, t) => e.list(t)));
}
function wt(e) {
  const n = {
    findOpen: e.prepare(
      "SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1"
    ),
    findById: e.prepare(
      "SELECT * FROM cash_sessions WHERE id = ?"
    ),
    findAll: e.prepare(
      "SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 100"
    ),
    insert: e.prepare(
      `INSERT INTO cash_sessions (opened_by, opened_by_name, opening_amount)
       VALUES (@opened_by, @opened_by_name, @opening_amount)`
    ),
    close: e.prepare(
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
    movementsForSession: e.prepare(
      "SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC"
    ),
    insertMovement: e.prepare(
      `INSERT INTO cash_movements (session_id, type, amount, concept, created_by)
       VALUES (@session_id, @type, @amount, @concept, @created_by)`
    ),
    salesTotalForSession: e.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND date >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR date < ?)`
      // closed_at o NULL si está abierta
    )
  };
  return {
    /** @returns {CashSessionRow|undefined} */
    findOpen() {
      return n.findOpen.get();
    },
    /** @param {number} id @returns {CashSessionRow|undefined} */
    findById(t) {
      return n.findById.get(t);
    },
    /** @returns {CashSessionRow[]} */
    findAll() {
      return n.findAll.all();
    },
    /**
     * @param {{ opened_by: number, opened_by_name: string, opening_amount: number }} data
     * @returns {number}
     */
    open(t) {
      return Number(n.insert.run(t).lastInsertRowid);
    },
    /**
     * @param {{ id: number, closed_by: number, closed_by_name: string, closing_amount: number, expected_amount: number, difference: number, notes: string|null }} data
     */
    close(t) {
      n.close.run(t);
    },
    /** @param {number} sessionId @returns {CashMovementRow[]} */
    movementsForSession(t) {
      return n.movementsForSession.all(t);
    },
    /**
     * @param {{ session_id: number, type: 'in'|'out', amount: number, concept: string, created_by: number }} data
     * @returns {number}
     */
    insertMovement(t) {
      return Number(n.insertMovement.run(t).lastInsertRowid);
    },
    /**
     * Suma de ventas activas durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    salesTotal(t, r) {
      const a = (
        /** @type {{ total: number }} */
        n.salesTotalForSession.get(t, r, r)
      );
      return (a == null ? void 0 : a.total) ?? 0;
    }
  };
}
function vt(e) {
  function n(t) {
    if (t !== "admin")
      throw Object.assign(new Error("Solo el administrador puede gestionar la caja"), { code: "CASH_FORBIDDEN" });
  }
  return {
    /** Devuelve la sesión abierta o null */
    getOpenSession() {
      return e.findOpen() ?? null;
    },
    /** Lista todas las sesiones (historial) */
    listSessions() {
      return e.findAll();
    },
    /**
     * @param {number} sessionId
     */
    getSession(t) {
      const r = e.findById(t);
      if (!r) throw Object.assign(new Error("Sesión no encontrada"), { code: "CASH_NOT_FOUND" });
      const a = e.movementsForSession(t), s = e.salesTotal(t, r.closed_at);
      return { session: r, movements: a, salesTotal: s };
    },
    /**
     * Abre una nueva sesión de caja. Solo admin.
     * @param {{ userId: number, userName: string, role: string, openingAmount: number }} input
     */
    openSession({ userId: t, userName: r, role: a, openingAmount: s }) {
      if (n(a), e.findOpen())
        throw Object.assign(new Error("Ya hay una caja abierta"), { code: "CASH_ALREADY_OPEN" });
      if (typeof s != "number" || s < 0)
        throw Object.assign(new Error("Monto inicial inválido"), { code: "CASH_INVALID_AMOUNT" });
      const o = e.open({
        opened_by: t,
        opened_by_name: r,
        opening_amount: s
      });
      return e.findById(o);
    },
    /**
     * Cierra la sesión abierta. Solo admin.
     * @param {{ userId: number, userName: string, role: string, closingAmount: number, notes?: string }} input
     */
    closeSession({ userId: t, userName: r, role: a, closingAmount: s, notes: i }) {
      n(a);
      const o = e.findOpen();
      if (!o)
        throw Object.assign(new Error("No hay caja abierta"), { code: "CASH_NOT_OPEN" });
      if (typeof s != "number" || s < 0)
        throw Object.assign(new Error("Monto de cierre inválido"), { code: "CASH_INVALID_AMOUNT" });
      const c = e.salesTotal(o.id, null), d = e.movementsForSession(o.id), E = d.filter((T) => T.type === "in").reduce((T, p) => T + p.amount, 0), m = d.filter((T) => T.type === "out").reduce((T, p) => T + p.amount, 0), _ = o.opening_amount + c + E - m, N = s - _;
      return e.close({
        id: o.id,
        closed_by: t,
        closed_by_name: r,
        closing_amount: s,
        expected_amount: _,
        difference: N,
        notes: i ?? null
      }), e.findById(o.id);
    },
    /**
     * Agrega un movimiento manual (ingreso o egreso). Solo admin.
     * @param {{ userId: number, role: string, type: 'in'|'out', amount: number, concept: string }} input
     */
    addMovement({ userId: t, role: r, type: a, amount: s, concept: i }) {
      n(r);
      const o = e.findOpen();
      if (!o)
        throw Object.assign(new Error("No hay caja abierta"), { code: "CASH_NOT_OPEN" });
      if (!["in", "out"].includes(a))
        throw Object.assign(new Error("Tipo de movimiento inválido"), { code: "CASH_INVALID_TYPE" });
      if (!s || s <= 0)
        throw Object.assign(new Error("Monto inválido"), { code: "CASH_INVALID_AMOUNT" });
      if (!(i != null && i.trim()))
        throw Object.assign(new Error("Concepto requerido"), { code: "CASH_MISSING_CONCEPT" });
      return { id: e.insertMovement({ session_id: o.id, type: a, amount: s, concept: i.trim(), created_by: t }), session_id: o.id, type: a, amount: s, concept: i, created_by: t };
    }
  };
}
function Mt(e) {
  l.handle("cash:get-open", u(() => e.getOpenSession())), l.handle("cash:list", u(() => e.listSessions())), l.handle("cash:get-session", u((n, t) => e.getSession(t))), l.handle("cash:open", u((n, t) => e.openSession(t))), l.handle("cash:close", u((n, t) => e.closeSession(t))), l.handle("cash:add-movement", u((n, t) => e.addMovement(t)));
}
function Bt(e) {
  const n = {
    // suppliers
    findAllSuppliers: e.prepare(
      "SELECT * FROM suppliers ORDER BY name"
    ),
    findSupplierById: e.prepare(
      "SELECT * FROM suppliers WHERE id = ?"
    ),
    insertSupplier: e.prepare(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES (@name, @contact_name, @phone, @email, @address, @notes)`
    ),
    updateSupplier: e.prepare(
      `UPDATE suppliers SET name=@name, contact_name=@contact_name, phone=@phone,
       email=@email, address=@address, notes=@notes,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    setSupplierActive: e.prepare(
      `UPDATE suppliers SET active=@active,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    // purchase orders
    findAllOrders: e.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        ORDER BY po.created_at DESC LIMIT 200`
    ),
    findOrderById: e.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ?`
    ),
    findOrdersBySupplier: e.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.supplier_id = ?
        ORDER BY po.created_at DESC`
    ),
    insertOrder: e.prepare(
      `INSERT INTO purchase_orders (supplier_id, notes, created_by, created_by_name)
       VALUES (@supplier_id, @notes, @created_by, @created_by_name)`
    ),
    updateOrderStatus: e.prepare(
      `UPDATE purchase_orders SET status=@status, received_at=@received_at,
       total_cost=@total_cost WHERE id=@id`
    ),
    cancelOrder: e.prepare(
      "UPDATE purchase_orders SET status='cancelled' WHERE id=? AND status IN ('draft','sent')"
    ),
    // purchase items
    findItemsByOrder: e.prepare(
      "SELECT * FROM purchase_items WHERE order_id = ?"
    ),
    insertItem: e.prepare(
      `INSERT INTO purchase_items (order_id, product_id, product_name, product_code, qty_ordered, unit_cost)
       VALUES (@order_id, @product_id, @product_name, @product_code, @qty_ordered, @unit_cost)`
    ),
    updateItemReceived: e.prepare(
      "UPDATE purchase_items SET qty_received=@qty_received WHERE id=@id"
    ),
    // stock update on receive
    addStock: e.prepare(
      "UPDATE products SET stock = stock + @qty WHERE id = @id"
    ),
    updateProductCost: e.prepare(
      "UPDATE products SET cost = @cost WHERE id = @id"
    ),
    getProductForMove: e.prepare(
      "SELECT id, name, stock FROM products WHERE id = ?"
    ),
    insertMovement: e.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `)
  };
  return {
    // ── Suppliers ──────────────────────────────────────────────────────────
    findAllSuppliers() {
      return n.findAllSuppliers.all();
    },
    findSupplierById(t) {
      return n.findSupplierById.get(t);
    },
    createSupplier(t) {
      return Number(n.insertSupplier.run(t).lastInsertRowid);
    },
    updateSupplier(t, r) {
      n.updateSupplier.run({ ...r, id: t });
    },
    setSupplierActive(t, r) {
      n.setSupplierActive.run({ id: t, active: r });
    },
    // ── Orders ─────────────────────────────────────────────────────────────
    findAllOrders() {
      return n.findAllOrders.all();
    },
    findOrderById(t) {
      return n.findOrderById.get(t);
    },
    findOrdersBySupplier(t) {
      return n.findOrdersBySupplier.all(t);
    },
    createOrder(t) {
      return Number(n.insertOrder.run(t).lastInsertRowid);
    },
    updateOrderStatus(t, r, a, s) {
      n.updateOrderStatus.run({ id: t, status: r, received_at: a ?? null, total_cost: s });
    },
    cancelOrder(t) {
      n.cancelOrder.run(t);
    },
    // ── Items ──────────────────────────────────────────────────────────────
    findItemsByOrder(t) {
      return n.findItemsByOrder.all(t);
    },
    insertItem(t) {
      return Number(n.insertItem.run(t).lastInsertRowid);
    },
    // ── Receive (transaction) ──────────────────────────────────────────────
    /**
     * Marca orden como recibida, actualiza qty_received en items y suma al stock.
     * @param {number} orderId
     * @param {{ id: number, qty_received: number }[]} receivedItems
     */
    receiveOrder: e.transaction((t, r) => {
      let a = 0;
      for (const i of r) {
        n.updateItemReceived.run(i);
        const o = n.findItemsByOrder.all(t).find((c) => c.id === i.id);
        if (o != null && o.product_id && i.qty_received > 0) {
          const c = n.getProductForMove.get(o.product_id), d = (c == null ? void 0 : c.stock) ?? 0;
          n.addStock.run({ id: o.product_id, qty: i.qty_received }), o.unit_cost > 0 && n.updateProductCost.run({ id: o.product_id, cost: o.unit_cost }), n.insertMovement.run({
            product_id: o.product_id,
            product_name: (c == null ? void 0 : c.name) ?? o.product_name,
            type: "purchase",
            qty: i.qty_received,
            qty_before: d,
            qty_after: d + i.qty_received,
            reference_type: "purchase",
            reference_id: t,
            notes: null,
            created_by: null,
            created_by_name: null
          });
        }
        a += ((o == null ? void 0 : o.unit_cost) ?? 0) * i.qty_received;
      }
      const s = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
      n.updateOrderStatus.run({ id: t, status: "received", received_at: s, total_cost: a });
    })
  };
}
function Ft(e) {
  function n(t) {
    if (t !== "admin")
      throw Object.assign(new Error("Solo el administrador puede gestionar compras"), { code: "PURCHASES_FORBIDDEN" });
  }
  return {
    // ── Suppliers ────────────────────────────────────────────────────────
    listSuppliers() {
      return e.findAllSuppliers();
    },
    getSupplier(t) {
      return e.findSupplierById(t) ?? null;
    },
    createSupplier(t, r) {
      var i, o, c, d, E;
      n(r);
      const a = (t.name ?? "").trim();
      if (!a) throw Object.assign(new Error("Nombre del proveedor requerido"), { code: "SUPPLIER_MISSING_NAME" });
      const s = e.createSupplier({
        name: a,
        contact_name: ((i = t.contact_name) == null ? void 0 : i.trim()) || null,
        phone: ((o = t.phone) == null ? void 0 : o.trim()) || null,
        email: ((c = t.email) == null ? void 0 : c.trim()) || null,
        address: ((d = t.address) == null ? void 0 : d.trim()) || null,
        notes: ((E = t.notes) == null ? void 0 : E.trim()) || null
      });
      return e.findSupplierById(s);
    },
    updateSupplier(t, r, a) {
      var o, c, d, E, m;
      n(a);
      const s = e.findSupplierById(t);
      if (!s) throw Object.assign(new Error("Proveedor no encontrado"), { code: "SUPPLIER_NOT_FOUND" });
      const i = (r.name ?? s.name).trim();
      if (!i) throw Object.assign(new Error("Nombre requerido"), { code: "SUPPLIER_MISSING_NAME" });
      return e.updateSupplier(t, {
        name: i,
        contact_name: ((o = r.contact_name) == null ? void 0 : o.trim()) ?? s.contact_name,
        phone: ((c = r.phone) == null ? void 0 : c.trim()) ?? s.phone,
        email: ((d = r.email) == null ? void 0 : d.trim()) ?? s.email,
        address: ((E = r.address) == null ? void 0 : E.trim()) ?? s.address,
        notes: ((m = r.notes) == null ? void 0 : m.trim()) ?? s.notes
      }), e.findSupplierById(t);
    },
    setSupplierActive(t, r, a) {
      return n(a), e.setSupplierActive(t, r ? 1 : 0), e.findSupplierById(t);
    },
    // ── Purchase Orders ──────────────────────────────────────────────────
    listOrders() {
      return e.findAllOrders();
    },
    getOrder(t) {
      const r = e.findOrderById(t);
      if (!r) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      const a = e.findItemsByOrder(t);
      return { order: r, items: a };
    },
    /**
     * @param {{ supplierId: number, notes?: string, items: { productId?: number, productName: string, productCode?: string, qtyOrdered: number, unitCost: number }[], userId: number, userName: string, role: string }} input
     */
    createOrder(t) {
      var a, s, i, o;
      if (n(t.role), !t.supplierId) throw Object.assign(new Error("Proveedor requerido"), { code: "ORDER_MISSING_SUPPLIER" });
      if (!((a = t.items) != null && a.length)) throw Object.assign(new Error("Agrega al menos un producto"), { code: "ORDER_EMPTY" });
      const r = e.createOrder({
        supplier_id: t.supplierId,
        notes: ((s = t.notes) == null ? void 0 : s.trim()) || null,
        created_by: t.userId,
        created_by_name: t.userName
      });
      for (const c of t.items) {
        if (!((i = c.productName) != null && i.trim())) throw Object.assign(new Error("Nombre de producto requerido"), { code: "ITEM_MISSING_NAME" });
        if (c.qtyOrdered <= 0) throw Object.assign(new Error("Cantidad debe ser mayor a 0"), { code: "ITEM_INVALID_QTY" });
        e.insertItem({
          order_id: r,
          product_id: c.productId ?? null,
          product_name: c.productName.trim(),
          product_code: ((o = c.productCode) == null ? void 0 : o.trim()) || null,
          qty_ordered: c.qtyOrdered,
          unit_cost: c.unitCost ?? 0
        });
      }
      return e.findOrderById(r);
    },
    markSent(t, r) {
      n(r);
      const a = e.findOrderById(t);
      if (!a) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (a.status !== "draft") throw Object.assign(new Error("Solo se pueden enviar órdenes en borrador"), { code: "ORDER_INVALID_STATUS" });
      return e.updateOrderStatus(t, "sent", null, a.total_cost), e.findOrderById(t);
    },
    /**
     * Recibe la orden: actualiza stock y costo de productos.
     * @param {{ orderId: number, role: string, items: { id: number, qty_received: number }[] }} input
     */
    receiveOrder(t) {
      var a;
      n(t.role);
      const r = e.findOrderById(t.orderId);
      if (!r) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (!["draft", "sent"].includes(r.status))
        throw Object.assign(new Error("Esta orden ya fue recibida o cancelada"), { code: "ORDER_INVALID_STATUS" });
      if (!((a = t.items) != null && a.length)) throw Object.assign(new Error("Sin items para recibir"), { code: "ORDER_EMPTY" });
      return e.receiveOrder(t.orderId, t.items), e.findOrderById(t.orderId);
    },
    cancelOrder(t, r) {
      n(r);
      const a = e.findOrderById(t);
      if (!a) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (!["draft", "sent"].includes(a.status))
        throw Object.assign(new Error("No se puede cancelar esta orden"), { code: "ORDER_INVALID_STATUS" });
      return e.cancelOrder(t), e.findOrderById(t);
    }
  };
}
function qt(e) {
  l.handle("suppliers:list", u(() => e.listSuppliers())), l.handle("suppliers:get", u((n, t) => e.getSupplier(t))), l.handle("suppliers:create", u((n, t, r) => e.createSupplier(t, r))), l.handle("suppliers:update", u((n, t, r, a) => e.updateSupplier(t, r, a))), l.handle("suppliers:set-active", u((n, t, r, a) => e.setSupplierActive(t, r, a))), l.handle("purchases:list", u(() => e.listOrders())), l.handle("purchases:get", u((n, t) => e.getOrder(t))), l.handle("purchases:create", u((n, t) => e.createOrder(t))), l.handle("purchases:mark-sent", u((n, t, r) => e.markSent(t, r))), l.handle("purchases:receive", u((n, t) => e.receiveOrder(t))), l.handle("purchases:cancel", u((n, t, r) => e.cancelOrder(t, r)));
}
function Pt(e) {
  const n = {
    findAll: e.prepare(`
      SELECT * FROM receivables ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
        due_date ASC NULLS LAST, created_at DESC
    `),
    findById: e.prepare("SELECT * FROM receivables WHERE id = ?"),
    findByCustomer: e.prepare("SELECT * FROM receivables WHERE customer_id = ? ORDER BY created_at DESC"),
    insert: e.prepare(`
      INSERT INTO receivables
        (customer_id, customer_name, customer_nit, description, amount, due_date, notes, created_by, created_by_name)
      VALUES
        (@customer_id, @customer_name, @customer_nit, @description, @amount, @due_date, @notes, @created_by, @created_by_name)
    `),
    updateStatus: e.prepare(`
      UPDATE receivables
      SET status=@status, amount_paid=@amount_paid,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    cancel: e.prepare(`
      UPDATE receivables
      SET status='cancelled', updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=?
    `),
    // payments
    findPayments: e.prepare("SELECT * FROM receivable_payments WHERE receivable_id = ? ORDER BY created_at"),
    insertPayment: e.prepare(`
      INSERT INTO receivable_payments
        (receivable_id, amount, payment_method, notes, created_by, created_by_name)
      VALUES
        (@receivable_id, @amount, @payment_method, @notes, @created_by, @created_by_name)
    `),
    // summary
    summary: e.prepare(`
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
  }, t = e.transaction((r, a) => {
    n.insertPayment.run(a);
    const s = n.findById.get(r), i = (s.amount_paid ?? 0) + a.amount, o = i >= s.amount ? "paid" : "partial";
    return n.updateStatus.run({ id: r, amount_paid: i, status: o }), n.findById.get(r);
  });
  return {
    findAll() {
      return n.findAll.all();
    },
    findById(r) {
      return n.findById.get(r) ?? null;
    },
    findByCustomer(r) {
      return n.findByCustomer.all(r);
    },
    create(r) {
      return Number(n.insert.run(r).lastInsertRowid);
    },
    cancel(r) {
      n.cancel.run(r);
    },
    findPayments(r) {
      return n.findPayments.all(r);
    },
    applyPayment: t,
    getSummary() {
      return n.summary.get();
    }
  };
}
function kt(e) {
  return {
    list() {
      return e.findAll();
    },
    getDetail(n) {
      const t = e.findById(n);
      if (!t) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      const r = e.findPayments(n);
      return { receivable: t, payments: r };
    },
    getSummary() {
      return e.getSummary();
    },
    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, description: string, amount: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    create(n) {
      var s, i, o, c;
      const t = (s = n.description) == null ? void 0 : s.trim();
      if (!t) throw Object.assign(new Error("Descripción requerida"), { code: "RECV_MISSING_DESC" });
      if (!((i = n.customerName) != null && i.trim())) throw Object.assign(new Error("Nombre del cliente requerido"), { code: "RECV_MISSING_CUSTOMER" });
      const r = Number(n.amount);
      if (isNaN(r) || r <= 0) throw Object.assign(new Error("Monto debe ser mayor a 0"), { code: "RECV_INVALID_AMOUNT" });
      const a = e.create({
        customer_id: n.customerId ?? null,
        customer_name: n.customerName.trim(),
        customer_nit: ((o = n.customerNit) == null ? void 0 : o.trim()) || null,
        description: t,
        amount: r,
        due_date: n.dueDate || null,
        notes: ((c = n.notes) == null ? void 0 : c.trim()) || null,
        created_by: n.userId,
        created_by_name: n.userName
      });
      return e.findById(a);
    },
    /**
     * @param {{ receivableId: number, amount: number, paymentMethod?: string, notes?: string, userId: number, userName: string }} input
     */
    applyPayment(n) {
      var s;
      const t = e.findById(n.receivableId);
      if (!t) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      if (["paid", "cancelled"].includes(t.status))
        throw Object.assign(new Error("Esta cuenta ya está cerrada"), { code: "RECV_CLOSED" });
      const r = Number(n.amount);
      if (isNaN(r) || r <= 0) throw Object.assign(new Error("Monto de pago inválido"), { code: "RECV_INVALID_PAYMENT" });
      const a = t.amount - t.amount_paid;
      if (r > a + 1e-3)
        throw Object.assign(new Error(`El pago (${r}) supera el saldo (${a.toFixed(2)})`), { code: "RECV_OVERPAYMENT" });
      return e.applyPayment(n.receivableId, {
        receivable_id: n.receivableId,
        amount: r,
        payment_method: n.paymentMethod || "cash",
        notes: ((s = n.notes) == null ? void 0 : s.trim()) || null,
        created_by: n.userId,
        created_by_name: n.userName
      });
    },
    cancel(n) {
      const t = e.findById(n);
      if (!t) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      if (t.status === "paid") throw Object.assign(new Error("No se puede cancelar una cuenta ya pagada"), { code: "RECV_CLOSED" });
      return e.cancel(n), e.findById(n);
    },
    byCustomer(n) {
      if (!Number.isInteger(n) || n <= 0)
        throw Object.assign(new Error("customer_id inválido"), { code: "RECV_INVALID_CUSTOMER" });
      const r = e.findByCustomer(n).filter((s) => ["pending", "partial"].includes(s.status)), a = r.reduce((s, i) => s + (i.amount - i.amount_paid), 0);
      return { rows: r, balance: a };
    }
  };
}
function Ht(e) {
  function n(t, r) {
    l.handle(t, async (a, ...s) => {
      try {
        return { ok: !0, data: await r(...s) };
      } catch (i) {
        return { ok: !1, error: { code: i.code ?? "RECV_ERROR", message: i.message } };
      }
    });
  }
  n("receivables:list", () => e.list()), n("receivables:get", (t) => e.getDetail(t)), n("receivables:summary", () => e.getSummary()), n("receivables:create", (t) => e.create(t)), n("receivables:apply-payment", (t) => e.applyPayment(t)), n("receivables:cancel", (t) => e.cancel(t)), n("receivables:by-customer", (t) => e.byCustomer(t));
}
function Xt(e) {
  const n = {
    findAll: e.prepare(`
      SELECT * FROM quotes
      ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'sent' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END,
               created_at DESC
    `),
    findById: e.prepare("SELECT * FROM quotes WHERE id = ?"),
    findItems: e.prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id"),
    insert: e.prepare(`
      INSERT INTO quotes (customer_id, customer_name, customer_nit, notes, valid_until,
                          subtotal, tax_rate, tax_amount, total, created_by, created_by_name)
      VALUES (@customer_id, @customer_name, @customer_nit, @notes, @valid_until,
              @subtotal, @tax_rate, @tax_amount, @total, @created_by, @created_by_name)
    `),
    insertItem: e.prepare(`
      INSERT INTO quote_items (quote_id, product_id, product_name, product_code, qty, unit_price, subtotal)
      VALUES (@quote_id, @product_id, @product_name, @product_code, @qty, @unit_price, @subtotal)
    `),
    deleteItems: e.prepare("DELETE FROM quote_items WHERE quote_id = ?"),
    updateStatus: e.prepare(`
      UPDATE quotes SET status=@status, updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    markConverted: e.prepare(`
      UPDATE quotes SET status='converted', sale_id=@sale_id,
        updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    update: e.prepare(`
      UPDATE quotes
      SET customer_id=@customer_id, customer_name=@customer_name, customer_nit=@customer_nit,
          notes=@notes, valid_until=@valid_until,
          subtotal=@subtotal, tax_rate=@tax_rate, tax_amount=@tax_amount, total=@total,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `)
  }, t = e.transaction((a, s) => {
    const i = Number(n.insert.run(a).lastInsertRowid);
    for (const o of s) n.insertItem.run({ ...o, quote_id: i });
    return i;
  }), r = e.transaction((a, s, i) => {
    n.update.run({ ...s, id: a }), n.deleteItems.run(a);
    for (const o of i) n.insertItem.run({ ...o, quote_id: a });
  });
  return {
    findAll() {
      return n.findAll.all();
    },
    findById(a) {
      return n.findById.get(a) ?? null;
    },
    findItems(a) {
      return n.findItems.all(a);
    },
    createQuote: t,
    updateQuote: r,
    updateStatus(a, s) {
      n.updateStatus.run({ id: a, status: s });
    },
    markConverted(a, s) {
      n.markConverted.run({ id: a, sale_id: s });
    }
  };
}
function xt(e, n, t, r) {
  function a(o) {
    const c = (
      /** @type {number} */
      n.get("tax_rate") ?? 0
    ), d = o.reduce((m, _) => m + _.qty * _.unit_price, 0), E = Math.round(d * c * 100) / 100;
    return { subtotal: d, tax_rate: c, tax_amount: E, total: d + E };
  }
  function s(o) {
    var c;
    if (!(o != null && o.length)) throw Object.assign(new Error("Agrega al menos un producto"), { code: "QUOTE_EMPTY" });
    for (const d of o) {
      if (!((c = d.productName) != null && c.trim())) throw Object.assign(new Error("Nombre de producto requerido"), { code: "QUOTE_ITEM_NAME" });
      if (d.qty <= 0) throw Object.assign(new Error("Cantidad debe ser mayor a 0"), { code: "QUOTE_ITEM_QTY" });
      if (d.unitPrice < 0) throw Object.assign(new Error("Precio no puede ser negativo"), { code: "QUOTE_ITEM_PRICE" });
    }
  }
  function i(o) {
    return o.map((c) => {
      var d;
      return {
        product_id: c.productId ?? null,
        product_name: c.productName.trim(),
        product_code: ((d = c.productCode) == null ? void 0 : d.trim()) || null,
        qty: c.qty,
        unit_price: c.unitPrice,
        subtotal: c.qty * c.unitPrice
      };
    });
  }
  return {
    list() {
      return e.findAll();
    },
    getDetail(o) {
      const c = e.findById(o);
      if (!c) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      return { quote: c, items: e.findItems(o) };
    },
    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, notes?: string, validUntil?: string, items: any[], userId: number, userName: string }} input
     */
    create(o) {
      var T, p, R;
      if (!((T = o.customerName) != null && T.trim())) throw Object.assign(new Error("Nombre del cliente requerido"), { code: "QUOTE_MISSING_CUSTOMER" });
      s(o.items);
      const c = i(o.items), { subtotal: d, tax_rate: E, tax_amount: m, total: _ } = a(c), N = e.createQuote({
        customer_id: o.customerId ?? null,
        customer_name: o.customerName.trim(),
        customer_nit: ((p = o.customerNit) == null ? void 0 : p.trim()) || null,
        notes: ((R = o.notes) == null ? void 0 : R.trim()) || null,
        valid_until: o.validUntil || null,
        subtotal: d,
        tax_rate: E,
        tax_amount: m,
        total: _,
        created_by: o.userId,
        created_by_name: o.userName
      }, c);
      return e.findById(N);
    },
    /**
     * @param {number} id
     * @param {{ customerId?: number, customerName: string, customerNit?: string, notes?: string, validUntil?: string, items: any[] }} input
     */
    update(o, c) {
      var p, R;
      const d = e.findById(o);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["draft", "sent"].includes(d.status))
        throw Object.assign(new Error("Solo se pueden editar cotizaciones en borrador o enviadas"), { code: "QUOTE_NOT_EDITABLE" });
      s(c.items);
      const E = i(c.items), { subtotal: m, tax_rate: _, tax_amount: N, total: T } = a(E);
      return e.updateQuote(o, {
        customer_id: c.customerId ?? d.customer_id,
        customer_name: (c.customerName ?? d.customer_name).trim(),
        customer_nit: ((p = c.customerNit) == null ? void 0 : p.trim()) || d.customer_nit,
        notes: ((R = c.notes) == null ? void 0 : R.trim()) || null,
        valid_until: c.validUntil || null,
        subtotal: m,
        tax_rate: _,
        tax_amount: N,
        total: T
      }, E), e.findById(o);
    },
    markSent(o) {
      const c = e.findById(o);
      if (!c) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (c.status !== "draft") throw Object.assign(new Error("Solo se pueden enviar cotizaciones en borrador"), { code: "QUOTE_INVALID_STATUS" });
      return e.updateStatus(o, "sent"), e.findById(o);
    },
    accept(o) {
      const c = e.findById(o);
      if (!c) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["draft", "sent"].includes(c.status)) throw Object.assign(new Error("Estado inválido para aceptar"), { code: "QUOTE_INVALID_STATUS" });
      return e.updateStatus(o, "accepted"), e.findById(o);
    },
    reject(o) {
      const c = e.findById(o);
      if (!c) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (["converted", "cancelled"].includes(c.status)) throw Object.assign(new Error("No se puede rechazar esta cotización"), { code: "QUOTE_INVALID_STATUS" });
      return e.updateStatus(o, "rejected"), e.findById(o);
    },
    /**
     * Convierte la cotización aceptada en una venta real.
     * @param {{ id: number, userId: number, userName: string }} input
     */
    convertToSale(o) {
      const c = e.findById(o.id);
      if (!c) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["accepted", "sent", "draft"].includes(c.status))
        throw Object.assign(new Error("Solo se pueden convertir cotizaciones activas"), { code: "QUOTE_INVALID_STATUS" });
      const d = e.findItems(o.id);
      if (!d.length) throw Object.assign(new Error("La cotización no tiene productos"), { code: "QUOTE_EMPTY" });
      const E = d.filter((_) => _.product_id != null);
      if (!E.length)
        throw Object.assign(new Error("Para convertir a venta todos los items deben tener un producto del sistema"), { code: "QUOTE_NO_PRODUCTS" });
      const m = t.create({
        items: E.map((_) => ({
          id: _.product_id,
          qty: _.qty,
          price: _.unit_price
        })),
        customerId: c.customer_id ?? void 0
      });
      return e.markConverted(o.id, m.saleId), { quote: e.findById(o.id), sale: m };
    },
    /**
     * Crea una cuenta por cobrar desde una cotización aceptada.
     * @param {{ id: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    convertToReceivable(o) {
      const c = e.findById(o.id);
      if (!c) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["accepted", "sent", "draft"].includes(c.status))
        throw Object.assign(new Error("Solo se pueden convertir cotizaciones activas"), { code: "QUOTE_INVALID_STATUS" });
      const d = r.create({
        customerId: c.customer_id ?? void 0,
        customerName: c.customer_name,
        customerNit: c.customer_nit ?? void 0,
        description: `Cotización #${c.id}${c.notes ? ` · ${c.notes}` : ""}`,
        amount: c.total,
        dueDate: o.dueDate || void 0,
        notes: o.notes || void 0,
        userId: o.userId,
        userName: o.userName
      });
      return e.updateStatus(o.id, "converted"), { quote: e.findById(o.id), receivable: d };
    }
  };
}
function jt(e) {
  function n(t, r) {
    l.handle(t, async (a, ...s) => {
      try {
        return { ok: !0, data: await r(...s) };
      } catch (i) {
        return { ok: !1, error: { code: i.code ?? "QUOTE_ERROR", message: i.message } };
      }
    });
  }
  n("quotes:list", () => e.list()), n("quotes:get", (t) => e.getDetail(t)), n("quotes:create", (t) => e.create(t)), n("quotes:update", (t, r) => e.update(t, r)), n("quotes:mark-sent", (t) => e.markSent(t)), n("quotes:accept", (t) => e.accept(t)), n("quotes:reject", (t) => e.reject(t)), n("quotes:convert", (t) => e.convertToSale(t)), n("quotes:convert-receivable", (t) => e.convertToReceivable(t));
}
function Yt(e) {
  const n = {
    findAll: e.prepare(`
      SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC
    `),
    findByRange: e.prepare(`
      SELECT * FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      ORDER BY expense_date DESC, created_at DESC
    `),
    findById: e.prepare("SELECT * FROM expenses WHERE id = ?"),
    insert: e.prepare(`
      INSERT INTO expenses
        (category, description, amount, payment_method, expense_date, notes, created_by, created_by_name)
      VALUES
        (@category, @description, @amount, @payment_method, @expense_date, @notes, @created_by, @created_by_name)
    `),
    update: e.prepare(`
      UPDATE expenses
      SET category=@category, description=@description, amount=@amount,
          payment_method=@payment_method, expense_date=@expense_date, notes=@notes
      WHERE id=@id
    `),
    remove: e.prepare("DELETE FROM expenses WHERE id = ?"),
    summary: e.prepare(`
      SELECT
        COALESCE(SUM(amount),0)                                             AS total,
        COALESCE(SUM(CASE WHEN expense_date = strftime('%Y-%m-%d','now','localtime') THEN amount ELSE 0 END),0) AS today,
        COUNT(*)                                                            AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
    `),
    byCategory: e.prepare(`
      SELECT category, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      GROUP BY category ORDER BY total DESC
    `)
  };
  return {
    findAll() {
      return n.findAll.all();
    },
    findByRange(t, r) {
      return n.findByRange.all({ from: t, to: r });
    },
    findById(t) {
      return n.findById.get(t) ?? null;
    },
    create(t) {
      return Number(n.insert.run(t).lastInsertRowid);
    },
    update(t, r) {
      n.update.run({ ...r, id: t });
    },
    remove(t) {
      n.remove.run(t);
    },
    getSummary(t, r) {
      return n.summary.get({ from: t, to: r });
    },
    getByCategory(t, r) {
      return n.byCategory.all({ from: t, to: r });
    }
  };
}
const $ = [
  "renta",
  "servicios",
  "sueldos",
  "insumos",
  "transporte",
  "mantenimiento",
  "publicidad",
  "impuestos",
  "otros"
], ce = ["cash", "transfer", "card", "check"];
function Vt(e) {
  function n(r) {
    var a;
    if (!((a = r.description) != null && a.trim()))
      throw Object.assign(new Error("La descripción es requerida"), { code: "EXP_INVALID" });
    if (!Number.isFinite(r.amount) || r.amount <= 0)
      throw Object.assign(new Error("El monto debe ser mayor a 0"), { code: "EXP_INVALID" });
  }
  function t() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  return {
    list(r = {}) {
      return r.from && r.to ? e.findByRange(r.from, r.to) : e.findAll();
    },
    getById(r) {
      const a = e.findById(r);
      if (!a) throw Object.assign(new Error(`Gasto ${r} no encontrado`), { code: "EXP_NOT_FOUND" });
      return a;
    },
    create(r) {
      var s;
      n(r);
      const a = e.create({
        category: $.includes(r.category) ? r.category : "otros",
        description: r.description.trim(),
        amount: r.amount,
        payment_method: ce.includes(r.payment_method) ? r.payment_method : "cash",
        expense_date: r.expense_date || t(),
        notes: ((s = r.notes) == null ? void 0 : s.trim()) || null,
        created_by: r.created_by ?? null,
        created_by_name: r.created_by_name ?? null
      });
      return e.findById(a);
    },
    update(r, a) {
      var i;
      n(a);
      const s = e.findById(r);
      if (!s) throw Object.assign(new Error(`Gasto ${r} no encontrado`), { code: "EXP_NOT_FOUND" });
      return e.update(r, {
        category: $.includes(a.category) ? a.category : "otros",
        description: a.description.trim(),
        amount: a.amount,
        payment_method: ce.includes(a.payment_method) ? a.payment_method : "cash",
        expense_date: a.expense_date || s.expense_date,
        notes: ((i = a.notes) == null ? void 0 : i.trim()) || null
      }), e.findById(r);
    },
    remove(r) {
      if (!e.findById(r)) throw Object.assign(new Error(`Gasto ${r} no encontrado`), { code: "EXP_NOT_FOUND" });
      return e.remove(r), !0;
    },
    summary(r, a) {
      const s = r || t(), i = a || t();
      return {
        ...e.getSummary(s, i),
        byCategory: e.getByCategory(s, i)
      };
    },
    categories: () => $
  };
}
function Gt(e) {
  function n(t, r) {
    l.handle(t, async (a, ...s) => {
      try {
        return { ok: !0, data: await r(...s) };
      } catch (i) {
        return { ok: !1, error: { code: i.code ?? "EXP_ERROR", message: i.message } };
      }
    });
  }
  n("expenses:list", (t) => e.list(t)), n("expenses:get", (t) => e.getById(t)), n("expenses:create", (t) => e.create(t)), n("expenses:update", (t, r) => e.update(t, r)), n("expenses:remove", (t) => e.remove(t)), n("expenses:summary", (t, r) => e.summary(t, r)), n("expenses:categories", () => e.categories());
}
function Wt(e) {
  const n = {
    findAll: e.prepare("SELECT * FROM returns ORDER BY created_at DESC"),
    findBySale: e.prepare("SELECT * FROM returns WHERE sale_id = ? ORDER BY created_at DESC"),
    findById: e.prepare("SELECT * FROM returns WHERE id = ?"),
    findItems: e.prepare("SELECT * FROM return_items WHERE return_id = ?"),
    insertReturn: e.prepare(`
      INSERT INTO returns (sale_id, reason, notes, total_refund, created_by, created_by_name)
      VALUES (@sale_id, @reason, @notes, @total_refund, @created_by, @created_by_name)
    `),
    insertItem: e.prepare(`
      INSERT INTO return_items (return_id, sale_item_id, product_id, product_name, qty_returned, unit_price, subtotal)
      VALUES (@return_id, @sale_item_id, @product_id, @product_name, @qty_returned, @unit_price, @subtotal)
    `),
    restoreStock: e.prepare("UPDATE products SET stock = stock + ? WHERE id = ?")
  }, t = e.transaction((r, a) => {
    const s = Number(n.insertReturn.run(r).lastInsertRowid);
    for (const i of a)
      n.insertItem.run({ ...i, return_id: s }), n.restoreStock.run(i.qty_returned, i.product_id);
    return s;
  });
  return {
    findAll() {
      return n.findAll.all();
    },
    findBySale(r) {
      return n.findBySale.all(r);
    },
    findById(r) {
      return n.findById.get(r) ?? null;
    },
    findItems(r) {
      return n.findItems.all(r);
    },
    createReturn: t
  };
}
function $t(e, n) {
  return {
    list() {
      return e.findAll();
    },
    listBySale(t) {
      return e.findBySale(t).map((a) => ({ ...a, items: e.findItems(a.id) }));
    },
    getById(t) {
      const r = e.findById(t);
      if (!r) throw Object.assign(new Error(`Devolución ${t} no encontrada`), { code: "RET_NOT_FOUND" });
      return { ...r, items: e.findItems(t) };
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
    create(t) {
      var o, c;
      if (!((o = t.reason) != null && o.trim()) || t.reason.trim().length < 3)
        throw Object.assign(new Error("El motivo debe tener al menos 3 caracteres"), { code: "RET_INVALID" });
      if (!Array.isArray(t.items) || t.items.length === 0)
        throw Object.assign(new Error("Selecciona al menos un producto a devolver"), { code: "RET_INVALID" });
      for (const d of t.items)
        if (!d.qtyReturned || d.qtyReturned <= 0)
          throw Object.assign(new Error(`Cantidad inválida para ${d.productName}`), { code: "RET_INVALID" });
      const r = n.findSaleById(t.saleId);
      if (!r) throw Object.assign(new Error(`Venta ${t.saleId} no encontrada`), { code: "RET_INVALID" });
      if (r.status === "voided") throw Object.assign(new Error("No se puede devolver una venta anulada"), { code: "RET_INVALID" });
      const a = t.items.map((d) => ({
        sale_item_id: d.saleItemId,
        product_id: d.productId,
        product_name: d.productName,
        qty_returned: d.qtyReturned,
        unit_price: d.unitPrice,
        subtotal: Math.round(d.qtyReturned * d.unitPrice * 100) / 100
      })), s = a.reduce((d, E) => d + E.subtotal, 0), i = e.createReturn({
        sale_id: t.saleId,
        reason: t.reason.trim(),
        notes: ((c = t.notes) == null ? void 0 : c.trim()) || null,
        total_refund: Math.round(s * 100) / 100,
        created_by: t.createdBy ?? null,
        created_by_name: t.createdByName ?? null
      }, a);
      return e.findById(i);
    }
  };
}
function Kt(e) {
  function n(t, r) {
    l.handle(t, async (a, ...s) => {
      try {
        return { ok: !0, data: await r(...s) };
      } catch (i) {
        return { ok: !1, error: { code: i.code ?? "RET_ERROR", message: i.message } };
      }
    });
  }
  n("returns:list", () => e.list()), n("returns:list-by-sale", (t) => e.listBySale(t)), n("returns:get", (t) => e.getById(t)), n("returns:create", (t) => e.create(t));
}
function Qt(e) {
  const n = {
    findMovements: e.prepare(`
      SELECT * FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    countMovements: e.prepare(`
      SELECT COUNT(*) AS total FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
    `),
    insertMovement: e.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    getProductStock: e.prepare("SELECT id, code, name, stock, min_stock, category, is_active FROM products WHERE is_active = 1 ORDER BY name ASC"),
    getProductById: e.prepare("SELECT id, code, name, stock FROM products WHERE id = ?"),
    adjustStock: e.prepare("UPDATE products SET stock = stock + ? WHERE id = ?")
  }, t = e.transaction((r, a, s) => {
    const i = n.getProductById.get(r);
    if (!i) throw Object.assign(new Error(`Producto ${r} no encontrado`), { code: "INV_NOT_FOUND" });
    const o = i.stock;
    n.adjustStock.run(a, r);
    const c = o + a;
    return n.insertMovement.run({
      ...s,
      product_id: r,
      product_name: i.name,
      qty: Math.abs(a),
      qty_before: o,
      qty_after: c
    }), { qtyBefore: o, qtyAfter: c, productName: i.name };
  });
  return {
    getStock() {
      return n.getProductStock.all();
    },
    findMovements({ productId: r = null, limit: a = 50, offset: s = 0 } = {}) {
      return n.findMovements.all({ product_id: r, limit: a, offset: s });
    },
    countMovements(r = null) {
      return n.countMovements.get({ product_id: r }).total;
    },
    logAdjustment: t
  };
}
function zt(e) {
  return {
    getStock() {
      return e.getStock();
    },
    getMovements({ productId: n, page: t = 1, pageSize: r = 50 } = {}) {
      const a = Math.min(r, 200), s = (t - 1) * a;
      return {
        data: e.findMovements({ productId: n, limit: a, offset: s }),
        total: e.countMovements(n ?? null),
        page: t,
        pageSize: a
      };
    },
    /**
     * Ajuste manual de stock con registro en kardex.
     * @param {{ productId: number, type: 'in'|'out'|'adjustment', qty: number, notes?: string, createdBy?: number, createdByName?: string }} input
     */
    adjust(n) {
      const { productId: t, type: r, qty: a, notes: s, createdBy: i, createdByName: o } = n;
      if (!Number.isInteger(t) || t <= 0)
        throw Object.assign(new Error("Producto inválido"), { code: "INV_INVALID" });
      if (!["in", "out", "adjustment"].includes(r))
        throw Object.assign(new Error("Tipo de movimiento inválido"), { code: "INV_INVALID" });
      if (!Number.isFinite(a) || a <= 0)
        throw Object.assign(new Error("La cantidad debe ser mayor a 0"), { code: "INV_INVALID" });
      const c = r === "out" ? -a : a;
      return e.logAdjustment(t, c, {
        type: r,
        reference_type: "manual",
        reference_id: null,
        notes: (s == null ? void 0 : s.trim()) || null,
        created_by: i ?? null,
        created_by_name: o ?? null
      });
    }
  };
}
function Zt(e) {
  function n(t, r) {
    l.handle(t, async (a, ...s) => {
      try {
        return { ok: !0, data: await r(...s) };
      } catch (i) {
        return { ok: !1, error: { code: i.code ?? "INV_ERROR", message: i.message } };
      }
    });
  }
  n("inventory:stock", () => e.getStock()), n("inventory:movements", (t) => e.getMovements(t)), n("inventory:adjust", (t) => e.adjust(t));
}
let X = null, Q = null, Z = 10;
function ue() {
  return v.join(y.getPath("userData"), "backups");
}
function Jt() {
  const e = ue();
  return L.existsSync(e) || L.mkdirSync(e, { recursive: !0 }), e;
}
function en() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function tn(e) {
  const n = L.readdirSync(e).filter((t) => t.startsWith("backup_") && t.endsWith(".sqlite")).sort();
  for (; n.length > Z; )
    try {
      L.unlinkSync(v.join(e, n.shift()));
    } catch {
    }
}
async function z(e) {
  const n = Jt(), t = `backup_${en()}.sqlite`, r = v.join(n, t);
  await e.backup(r), tn(n);
  const a = L.statSync(r).size;
  return console.log(`[backup] OK → ${t} (${(a / 1024).toFixed(1)} KB)`), { filename: t, path: r, size: a };
}
function nn() {
  const e = ue();
  return L.existsSync(e) ? L.readdirSync(e).filter((n) => n.startsWith("backup_") && n.endsWith(".sqlite")).sort().reverse().map((n) => {
    const t = v.join(e, n), r = L.statSync(t);
    return {
      filename: n,
      path: t,
      size: r.size,
      createdAt: r.mtime.toISOString()
    };
  }) : [];
}
function Ee(e, n = 720, t = 10) {
  Q = e, Z = t, X && (clearInterval(X), X = null);
  const r = n * 36e5;
  setTimeout(() => z(e).catch((s) => console.error("[backup] error inicial:", s)), 6e4);
  let a = Date.now();
  X = setInterval(() => {
    Date.now() - a >= r && (a = Date.now(), z(e).catch((s) => console.error("[backup] error periódico:", s)));
  }, 36e5), console.log(`[backup] scheduler activo — intervalo: ${n} h · máx: ${t} copias`);
}
function rn(e, n) {
  if (!Q) {
    console.warn("[backup] updateBackupSchedule llamado antes de startBackupSchedule");
    return;
  }
  Ee(Q, e, n ?? Z);
}
const an = /* @__PURE__ */ Object.assign({
  "../database/migrations/001_init.sql": be,
  "../database/migrations/002_settings.sql": Ce,
  "../database/migrations/003_sales_tax_snapshot.sql": De,
  "../database/migrations/004_customers.sql": we,
  "../database/migrations/005_products_extended.sql": ve,
  "../database/migrations/006_users.sql": Me,
  "../database/migrations/007_settings_extended.sql": Be,
  "../database/migrations/008_settings_theme.sql": Fe,
  "../database/migrations/009_sales_payment.sql": qe,
  "../database/migrations/010_sales_void_audit.sql": Pe,
  "../database/migrations/011_users_avatar.sql": ke,
  "../database/migrations/012_cash_sessions.sql": He,
  "../database/migrations/013_purchases.sql": Xe,
  "../database/migrations/014_receivables.sql": xe,
  "../database/migrations/015_quotes.sql": je,
  "../database/migrations/016_sales_discount.sql": Ye,
  "../database/migrations/017_expenses.sql": Ve,
  "../database/migrations/018_returns.sql": Ge,
  "../database/migrations/019_stock_movements.sql": We,
  "../database/migrations/020_backup_settings.sql": $e,
  "../database/migrations/021_tax_enabled.sql": Ke,
  "../database/migrations/022_printer_settings.sql": Qe,
  "../database/migrations/023_categories.sql": ze
});
function sn() {
  return Object.entries(an).map(([e, n]) => ({
    name: e.split("/").pop(),
    sql: n
  }));
}
function on() {
  const e = Ze(), n = tt(e, sn());
  console.log("[migrator] applied:", n.applied, "skipped:", n.skipped);
  const t = nt(e), r = st(t);
  r.init();
  const a = it(e), s = ct(a), i = lt(e), o = ut(i), c = mt(e), d = Tt(c), E = bt(e), m = Ct(E), _ = Nt(e), N = ft(_, r, d, m), T = Lt(e), p = gt(T), R = wt(e), g = vt(R), U = Bt(e), M = Ft(U), B = Pt(e), b = kt(B), C = Xt(e), D = xt(C, r, N, b), F = Yt(e), _e = Vt(F), Te = Wt(e), pe = $t(Te, _), Ne = Qt(e), Re = zt(Ne);
  ot(r), dt(s), Et(o), pt(d), At(N), ht(p), Dt(m), Mt(g), qt(M), Ht(b), jt(D), Gt(_e), Kt(pe), Zt(Re);
  const Ie = Le.join(y.getPath("userData"), "taller_pos.sqlite");
  l.handle("db:get-path", () => ({ ok: !0, data: Ie })), l.handle("db:backup", async () => {
    try {
      const { filePath: I, canceled: S } = await Ae.showSaveDialog({
        title: "Guardar respaldo de base de datos",
        defaultPath: `backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sqlite`,
        filters: [{ name: "SQLite", extensions: ["sqlite"] }]
      });
      return S || !I ? { ok: !0, data: null } : (await e.backup(I), { ok: !0, data: I });
    } catch (I) {
      return { ok: !1, error: { code: "BACKUP_ERROR", message: I.message } };
    }
  }), l.handle("db:backup-now", async () => {
    try {
      return { ok: !0, data: await z(e) };
    } catch (I) {
      return { ok: !1, error: { code: "BACKUP_ERROR", message: I.message } };
    }
  }), l.handle("db:list-backups", () => {
    try {
      return { ok: !0, data: nn() };
    } catch (I) {
      return { ok: !1, error: { code: "BACKUP_LIST_ERROR", message: I.message } };
    }
  });
  const J = Number(r.get("backup_interval_hours") ?? 720) || 720, ee = Number(r.get("backup_max_copies") ?? 10) || 10;
  l.handle("db:set-backup-interval", (I, S, q) => {
    try {
      const O = Math.max(1, Number(S) || J), w = Math.max(1, Number(q) || ee);
      return rn(O, w), { ok: !0, data: { intervalHours: O, maxCopies: w } };
    } catch (O) {
      return { ok: !1, error: { code: "BACKUP_INTERVAL_ERROR", message: O.message } };
    }
  }), Ee(e, J, ee), l.handle("printer:list", async (I) => {
    try {
      const S = x.fromWebContents(I.sender);
      return { ok: !0, data: (S ? await S.webContents.getPrintersAsync() : []).map((O) => ({ name: O.name, isDefault: O.isDefault })) };
    } catch (S) {
      return { ok: !1, error: { code: "PRINTER_LIST_ERROR", message: String(S.message) } };
    }
  }), l.handle("printer:print", async (I, S, q, O) => {
    const w = {
      "half-letter": { width: 139700, height: 215900 },
      letter: { width: 215900, height: 279400 },
      "thermal-80": { width: 8e4, height: 297e3 }
    }, Se = w[O] ?? w["half-letter"], P = new x({ show: !1, webPreferences: { contextIsolation: !0 } });
    try {
      return await P.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(S)), await new Promise((j) => {
        P.webContents.print(
          { silent: !0, deviceName: q || void 0, pageSize: Se },
          (Oe, fe) => {
            P.close(), j(Oe ? { ok: !0, data: null } : { ok: !1, error: { code: "PRINT_FAILED", message: fe } });
          }
        );
      });
    } catch (j) {
      return P.close(), { ok: !1, error: { code: "PRINT_ERROR", message: String(j.message) } };
    }
  });
}
let K = null;
function me() {
  K = new x({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: te(y.getAppPath(), "dist-electron", "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), process.env.VITE_DEV_SERVER_URL ? K.loadURL(process.env.VITE_DEV_SERVER_URL) : K.loadFile(te(y.getAppPath(), "dist", "index.html"));
}
y.whenReady().then(() => {
  ye.setApplicationMenu(null), on(), me();
});
y.on("window-all-closed", () => {
  process.platform !== "darwin" && y.quit();
});
y.on("activate", () => {
  x.getAllWindows().length === 0 && me();
});
