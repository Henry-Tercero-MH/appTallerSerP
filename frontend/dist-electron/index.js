import { app, ipcMain, BrowserWindow } from "electron";
import path, { join } from "node:path";
import Database from "better-sqlite3";
import crypto, { createHash } from "node:crypto";
const __vite_glob_0_0 = "-- 001_init.sql\r\n-- Preserva el esquema actual (products, sales, sale_items) y la data semilla.\r\n-- No cambia estructura: solo mueve la creacion a una migracion versionada.\r\n-- Los redisenios de negocio iran en migraciones posteriores.\r\n\r\nCREATE TABLE IF NOT EXISTS products (\r\n  id    INTEGER PRIMARY KEY AUTOINCREMENT,\r\n  code  TEXT    NOT NULL UNIQUE,\r\n  name  TEXT    NOT NULL,\r\n  price REAL    NOT NULL,\r\n  stock INTEGER NOT NULL DEFAULT 0\r\n);\r\n\r\nCREATE TABLE IF NOT EXISTS sales (\r\n  id    INTEGER PRIMARY KEY AUTOINCREMENT,\r\n  total REAL    NOT NULL,\r\n  date  TEXT    DEFAULT CURRENT_TIMESTAMP\r\n);\r\n\r\nCREATE TABLE IF NOT EXISTS sale_items (\r\n  id         INTEGER PRIMARY KEY AUTOINCREMENT,\r\n  sale_id    INTEGER NOT NULL,\r\n  product_id INTEGER NOT NULL,\r\n  qty        INTEGER NOT NULL,\r\n  price      REAL    NOT NULL,\r\n  FOREIGN KEY (sale_id)    REFERENCES sales(id),\r\n  FOREIGN KEY (product_id) REFERENCES products(id)\r\n);\r\n\r\n-- Data semilla. INSERT OR IGNORE garantiza idempotencia si alguna instalacion\r\n-- ya la tuviera (por ejemplo una DB preexistente del bootstrap antiguo).\r\nINSERT OR IGNORE INTO products (code, name, price, stock) VALUES\r\n  ('ACE-001', 'Aceite de Motor 10W40 Chevron',    45.00,  12),\r\n  ('FIL-002', 'Filtro de Aceite ECOBREX',         15.50,   5),\r\n  ('FRE-003', 'Pastillas de Freno Ceramicas',    120.00,   8),\r\n  ('BAT-004', 'Bateria 12V 70Ah LTH',            650.00,   2),\r\n  ('SRV-001', 'Servicio de Diagnostico Escaner', 150.00, 999);\r\n";
const __vite_glob_0_1 = "-- 002_settings.sql\r\n-- Tabla de configuracion parametrica. `type` restringe los valores que el\r\n-- service aceptara y como deserializa `value` (que siempre se almacena TEXT).\r\n-- CHECK evita que la capa de datos quede en estado invalido incluso si alguien\r\n-- escribe sin pasar por el service.\r\n\r\nCREATE TABLE IF NOT EXISTS settings (\r\n  key         TEXT PRIMARY KEY,\r\n  value       TEXT NOT NULL,\r\n  type        TEXT NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'json')),\r\n  category    TEXT NOT NULL,\r\n  description TEXT NOT NULL DEFAULT '',\r\n  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\r\n);\r\n\r\nCREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);\r\n\r\n-- Valores por defecto. INSERT OR IGNORE para no sobrescribir nada que el\r\n-- usuario haya editado antes (ej. tras reinstalar con DB preservada).\r\n-- Booleans se almacenan como '0'/'1' por consistencia con el serializador.\r\nINSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES\r\n  ('tax_rate',               '0.12',  'number',  'tax',      'IVA aplicado a ventas (decimal, ej. 0.12 = 12%)'),\r\n  ('tax_included_in_price',  '0',     'boolean', 'tax',      'Si los precios ya incluyen IVA'),\r\n  ('currency_code',          'GTQ',   'string',  'currency', 'Codigo ISO 4217 de la moneda'),\r\n  ('currency_symbol',        'Q',     'string',  'currency', 'Simbolo que se muestra en UI/tickets'),\r\n  ('decimal_places',         '2',     'number',  'currency', 'Decimales para mostrar importes'),\r\n  ('allow_negative_stock',   '0',     'boolean', 'inventory','Permitir vender sin stock disponible'),\r\n  ('business_name',          '',      'string',  'business', 'Razon social / nombre comercial'),\r\n  ('business_nit',           '',      'string',  'business', 'NIT del emisor'),\r\n  ('business_address',       '',      'string',  'business', 'Direccion fiscal'),\r\n  ('business_phone',         '',      'string',  'business', 'Telefono de contacto');\r\n";
const __vite_glob_0_2 = `-- 003_sales_tax_snapshot.sql\r
-- Snapshotea impuesto y moneda al momento de la venta. Motivo: reimprimir\r
-- un ticket mañana con la tasa vigente hoy da totales distintos al cobrado,\r
-- lo cual es legalmente y contablemente invalido. Ver Prompt 1, seccion\r
-- "Snapshot de impuestos en ventas".\r
\r
ALTER TABLE sales ADD COLUMN subtotal         REAL NOT NULL DEFAULT 0;\r
ALTER TABLE sales ADD COLUMN tax_rate_applied REAL NOT NULL DEFAULT 0;\r
ALTER TABLE sales ADD COLUMN tax_amount       REAL NOT NULL DEFAULT 0;\r
ALTER TABLE sales ADD COLUMN currency_code    TEXT NOT NULL DEFAULT 'GTQ';\r
\r
-- Backfill dev: filas pre-migracion no tienen desglose historico. Asumimos\r
-- total == subtotal con tax_amount=0 para que la suma cuadre. Esto NO es\r
-- fielmente historico; en una migracion de produccion habria que coordinar\r
-- con contabilidad un criterio acordado (ej. retro-aplicar tax_rate actual).\r
UPDATE sales SET subtotal = total WHERE subtotal = 0;\r
`;
const __vite_glob_0_3 = `-- 004_customers.sql\r
-- Tabla de clientes + enlace desde sales con snapshot de nombre/NIT.\r
--\r
-- Motivo snapshot: un cliente puede renombrarse o darse de baja despues de\r
-- emitir la venta. La reimpresion del ticket/factura debe mostrar el nombre\r
-- y NIT tal como estaban al momento del cobro. Misma logica que tax_rate\r
-- (ver migracion 003).\r
--\r
-- Sobre NIT: en Guatemala "C/F" (Consumidor Final) es un NIT valido y se\r
-- repite, asi que NO hay UNIQUE sobre la columna. Validacion fina queda en\r
-- la capa de servicio si se requiere.\r
\r
CREATE TABLE IF NOT EXISTS customers (\r
  id          INTEGER PRIMARY KEY AUTOINCREMENT,\r
  nit         TEXT    NOT NULL DEFAULT 'C/F',\r
  name        TEXT    NOT NULL,\r
  email       TEXT,\r
  phone       TEXT,\r
  address     TEXT,\r
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),\r
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),\r
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\r
);\r
\r
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);\r
CREATE INDEX IF NOT EXISTS idx_customers_nit  ON customers(nit);\r
\r
-- Seed del cliente "Consumidor Final". id=1 reservado: los handlers lo\r
-- usan como fallback cuando el POS no identifica al cliente. Nunca\r
-- borrarlo; marcarlo como inactive no tiene sentido aqui.\r
INSERT OR IGNORE INTO customers (id, nit, name) VALUES (1, 'C/F', 'Consumidor Final');\r
\r
-- Columnas en sales. Nullable a nivel DB; la capa service siempre las\r
-- persiste no-null (con Consumidor Final como fallback).\r
ALTER TABLE sales ADD COLUMN customer_id             INTEGER REFERENCES customers(id);\r
ALTER TABLE sales ADD COLUMN customer_name_snapshot  TEXT;\r
ALTER TABLE sales ADD COLUMN customer_nit_snapshot   TEXT;\r
\r
-- Backfill: ventas pre-migracion se asocian a Consumidor Final.\r
UPDATE sales\r
   SET customer_id            = 1,\r
       customer_name_snapshot = 'Consumidor Final',\r
       customer_nit_snapshot  = 'C/F'\r
 WHERE customer_id IS NULL;\r
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
        console.error(...oo_tx(`3829694428_28_8_28_53_11`, "[ipc] unexpected error:", err));
      }
      return { ok: false, error: { code, message } };
    }
  };
}
function oo_cm$1() {
  try {
    return (0, eval)("globalThis._console_ninja") || (0, eval)(`/* https://github.com/wallabyjs/console-ninja#how-does-it-work */'use strict';function _0x4187(_0x52e140,_0x15844d){var _0x1edd14=_0x1edd();return _0x4187=function(_0x418736,_0x252226){_0x418736=_0x418736-0x1dc;var _0x1c174c=_0x1edd14[_0x418736];return _0x1c174c;},_0x4187(_0x52e140,_0x15844d);}var _0x3890c8=_0x4187;function _0x1edd(){var _0xd02a82=['background:\\x20rgb(30,30,30);\\x20color:\\x20rgb(255,213,92)','_connectToHostNow','NEGATIVE_INFINITY',{"resolveGetters":false,"defaultLimits":{"props":100,"elements":100,"strLength":51200,"totalStrLength":51200,"autoExpandLimit":5000,"autoExpandMaxDepth":10},"reducedLimits":{"props":5,"elements":5,"strLength":256,"totalStrLength":768,"autoExpandLimit":30,"autoExpandMaxDepth":2},"reducePolicy":{"perLogpoint":{"reduceOnCount":50,"reduceOnAccumulatedProcessingTimeMs":100,"resetWhenQuietMs":500,"resetOnProcessingTimeAverageMs":100},"global":{"reduceOnCount":1000,"reduceOnAccumulatedProcessingTimeMs":300,"resetWhenQuietMs":50,"resetOnProcessingTimeAverageMs":100}}},'_getOwnPropertyDescriptor','warn','_p_length','_regExpToString','38gkPcrc',',\\x20see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','funcName','_isSet','hasOwnProperty','unshift','[object\\x20Array]','_maxConnectAttemptCount','ws://','autoExpandMaxDepth','default','stackTraceLimit','\\x20server','_addProperty','origin','reducedLimits','resolveGetters','disabledLog','cappedElements','indexOf','reload','Set','Symbol','_isArray','stack','port','function','resetOnProcessingTimeAverageMs','slice','onerror','_connectAttemptCount','emulator','reducePolicy','_processTreeNodeResult','count','_setNodeExpressionPath','HTMLAllCollection','String','strLength','_WebSocketClass','_addLoadNode','expo','ninjaSuppressConsole','_isUndefined','_connected','_keyStrRegExp','next.js','Number','9jOUldT','_isNegativeZero','_p_name','_ws','substr','import(\\x27url\\x27)','_consoleNinjaAllowedToStart','date','parse','_treeNodePropertiesBeforeFullValue','_setNodeLabel','_blacklistedProperty','Buffer','56195','20667vPUjDv','time','Promise','set','2035290pGkmlm','','logger\\x20failed\\x20to\\x20connect\\x20to\\x20host,\\x20see\\x20','angular','negativeInfinity','test','resolve','WebSocket','array','parent','bind','host','resetWhenQuietMs','failed\\x20to\\x20connect\\x20to\\x20host:\\x20','process','bigint','136cjwhMD','toString','object','readyState','_inBrowser','send','_attemptToReconnectShortly','_HTMLAllCollection','hostname','_allowedToSend','edge','name','stringify','_setNodeId','elapsed','constructor','182420mjmqKf','_numberRegExp',"c:\\\\Users\\\\henry\\\\.vscode\\\\extensions\\\\wallabyjs.console-ninja-1.0.525\\\\node_modules",'type','prototype','astro','pop','expressionsToEvaluate','osName','reduceOnAccumulatedProcessingTimeMs','env','Map','_sendErrorMessage','RegExp','node','[object\\x20Date]','_sortProps','_console_ninja','autoExpandLimit','path','8098092eUysyP','_disposeWebsocket','_isPrimitiveWrapperType','autoExpandPropertyCount','return\\x20import(url.pathToFileURL(path.join(nodeModules,\\x20\\x27ws/index.js\\x27)).toString());','perLogpoint','map','_extendedWarning','android','join','rootExpression','_type','_capIfString','nan','_socket','root_exp_id','concat','_console_ninja_session','error','trace','_objectToString','isArray','_ninjaIgnoreNextError','onmessage','fromCharCode','\\x20browser','getWebSocketClass','catch','unknown','versions','_dateToString','_cleanNode','1.0.0','react-native','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20refreshing\\x20the\\x20page\\x20may\\x20help;\\x20also\\x20see\\x20','isExpressionToEvaluate','now','then','serialize','toLowerCase','index','hrtime','close','allStrLength','valueOf','ExpoDevice','_p_','_inNextEdge','[object\\x20BigInt]','Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','timeStamp','autoExpand','1777217946939','_getOwnPropertySymbols','7574025BLeRlk','sortProps','replace','NEXT_RUNTIME','_connecting','_additionalMetadata','forEach','level','symbol','modules','_Symbol','undefined','[object\\x20Set]','eventReceivedCallback','remix','_setNodeQueryPath','[object\\x20Map]','log','depth','Boolean','dockerizedApp','global','null','args','gateway.docker.internal','_addFunctionsNode','perf_hooks','5058944NenKCb','_hasMapOnItsPath','_setNodeExpandableState','push',["localhost","127.0.0.1","example.cypress.io","10.0.2.2","DESKTOP-HU7L43R","169.254.128.21","192.168.43.1","192.168.61.1","192.168.1.78"],'unref','_webSocketErrorDocsLink','','_treeNodePropertiesAfterFullValue','%c\\x20Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','Error','number','value','_isMap','defaultLimits','_addObjectProperty','totalStrLength','some','boolean','_WebSocket','autoExpandPreviousObjects','sort','_setNodePermissions','_allowedToConnectOnSend','disabledTrace','console','reduceOnCount','location','10.0.2.2','get','call','_propertyName','length','props','_hasSymbolPropertyOnItsPath','_reconnectTimeout','string','getOwnPropertyDescriptor','import(\\x27path\\x27)','noFunctions','nodeModules','elements','endsWith','POSITIVE_INFINITY','21223450LJhzYJ','expId','_isPrimitiveType','onopen','bound\\x20Promise','message','current','reduceLimits','_getOwnPropertyNames','data','url','_quotedRegExp','hits','match','_property','getOwnPropertySymbols','performance','toUpperCase','capped','includes'];_0x1edd=function(){return _0xd02a82;};return _0x1edd();}(function(_0x593217,_0xb66b98){var _0x477746=_0x4187,_0x4015ef=_0x593217();while(!![]){try{var _0x55fb6d=parseInt(_0x477746(0x254))/0x1*(-parseInt(_0x477746(0x216))/0x2)+parseInt(_0x477746(0x258))/0x3+-parseInt(_0x477746(0x2dd))/0x4+parseInt(_0x477746(0x2c2))/0x5+-parseInt(_0x477746(0x28c))/0x6+-parseInt(_0x477746(0x278))/0x7*(parseInt(_0x477746(0x268))/0x8)+parseInt(_0x477746(0x246))/0x9*(parseInt(_0x477746(0x1fa))/0xa);if(_0x55fb6d===_0xb66b98)break;else _0x4015ef['push'](_0x4015ef['shift']());}catch(_0x3d51fa){_0x4015ef['push'](_0x4015ef['shift']());}}}(_0x1edd,0xd34bd));function z(_0x592fc3,_0x315c78,_0x20b8bb,_0x322b6b,_0x3f5c59,_0x2ff362){var _0x1e9d9b=_0x4187,_0x1f3283,_0x1d630f,_0x518481,_0x138db6;this[_0x1e9d9b(0x2d7)]=_0x592fc3,this[_0x1e9d9b(0x263)]=_0x315c78,this[_0x1e9d9b(0x22f)]=_0x20b8bb,this['nodeModules']=_0x322b6b,this['dockerizedApp']=_0x3f5c59,this['eventReceivedCallback']=_0x2ff362,this[_0x1e9d9b(0x271)]=!0x0,this[_0x1e9d9b(0x1e5)]=!0x0,this[_0x1e9d9b(0x242)]=!0x1,this[_0x1e9d9b(0x2c6)]=!0x1,this[_0x1e9d9b(0x2bb)]=((_0x1d630f=(_0x1f3283=_0x592fc3['process'])==null?void 0x0:_0x1f3283[_0x1e9d9b(0x282)])==null?void 0x0:_0x1d630f['NEXT_RUNTIME'])===_0x1e9d9b(0x272),this[_0x1e9d9b(0x26c)]=!((_0x138db6=(_0x518481=this[_0x1e9d9b(0x2d7)][_0x1e9d9b(0x266)])==null?void 0x0:_0x518481[_0x1e9d9b(0x2a9)])!=null&&_0x138db6[_0x1e9d9b(0x286)])&&!this[_0x1e9d9b(0x2bb)],this[_0x1e9d9b(0x23d)]=null,this['_connectAttemptCount']=0x0,this[_0x1e9d9b(0x21d)]=0x14,this[_0x1e9d9b(0x2e3)]='https://tinyurl.com/37x8b79t',this[_0x1e9d9b(0x284)]=(this['_inBrowser']?_0x1e9d9b(0x2ae):'Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20restarting\\x20the\\x20process\\x20may\\x20help;\\x20also\\x20see\\x20')+this[_0x1e9d9b(0x2e3)];}z[_0x3890c8(0x27c)][_0x3890c8(0x2a6)]=async function(){var _0x47df01=_0x3890c8,_0x4c9b9c,_0x348789;if(this['_WebSocketClass'])return this[_0x47df01(0x23d)];let _0x5b4a33;if(this[_0x47df01(0x26c)]||this[_0x47df01(0x2bb)])_0x5b4a33=this[_0x47df01(0x2d7)][_0x47df01(0x25f)];else{if((_0x4c9b9c=this['global'][_0x47df01(0x266)])!=null&&_0x4c9b9c['_WebSocket'])_0x5b4a33=(_0x348789=this[_0x47df01(0x2d7)]['process'])==null?void 0x0:_0x348789[_0x47df01(0x1e1)];else try{_0x5b4a33=(await new Function('path',_0x47df01(0x204),_0x47df01(0x1f6),_0x47df01(0x290))(await(0x0,eval)(_0x47df01(0x1f4)),await(0x0,eval)(_0x47df01(0x24b)),this[_0x47df01(0x1f6)]))[_0x47df01(0x220)];}catch{try{_0x5b4a33=require(require(_0x47df01(0x28b))[_0x47df01(0x295)](this[_0x47df01(0x1f6)],'ws'));}catch{throw new Error('failed\\x20to\\x20find\\x20and\\x20load\\x20WebSocket');}}}return this[_0x47df01(0x23d)]=_0x5b4a33,_0x5b4a33;},z[_0x3890c8(0x27c)][_0x3890c8(0x20f)]=function(){var _0x1d32f3=_0x3890c8;this[_0x1d32f3(0x2c6)]||this[_0x1d32f3(0x242)]||this[_0x1d32f3(0x234)]>=this[_0x1d32f3(0x21d)]||(this[_0x1d32f3(0x1e5)]=!0x1,this[_0x1d32f3(0x2c6)]=!0x0,this[_0x1d32f3(0x234)]++,this[_0x1d32f3(0x249)]=new Promise((_0x1dfeca,_0x1ed537)=>{var _0x162cdd=_0x1d32f3;this[_0x162cdd(0x2a6)]()[_0x162cdd(0x2b1)](_0x47460b=>{var _0x1fc8dc=_0x162cdd;let _0xe561b2=new _0x47460b(_0x1fc8dc(0x21e)+(!this[_0x1fc8dc(0x26c)]&&this[_0x1fc8dc(0x2d6)]?_0x1fc8dc(0x2da):this[_0x1fc8dc(0x263)])+':'+this['port']);_0xe561b2[_0x1fc8dc(0x233)]=()=>{var _0x53cfe7=_0x1fc8dc;this[_0x53cfe7(0x271)]=!0x1,this[_0x53cfe7(0x28d)](_0xe561b2),this['_attemptToReconnectShortly'](),_0x1ed537(new Error('logger\\x20websocket\\x20error'));},_0xe561b2[_0x1fc8dc(0x1fd)]=()=>{var _0x1456f8=_0x1fc8dc;this[_0x1456f8(0x26c)]||_0xe561b2[_0x1456f8(0x29a)]&&_0xe561b2['_socket']['unref']&&_0xe561b2['_socket'][_0x1456f8(0x2e2)](),_0x1dfeca(_0xe561b2);},_0xe561b2['onclose']=()=>{var _0x1475d1=_0x1fc8dc;this[_0x1475d1(0x1e5)]=!0x0,this[_0x1475d1(0x28d)](_0xe561b2),this['_attemptToReconnectShortly']();},_0xe561b2[_0x1fc8dc(0x2a3)]=_0x175d79=>{var _0x2e3b9f=_0x1fc8dc;try{if(!(_0x175d79!=null&&_0x175d79[_0x2e3b9f(0x203)])||!this[_0x2e3b9f(0x2cf)])return;let _0x44f4d4=JSON[_0x2e3b9f(0x24e)](_0x175d79['data']);this[_0x2e3b9f(0x2cf)](_0x44f4d4['method'],_0x44f4d4[_0x2e3b9f(0x2d9)],this[_0x2e3b9f(0x2d7)],this[_0x2e3b9f(0x26c)]);}catch{}};})[_0x162cdd(0x2b1)](_0x2e6e48=>(this[_0x162cdd(0x242)]=!0x0,this[_0x162cdd(0x2c6)]=!0x1,this['_allowedToConnectOnSend']=!0x1,this[_0x162cdd(0x271)]=!0x0,this[_0x162cdd(0x234)]=0x0,_0x2e6e48))[_0x162cdd(0x2a7)](_0x890b60=>(this['_connected']=!0x1,this['_connecting']=!0x1,console[_0x162cdd(0x213)](_0x162cdd(0x25a)+this[_0x162cdd(0x2e3)]),_0x1ed537(new Error(_0x162cdd(0x265)+(_0x890b60&&_0x890b60[_0x162cdd(0x1ff)])))));}));},z[_0x3890c8(0x27c)]['_disposeWebsocket']=function(_0x1b2f6c){var _0x5b014b=_0x3890c8;this['_connected']=!0x1,this[_0x5b014b(0x2c6)]=!0x1;try{_0x1b2f6c['onclose']=null,_0x1b2f6c[_0x5b014b(0x233)]=null,_0x1b2f6c['onopen']=null;}catch{}try{_0x1b2f6c[_0x5b014b(0x26b)]<0x2&&_0x1b2f6c[_0x5b014b(0x2b6)]();}catch{}},z[_0x3890c8(0x27c)]['_attemptToReconnectShortly']=function(){var _0x124bb9=_0x3890c8;clearTimeout(this[_0x124bb9(0x1f1)]),!(this[_0x124bb9(0x234)]>=this[_0x124bb9(0x21d)])&&(this[_0x124bb9(0x1f1)]=setTimeout(()=>{var _0x4d4e90=_0x124bb9,_0xf6aafa;this[_0x4d4e90(0x242)]||this['_connecting']||(this[_0x4d4e90(0x20f)](),(_0xf6aafa=this[_0x4d4e90(0x249)])==null||_0xf6aafa['catch'](()=>this[_0x4d4e90(0x26e)]()));},0x1f4),this[_0x124bb9(0x1f1)][_0x124bb9(0x2e2)]&&this[_0x124bb9(0x1f1)][_0x124bb9(0x2e2)]());},z[_0x3890c8(0x27c)][_0x3890c8(0x26d)]=async function(_0x1bb714){var _0x9a6194=_0x3890c8;try{if(!this[_0x9a6194(0x271)])return;this[_0x9a6194(0x1e5)]&&this[_0x9a6194(0x20f)](),(await this[_0x9a6194(0x249)])[_0x9a6194(0x26d)](JSON[_0x9a6194(0x274)](_0x1bb714));}catch(_0x1b6312){this[_0x9a6194(0x293)]?console[_0x9a6194(0x213)](this[_0x9a6194(0x284)]+':\\x20'+(_0x1b6312&&_0x1b6312[_0x9a6194(0x1ff)])):(this['_extendedWarning']=!0x0,console[_0x9a6194(0x213)](this[_0x9a6194(0x284)]+':\\x20'+(_0x1b6312&&_0x1b6312[_0x9a6194(0x1ff)]),_0x1bb714)),this[_0x9a6194(0x271)]=!0x1,this[_0x9a6194(0x26e)]();}};function H(_0x20ad1f,_0x2292c5,_0x44fc0e,_0x23d982,_0x5cf68c,_0x2bf037,_0x2ca164,_0x17c366=ne){var _0x1889e1=_0x3890c8;let _0x540a51=_0x44fc0e['split'](',')[_0x1889e1(0x292)](_0x2d32cd=>{var _0xd94d2e=_0x1889e1,_0x5aa30d,_0x16905d,_0x42434e,_0x1ab968,_0x405adf,_0x2a8f7e,_0x117873,_0x5423c9;try{if(!_0x20ad1f[_0xd94d2e(0x29d)]){let _0x41ebfe=((_0x16905d=(_0x5aa30d=_0x20ad1f['process'])==null?void 0x0:_0x5aa30d[_0xd94d2e(0x2a9)])==null?void 0x0:_0x16905d[_0xd94d2e(0x286)])||((_0x1ab968=(_0x42434e=_0x20ad1f['process'])==null?void 0x0:_0x42434e[_0xd94d2e(0x282)])==null?void 0x0:_0x1ab968[_0xd94d2e(0x2c5)])==='edge';(_0x5cf68c===_0xd94d2e(0x244)||_0x5cf68c===_0xd94d2e(0x2d0)||_0x5cf68c===_0xd94d2e(0x27d)||_0x5cf68c===_0xd94d2e(0x25b))&&(_0x5cf68c+=_0x41ebfe?_0xd94d2e(0x222):_0xd94d2e(0x2a5));let _0x3b5c0e='';_0x5cf68c==='react-native'&&(_0x3b5c0e=(((_0x117873=(_0x2a8f7e=(_0x405adf=_0x20ad1f[_0xd94d2e(0x23f)])==null?void 0x0:_0x405adf['modules'])==null?void 0x0:_0x2a8f7e[_0xd94d2e(0x2b9)])==null?void 0x0:_0x117873[_0xd94d2e(0x280)])||_0xd94d2e(0x235))[_0xd94d2e(0x2b3)](),_0x3b5c0e&&(_0x5cf68c+='\\x20'+_0x3b5c0e,(_0x3b5c0e===_0xd94d2e(0x294)||_0x3b5c0e===_0xd94d2e(0x235)&&((_0x5423c9=_0x20ad1f[_0xd94d2e(0x1e9)])==null?void 0x0:_0x5423c9['hostname'])===_0xd94d2e(0x1ea))&&(_0x2292c5=_0xd94d2e(0x1ea)))),_0x20ad1f[_0xd94d2e(0x29d)]={'id':+new Date(),'tool':_0x5cf68c},_0x2ca164&&_0x5cf68c&&!_0x41ebfe&&(_0x3b5c0e?console['log'](_0xd94d2e(0x2bd)+_0x3b5c0e+_0xd94d2e(0x217)):console[_0xd94d2e(0x2d3)](_0xd94d2e(0x2e6)+(_0x5cf68c['charAt'](0x0)[_0xd94d2e(0x20b)]()+_0x5cf68c[_0xd94d2e(0x24a)](0x1))+',',_0xd94d2e(0x20e),'see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.'));}let _0x326972=new z(_0x20ad1f,_0x2292c5,_0x2d32cd,_0x23d982,_0x2bf037,_0x17c366);return _0x326972[_0xd94d2e(0x26d)]['bind'](_0x326972);}catch(_0x266308){return console[_0xd94d2e(0x213)]('logger\\x20failed\\x20to\\x20connect\\x20to\\x20host',_0x266308&&_0x266308[_0xd94d2e(0x1ff)]),()=>{};}});return _0x3b9c7f=>_0x540a51['forEach'](_0x742346=>_0x742346(_0x3b9c7f));}function ne(_0x31e108,_0x3ec168,_0x417cab,_0xfd62c4){var _0x4be061=_0x3890c8;_0xfd62c4&&_0x31e108===_0x4be061(0x22a)&&_0x417cab[_0x4be061(0x1e9)][_0x4be061(0x22a)]();}function b(_0x30160c){var _0x151986=_0x3890c8,_0x2c787f,_0x2a95b9;let _0x2b4527=function(_0x1f6955,_0x424bf1){return _0x424bf1-_0x1f6955;},_0x19085c;if(_0x30160c[_0x151986(0x20a)])_0x19085c=function(){var _0x56aa7e=_0x151986;return _0x30160c[_0x56aa7e(0x20a)][_0x56aa7e(0x2b0)]();};else{if(_0x30160c[_0x151986(0x266)]&&_0x30160c[_0x151986(0x266)][_0x151986(0x2b5)]&&((_0x2a95b9=(_0x2c787f=_0x30160c[_0x151986(0x266)])==null?void 0x0:_0x2c787f[_0x151986(0x282)])==null?void 0x0:_0x2a95b9['NEXT_RUNTIME'])!==_0x151986(0x272))_0x19085c=function(){var _0x2687a2=_0x151986;return _0x30160c[_0x2687a2(0x266)][_0x2687a2(0x2b5)]();},_0x2b4527=function(_0x841d75,_0x2991da){return 0x3e8*(_0x2991da[0x0]-_0x841d75[0x0])+(_0x2991da[0x1]-_0x841d75[0x1])/0xf4240;};else try{let {performance:_0xd3a2df}=require(_0x151986(0x2dc));_0x19085c=function(){var _0x52330d=_0x151986;return _0xd3a2df[_0x52330d(0x2b0)]();};}catch{_0x19085c=function(){return+new Date();};}}return{'elapsed':_0x2b4527,'timeStamp':_0x19085c,'now':()=>Date[_0x151986(0x2b0)]()};}function X(_0x31ddec,_0x301594,_0x57b351){var _0xd50045=_0x3890c8,_0x21878c,_0x18f50c,_0x1295d0,_0x2b81d1,_0x429f3b,_0x1a0b9b,_0x4dbdad;if(_0x31ddec[_0xd50045(0x24c)]!==void 0x0)return _0x31ddec[_0xd50045(0x24c)];let _0x36bf8=((_0x18f50c=(_0x21878c=_0x31ddec['process'])==null?void 0x0:_0x21878c[_0xd50045(0x2a9)])==null?void 0x0:_0x18f50c[_0xd50045(0x286)])||((_0x2b81d1=(_0x1295d0=_0x31ddec[_0xd50045(0x266)])==null?void 0x0:_0x1295d0[_0xd50045(0x282)])==null?void 0x0:_0x2b81d1['NEXT_RUNTIME'])===_0xd50045(0x272),_0xd67b84=!!(_0x57b351===_0xd50045(0x2ad)&&((_0x429f3b=_0x31ddec[_0xd50045(0x23f)])==null?void 0x0:_0x429f3b[_0xd50045(0x2cb)]));function _0x224a39(_0x3f855b){var _0x554bf3=_0xd50045;if(_0x3f855b['startsWith']('/')&&_0x3f855b[_0x554bf3(0x1f8)]('/')){let _0x1a86b1=new RegExp(_0x3f855b['slice'](0x1,-0x1));return _0xda75d7=>_0x1a86b1[_0x554bf3(0x25d)](_0xda75d7);}else{if(_0x3f855b[_0x554bf3(0x20d)]('*')||_0x3f855b[_0x554bf3(0x20d)]('?')){let _0x1cb7b0=new RegExp('^'+_0x3f855b['replace'](/\\./g,String[_0x554bf3(0x2a4)](0x5c)+'.')['replace'](/\\*/g,'.*')['replace'](/\\?/g,'.')+String[_0x554bf3(0x2a4)](0x24));return _0x3d762c=>_0x1cb7b0['test'](_0x3d762c);}else return _0x362679=>_0x362679===_0x3f855b;}}let _0x8cb568=_0x301594[_0xd50045(0x292)](_0x224a39);return _0x31ddec[_0xd50045(0x24c)]=_0x36bf8||!_0x301594,!_0x31ddec[_0xd50045(0x24c)]&&((_0x1a0b9b=_0x31ddec[_0xd50045(0x1e9)])==null?void 0x0:_0x1a0b9b[_0xd50045(0x270)])&&(_0x31ddec[_0xd50045(0x24c)]=_0x8cb568[_0xd50045(0x1df)](_0x16149e=>_0x16149e(_0x31ddec[_0xd50045(0x1e9)][_0xd50045(0x270)]))),_0xd67b84&&!_0x31ddec[_0xd50045(0x24c)]&&!((_0x4dbdad=_0x31ddec[_0xd50045(0x1e9)])!=null&&_0x4dbdad[_0xd50045(0x270)])&&(_0x31ddec[_0xd50045(0x24c)]=!0x0),_0x31ddec[_0xd50045(0x24c)];}function J(_0x1b046d,_0x3af781,_0x5b51f5,_0x4cee6a,_0x39e136,_0x5d8b23){var _0x1f5d44=_0x3890c8;_0x1b046d=_0x1b046d,_0x3af781=_0x3af781,_0x5b51f5=_0x5b51f5,_0x4cee6a=_0x4cee6a,_0x39e136=_0x39e136,_0x39e136=_0x39e136||{},_0x39e136['defaultLimits']=_0x39e136['defaultLimits']||{},_0x39e136[_0x1f5d44(0x225)]=_0x39e136[_0x1f5d44(0x225)]||{},_0x39e136[_0x1f5d44(0x236)]=_0x39e136[_0x1f5d44(0x236)]||{},_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x291)]=_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x291)]||{},_0x39e136[_0x1f5d44(0x236)]['global']=_0x39e136[_0x1f5d44(0x236)]['global']||{};let _0x4756a1={'perLogpoint':{'reduceOnCount':_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x291)][_0x1f5d44(0x1e8)]||0x32,'reduceOnAccumulatedProcessingTimeMs':_0x39e136['reducePolicy'][_0x1f5d44(0x291)][_0x1f5d44(0x281)]||0x64,'resetWhenQuietMs':_0x39e136[_0x1f5d44(0x236)]['perLogpoint']['resetWhenQuietMs']||0x1f4,'resetOnProcessingTimeAverageMs':_0x39e136[_0x1f5d44(0x236)]['perLogpoint']['resetOnProcessingTimeAverageMs']||0x64},'global':{'reduceOnCount':_0x39e136['reducePolicy'][_0x1f5d44(0x2d7)][_0x1f5d44(0x1e8)]||0x3e8,'reduceOnAccumulatedProcessingTimeMs':_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x2d7)]['reduceOnAccumulatedProcessingTimeMs']||0x12c,'resetWhenQuietMs':_0x39e136[_0x1f5d44(0x236)]['global'][_0x1f5d44(0x264)]||0x32,'resetOnProcessingTimeAverageMs':_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x2d7)][_0x1f5d44(0x231)]||0x64}},_0x41af91=b(_0x1b046d),_0x13f85b=_0x41af91[_0x1f5d44(0x276)],_0x5553e9=_0x41af91[_0x1f5d44(0x2be)];function _0x39602c(){var _0x293841=_0x1f5d44;this[_0x293841(0x243)]=/^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[_$a-zA-Z\\xA0-\\uFFFF][_$a-zA-Z0-9\\xA0-\\uFFFF]*$/,this[_0x293841(0x279)]=/^(0|[1-9][0-9]*)$/,this[_0x293841(0x205)]=/'([^\\\\']|\\\\')*'/,this['_undefined']=_0x1b046d[_0x293841(0x2cd)],this[_0x293841(0x26f)]=_0x1b046d[_0x293841(0x23a)],this['_getOwnPropertyDescriptor']=Object[_0x293841(0x1f3)],this[_0x293841(0x202)]=Object['getOwnPropertyNames'],this['_Symbol']=_0x1b046d[_0x293841(0x22c)],this[_0x293841(0x215)]=RegExp[_0x293841(0x27c)][_0x293841(0x269)],this['_dateToString']=Date[_0x293841(0x27c)][_0x293841(0x269)];}_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2b2)]=function(_0x254f7f,_0x1babfb,_0x2e90c6,_0xdb54a9){var _0x33bfa3=_0x1f5d44,_0x168568=this,_0x471824=_0x2e90c6[_0x33bfa3(0x2bf)];function _0x3a3c67(_0x142852,_0x2cc0b4,_0x381677){var _0x16d30c=_0x33bfa3;_0x2cc0b4[_0x16d30c(0x27b)]=_0x16d30c(0x2a8),_0x2cc0b4[_0x16d30c(0x29e)]=_0x142852[_0x16d30c(0x1ff)],_0x3b2ef2=_0x381677[_0x16d30c(0x286)]['current'],_0x381677[_0x16d30c(0x286)][_0x16d30c(0x200)]=_0x2cc0b4,_0x168568[_0x16d30c(0x24f)](_0x2cc0b4,_0x381677);}let _0x361300,_0x7450c3,_0x1f473b=_0x1b046d[_0x33bfa3(0x240)];_0x1b046d[_0x33bfa3(0x240)]=!0x0,_0x1b046d[_0x33bfa3(0x1e7)]&&(_0x361300=_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x29e)],_0x7450c3=_0x1b046d['console'][_0x33bfa3(0x213)],_0x361300&&(_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x29e)]=function(){}),_0x7450c3&&(_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x213)]=function(){}));try{try{_0x2e90c6[_0x33bfa3(0x2c9)]++,_0x2e90c6[_0x33bfa3(0x2bf)]&&_0x2e90c6[_0x33bfa3(0x1e2)]['push'](_0x1babfb);var _0x2e727d,_0x4ce0a7,_0x5c981d,_0x3de9f4,_0x2ee350=[],_0x1fd1ab=[],_0x5481d5,_0x4e2612=this[_0x33bfa3(0x297)](_0x1babfb),_0x443a68=_0x4e2612==='array',_0xf19808=!0x1,_0x10ecde=_0x4e2612===_0x33bfa3(0x230),_0x4ec234=this[_0x33bfa3(0x1fc)](_0x4e2612),_0x13a3ac=this[_0x33bfa3(0x28e)](_0x4e2612),_0x21daba=_0x4ec234||_0x13a3ac,_0x5d7eb8={},_0x4a200a=0x0,_0x2e69b1=!0x1,_0x3b2ef2,_0x1ec59c=/^(([1-9]{1}[0-9]*)|0)$/;if(_0x2e90c6['depth']){if(_0x443a68){if(_0x4ce0a7=_0x1babfb[_0x33bfa3(0x1ee)],_0x4ce0a7>_0x2e90c6['elements']){for(_0x5c981d=0x0,_0x3de9f4=_0x2e90c6[_0x33bfa3(0x1f7)],_0x2e727d=_0x5c981d;_0x2e727d<_0x3de9f4;_0x2e727d++)_0x1fd1ab['push'](_0x168568[_0x33bfa3(0x223)](_0x2ee350,_0x1babfb,_0x4e2612,_0x2e727d,_0x2e90c6));_0x254f7f[_0x33bfa3(0x228)]=!0x0;}else{for(_0x5c981d=0x0,_0x3de9f4=_0x4ce0a7,_0x2e727d=_0x5c981d;_0x2e727d<_0x3de9f4;_0x2e727d++)_0x1fd1ab['push'](_0x168568[_0x33bfa3(0x223)](_0x2ee350,_0x1babfb,_0x4e2612,_0x2e727d,_0x2e90c6));}_0x2e90c6['autoExpandPropertyCount']+=_0x1fd1ab[_0x33bfa3(0x1ee)];}if(!(_0x4e2612===_0x33bfa3(0x2d8)||_0x4e2612===_0x33bfa3(0x2cd))&&!_0x4ec234&&_0x4e2612!=='String'&&_0x4e2612!==_0x33bfa3(0x252)&&_0x4e2612!==_0x33bfa3(0x267)){var _0x2d45fa=_0xdb54a9[_0x33bfa3(0x1ef)]||_0x2e90c6[_0x33bfa3(0x1ef)];if(this['_isSet'](_0x1babfb)?(_0x2e727d=0x0,_0x1babfb[_0x33bfa3(0x2c8)](function(_0x3b3e4c){var _0x118b02=_0x33bfa3;if(_0x4a200a++,_0x2e90c6['autoExpandPropertyCount']++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;return;}if(!_0x2e90c6[_0x118b02(0x2af)]&&_0x2e90c6['autoExpand']&&_0x2e90c6[_0x118b02(0x28f)]>_0x2e90c6[_0x118b02(0x28a)]){_0x2e69b1=!0x0;return;}_0x1fd1ab[_0x118b02(0x2e0)](_0x168568[_0x118b02(0x223)](_0x2ee350,_0x1babfb,'Set',_0x2e727d++,_0x2e90c6,function(_0xba6f7b){return function(){return _0xba6f7b;};}(_0x3b3e4c)));})):this[_0x33bfa3(0x2ea)](_0x1babfb)&&_0x1babfb[_0x33bfa3(0x2c8)](function(_0x26b876,_0x1cd31e){var _0x13d9e6=_0x33bfa3;if(_0x4a200a++,_0x2e90c6[_0x13d9e6(0x28f)]++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;return;}if(!_0x2e90c6[_0x13d9e6(0x2af)]&&_0x2e90c6[_0x13d9e6(0x2bf)]&&_0x2e90c6[_0x13d9e6(0x28f)]>_0x2e90c6[_0x13d9e6(0x28a)]){_0x2e69b1=!0x0;return;}var _0x5245d5=_0x1cd31e[_0x13d9e6(0x269)]();_0x5245d5['length']>0x64&&(_0x5245d5=_0x5245d5[_0x13d9e6(0x232)](0x0,0x64)+'...'),_0x1fd1ab[_0x13d9e6(0x2e0)](_0x168568['_addProperty'](_0x2ee350,_0x1babfb,_0x13d9e6(0x283),_0x5245d5,_0x2e90c6,function(_0x437b32){return function(){return _0x437b32;};}(_0x26b876)));}),!_0xf19808){try{for(_0x5481d5 in _0x1babfb)if(!(_0x443a68&&_0x1ec59c[_0x33bfa3(0x25d)](_0x5481d5))&&!this[_0x33bfa3(0x251)](_0x1babfb,_0x5481d5,_0x2e90c6)){if(_0x4a200a++,_0x2e90c6['autoExpandPropertyCount']++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;break;}if(!_0x2e90c6['isExpressionToEvaluate']&&_0x2e90c6[_0x33bfa3(0x2bf)]&&_0x2e90c6[_0x33bfa3(0x28f)]>_0x2e90c6[_0x33bfa3(0x28a)]){_0x2e69b1=!0x0;break;}_0x1fd1ab[_0x33bfa3(0x2e0)](_0x168568[_0x33bfa3(0x1dd)](_0x2ee350,_0x5d7eb8,_0x1babfb,_0x4e2612,_0x5481d5,_0x2e90c6));}}catch{}if(_0x5d7eb8[_0x33bfa3(0x214)]=!0x0,_0x10ecde&&(_0x5d7eb8[_0x33bfa3(0x248)]=!0x0),!_0x2e69b1){var _0x4a9287=[][_0x33bfa3(0x29c)](this[_0x33bfa3(0x202)](_0x1babfb))['concat'](this[_0x33bfa3(0x2c1)](_0x1babfb));for(_0x2e727d=0x0,_0x4ce0a7=_0x4a9287[_0x33bfa3(0x1ee)];_0x2e727d<_0x4ce0a7;_0x2e727d++)if(_0x5481d5=_0x4a9287[_0x2e727d],!(_0x443a68&&_0x1ec59c[_0x33bfa3(0x25d)](_0x5481d5['toString']()))&&!this[_0x33bfa3(0x251)](_0x1babfb,_0x5481d5,_0x2e90c6)&&!_0x5d7eb8[typeof _0x5481d5!=_0x33bfa3(0x2ca)?_0x33bfa3(0x2ba)+_0x5481d5['toString']():_0x5481d5]){if(_0x4a200a++,_0x2e90c6[_0x33bfa3(0x28f)]++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;break;}if(!_0x2e90c6[_0x33bfa3(0x2af)]&&_0x2e90c6[_0x33bfa3(0x2bf)]&&_0x2e90c6[_0x33bfa3(0x28f)]>_0x2e90c6[_0x33bfa3(0x28a)]){_0x2e69b1=!0x0;break;}_0x1fd1ab['push'](_0x168568[_0x33bfa3(0x1dd)](_0x2ee350,_0x5d7eb8,_0x1babfb,_0x4e2612,_0x5481d5,_0x2e90c6));}}}}}if(_0x254f7f['type']=_0x4e2612,_0x21daba?(_0x254f7f[_0x33bfa3(0x2e9)]=_0x1babfb[_0x33bfa3(0x2b8)](),this[_0x33bfa3(0x298)](_0x4e2612,_0x254f7f,_0x2e90c6,_0xdb54a9)):_0x4e2612===_0x33bfa3(0x24d)?_0x254f7f[_0x33bfa3(0x2e9)]=this[_0x33bfa3(0x2aa)]['call'](_0x1babfb):_0x4e2612===_0x33bfa3(0x267)?_0x254f7f[_0x33bfa3(0x2e9)]=_0x1babfb['toString']():_0x4e2612===_0x33bfa3(0x285)?_0x254f7f['value']=this[_0x33bfa3(0x215)][_0x33bfa3(0x1ec)](_0x1babfb):_0x4e2612===_0x33bfa3(0x2ca)&&this[_0x33bfa3(0x2cc)]?_0x254f7f[_0x33bfa3(0x2e9)]=this[_0x33bfa3(0x2cc)]['prototype'][_0x33bfa3(0x269)]['call'](_0x1babfb):!_0x2e90c6[_0x33bfa3(0x2d4)]&&!(_0x4e2612===_0x33bfa3(0x2d8)||_0x4e2612===_0x33bfa3(0x2cd))&&(delete _0x254f7f[_0x33bfa3(0x2e9)],_0x254f7f[_0x33bfa3(0x20c)]=!0x0),_0x2e69b1&&(_0x254f7f['cappedProps']=!0x0),_0x3b2ef2=_0x2e90c6[_0x33bfa3(0x286)][_0x33bfa3(0x200)],_0x2e90c6['node'][_0x33bfa3(0x200)]=_0x254f7f,this['_treeNodePropertiesBeforeFullValue'](_0x254f7f,_0x2e90c6),_0x1fd1ab['length']){for(_0x2e727d=0x0,_0x4ce0a7=_0x1fd1ab['length'];_0x2e727d<_0x4ce0a7;_0x2e727d++)_0x1fd1ab[_0x2e727d](_0x2e727d);}_0x2ee350[_0x33bfa3(0x1ee)]&&(_0x254f7f[_0x33bfa3(0x1ef)]=_0x2ee350);}catch(_0x36e778){_0x3a3c67(_0x36e778,_0x254f7f,_0x2e90c6);}this[_0x33bfa3(0x2c7)](_0x1babfb,_0x254f7f),this[_0x33bfa3(0x2e5)](_0x254f7f,_0x2e90c6),_0x2e90c6[_0x33bfa3(0x286)][_0x33bfa3(0x200)]=_0x3b2ef2,_0x2e90c6[_0x33bfa3(0x2c9)]--,_0x2e90c6[_0x33bfa3(0x2bf)]=_0x471824,_0x2e90c6['autoExpand']&&_0x2e90c6[_0x33bfa3(0x1e2)][_0x33bfa3(0x27e)]();}finally{_0x361300&&(_0x1b046d['console'][_0x33bfa3(0x29e)]=_0x361300),_0x7450c3&&(_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x213)]=_0x7450c3),_0x1b046d[_0x33bfa3(0x240)]=_0x1f473b;}return _0x254f7f;},_0x39602c[_0x1f5d44(0x27c)]['_getOwnPropertySymbols']=function(_0xd19fef){var _0x1f8178=_0x1f5d44;return Object['getOwnPropertySymbols']?Object[_0x1f8178(0x209)](_0xd19fef):[];},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x219)]=function(_0x5ece89){var _0x396459=_0x1f5d44;return!!(_0x5ece89&&_0x1b046d['Set']&&this[_0x396459(0x2a0)](_0x5ece89)===_0x396459(0x2ce)&&_0x5ece89[_0x396459(0x2c8)]);},_0x39602c['prototype'][_0x1f5d44(0x251)]=function(_0x5e3ecf,_0x457efe,_0x503699){var _0x58ab93=_0x1f5d44;if(!_0x503699[_0x58ab93(0x226)]){let _0x40a764=this['_getOwnPropertyDescriptor'](_0x5e3ecf,_0x457efe);if(_0x40a764&&_0x40a764[_0x58ab93(0x1eb)])return!0x0;}return _0x503699[_0x58ab93(0x1f5)]?typeof _0x5e3ecf[_0x457efe]==_0x58ab93(0x230):!0x1;},_0x39602c['prototype'][_0x1f5d44(0x297)]=function(_0x55aea2){var _0x3223a6=_0x1f5d44,_0x435cfc='';return _0x435cfc=typeof _0x55aea2,_0x435cfc===_0x3223a6(0x26a)?this[_0x3223a6(0x2a0)](_0x55aea2)==='[object\\x20Array]'?_0x435cfc=_0x3223a6(0x260):this['_objectToString'](_0x55aea2)===_0x3223a6(0x287)?_0x435cfc=_0x3223a6(0x24d):this['_objectToString'](_0x55aea2)===_0x3223a6(0x2bc)?_0x435cfc=_0x3223a6(0x267):_0x55aea2===null?_0x435cfc='null':_0x55aea2[_0x3223a6(0x277)]&&(_0x435cfc=_0x55aea2[_0x3223a6(0x277)][_0x3223a6(0x273)]||_0x435cfc):_0x435cfc===_0x3223a6(0x2cd)&&this[_0x3223a6(0x26f)]&&_0x55aea2 instanceof this[_0x3223a6(0x26f)]&&(_0x435cfc=_0x3223a6(0x23a)),_0x435cfc;},_0x39602c['prototype'][_0x1f5d44(0x2a0)]=function(_0x2bac5a){var _0x4622cb=_0x1f5d44;return Object['prototype'][_0x4622cb(0x269)][_0x4622cb(0x1ec)](_0x2bac5a);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x1fc)]=function(_0x2ccf2c){var _0x674b58=_0x1f5d44;return _0x2ccf2c===_0x674b58(0x1e0)||_0x2ccf2c===_0x674b58(0x1f2)||_0x2ccf2c===_0x674b58(0x2e8);},_0x39602c[_0x1f5d44(0x27c)]['_isPrimitiveWrapperType']=function(_0x5299e2){var _0x55fd87=_0x1f5d44;return _0x5299e2===_0x55fd87(0x2d5)||_0x5299e2==='String'||_0x5299e2===_0x55fd87(0x245);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x223)]=function(_0x157555,_0x1174b0,_0x2697a9,_0x20ea02,_0x1e29d4,_0x5f3380){var _0x174700=this;return function(_0x3816dd){var _0x4b6516=_0x4187,_0x57f376=_0x1e29d4[_0x4b6516(0x286)][_0x4b6516(0x200)],_0xed0e7b=_0x1e29d4[_0x4b6516(0x286)]['index'],_0x57849c=_0x1e29d4['node'][_0x4b6516(0x261)];_0x1e29d4['node']['parent']=_0x57f376,_0x1e29d4[_0x4b6516(0x286)]['index']=typeof _0x20ea02==_0x4b6516(0x2e8)?_0x20ea02:_0x3816dd,_0x157555[_0x4b6516(0x2e0)](_0x174700[_0x4b6516(0x208)](_0x1174b0,_0x2697a9,_0x20ea02,_0x1e29d4,_0x5f3380)),_0x1e29d4[_0x4b6516(0x286)]['parent']=_0x57849c,_0x1e29d4['node'][_0x4b6516(0x2b4)]=_0xed0e7b;};},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x1dd)]=function(_0x16666b,_0x37b24a,_0xca6b76,_0x5eaca8,_0x47f24d,_0x518bd1,_0x3aad4c){var _0x5a59c9=_0x1f5d44,_0x5d7f32=this;return _0x37b24a[typeof _0x47f24d!=_0x5a59c9(0x2ca)?_0x5a59c9(0x2ba)+_0x47f24d['toString']():_0x47f24d]=!0x0,function(_0x186abb){var _0x227537=_0x5a59c9,_0x93753=_0x518bd1[_0x227537(0x286)]['current'],_0x3a8b46=_0x518bd1[_0x227537(0x286)][_0x227537(0x2b4)],_0x5cf7ec=_0x518bd1[_0x227537(0x286)]['parent'];_0x518bd1[_0x227537(0x286)]['parent']=_0x93753,_0x518bd1['node'][_0x227537(0x2b4)]=_0x186abb,_0x16666b[_0x227537(0x2e0)](_0x5d7f32[_0x227537(0x208)](_0xca6b76,_0x5eaca8,_0x47f24d,_0x518bd1,_0x3aad4c)),_0x518bd1[_0x227537(0x286)][_0x227537(0x261)]=_0x5cf7ec,_0x518bd1[_0x227537(0x286)]['index']=_0x3a8b46;};},_0x39602c[_0x1f5d44(0x27c)]['_property']=function(_0x1e9096,_0x2437b1,_0x5a258e,_0x306875,_0xeb1ab2){var _0x2e8b77=_0x1f5d44,_0x1ab203=this;_0xeb1ab2||(_0xeb1ab2=function(_0x2125a7,_0x5a8e51){return _0x2125a7[_0x5a8e51];});var _0x1a70b4=_0x5a258e[_0x2e8b77(0x269)](),_0x4a3b80=_0x306875[_0x2e8b77(0x27f)]||{},_0x4ec463=_0x306875[_0x2e8b77(0x2d4)],_0x436a10=_0x306875['isExpressionToEvaluate'];try{var _0x4a65f6=this[_0x2e8b77(0x2ea)](_0x1e9096),_0x14070f=_0x1a70b4;_0x4a65f6&&_0x14070f[0x0]==='\\x27'&&(_0x14070f=_0x14070f[_0x2e8b77(0x24a)](0x1,_0x14070f['length']-0x2));var _0x33f2fd=_0x306875[_0x2e8b77(0x27f)]=_0x4a3b80[_0x2e8b77(0x2ba)+_0x14070f];_0x33f2fd&&(_0x306875['depth']=_0x306875[_0x2e8b77(0x2d4)]+0x1),_0x306875['isExpressionToEvaluate']=!!_0x33f2fd;var _0x761c47=typeof _0x5a258e==_0x2e8b77(0x2ca),_0x2a07c1={'name':_0x761c47||_0x4a65f6?_0x1a70b4:this['_propertyName'](_0x1a70b4)};if(_0x761c47&&(_0x2a07c1[_0x2e8b77(0x2ca)]=!0x0),!(_0x2437b1===_0x2e8b77(0x260)||_0x2437b1===_0x2e8b77(0x2e7))){var _0x336b0f=this[_0x2e8b77(0x212)](_0x1e9096,_0x5a258e);if(_0x336b0f&&(_0x336b0f[_0x2e8b77(0x257)]&&(_0x2a07c1['setter']=!0x0),_0x336b0f[_0x2e8b77(0x1eb)]&&!_0x33f2fd&&!_0x306875[_0x2e8b77(0x226)]))return _0x2a07c1['getter']=!0x0,this[_0x2e8b77(0x237)](_0x2a07c1,_0x306875),_0x2a07c1;}var _0x42b0f3;try{_0x42b0f3=_0xeb1ab2(_0x1e9096,_0x5a258e);}catch(_0x470aa0){return _0x2a07c1={'name':_0x1a70b4,'type':_0x2e8b77(0x2a8),'error':_0x470aa0[_0x2e8b77(0x1ff)]},this[_0x2e8b77(0x237)](_0x2a07c1,_0x306875),_0x2a07c1;}var _0x3f69d6=this[_0x2e8b77(0x297)](_0x42b0f3),_0x26ec12=this[_0x2e8b77(0x1fc)](_0x3f69d6);if(_0x2a07c1['type']=_0x3f69d6,_0x26ec12)this['_processTreeNodeResult'](_0x2a07c1,_0x306875,_0x42b0f3,function(){var _0x27d61e=_0x2e8b77;_0x2a07c1[_0x27d61e(0x2e9)]=_0x42b0f3[_0x27d61e(0x2b8)](),!_0x33f2fd&&_0x1ab203[_0x27d61e(0x298)](_0x3f69d6,_0x2a07c1,_0x306875,{});});else{var _0x353800=_0x306875[_0x2e8b77(0x2bf)]&&_0x306875[_0x2e8b77(0x2c9)]<_0x306875[_0x2e8b77(0x21f)]&&_0x306875[_0x2e8b77(0x1e2)][_0x2e8b77(0x229)](_0x42b0f3)<0x0&&_0x3f69d6!==_0x2e8b77(0x230)&&_0x306875['autoExpandPropertyCount']<_0x306875[_0x2e8b77(0x28a)];_0x353800||_0x306875[_0x2e8b77(0x2c9)]<_0x4ec463||_0x33f2fd?this['serialize'](_0x2a07c1,_0x42b0f3,_0x306875,_0x33f2fd||{}):this[_0x2e8b77(0x237)](_0x2a07c1,_0x306875,_0x42b0f3,function(){var _0x26b4af=_0x2e8b77;_0x3f69d6==='null'||_0x3f69d6===_0x26b4af(0x2cd)||(delete _0x2a07c1[_0x26b4af(0x2e9)],_0x2a07c1[_0x26b4af(0x20c)]=!0x0);});}return _0x2a07c1;}finally{_0x306875[_0x2e8b77(0x27f)]=_0x4a3b80,_0x306875[_0x2e8b77(0x2d4)]=_0x4ec463,_0x306875[_0x2e8b77(0x2af)]=_0x436a10;}},_0x39602c[_0x1f5d44(0x27c)]['_capIfString']=function(_0x400724,_0x56f824,_0x52035a,_0x2a5d1b){var _0x1c76fb=_0x1f5d44,_0x5d1231=_0x2a5d1b[_0x1c76fb(0x23c)]||_0x52035a[_0x1c76fb(0x23c)];if((_0x400724===_0x1c76fb(0x1f2)||_0x400724===_0x1c76fb(0x23b))&&_0x56f824[_0x1c76fb(0x2e9)]){let _0x1dff43=_0x56f824[_0x1c76fb(0x2e9)][_0x1c76fb(0x1ee)];_0x52035a[_0x1c76fb(0x2b7)]+=_0x1dff43,_0x52035a[_0x1c76fb(0x2b7)]>_0x52035a[_0x1c76fb(0x1de)]?(_0x56f824[_0x1c76fb(0x20c)]='',delete _0x56f824[_0x1c76fb(0x2e9)]):_0x1dff43>_0x5d1231&&(_0x56f824[_0x1c76fb(0x20c)]=_0x56f824['value'][_0x1c76fb(0x24a)](0x0,_0x5d1231),delete _0x56f824[_0x1c76fb(0x2e9)]);}},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2ea)]=function(_0x2b582){var _0x4f59b4=_0x1f5d44;return!!(_0x2b582&&_0x1b046d[_0x4f59b4(0x283)]&&this[_0x4f59b4(0x2a0)](_0x2b582)===_0x4f59b4(0x2d2)&&_0x2b582[_0x4f59b4(0x2c8)]);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x1ed)]=function(_0xd0769c){var _0x56daad=_0x1f5d44;if(_0xd0769c[_0x56daad(0x207)](/^\\d+$/))return _0xd0769c;var _0x44321c;try{_0x44321c=JSON[_0x56daad(0x274)](''+_0xd0769c);}catch{_0x44321c='\\x22'+this[_0x56daad(0x2a0)](_0xd0769c)+'\\x22';}return _0x44321c[_0x56daad(0x207)](/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?_0x44321c=_0x44321c[_0x56daad(0x24a)](0x1,_0x44321c[_0x56daad(0x1ee)]-0x2):_0x44321c=_0x44321c[_0x56daad(0x2c4)](/'/g,'\\x5c\\x27')[_0x56daad(0x2c4)](/\\\\"/g,'\\x22')[_0x56daad(0x2c4)](/(^"|"$)/g,'\\x27'),_0x44321c;},_0x39602c[_0x1f5d44(0x27c)]['_processTreeNodeResult']=function(_0x35d4de,_0x18bf2b,_0x4b4ba8,_0x5e4ad4){var _0x3ae3b4=_0x1f5d44;this[_0x3ae3b4(0x24f)](_0x35d4de,_0x18bf2b),_0x5e4ad4&&_0x5e4ad4(),this[_0x3ae3b4(0x2c7)](_0x4b4ba8,_0x35d4de),this['_treeNodePropertiesAfterFullValue'](_0x35d4de,_0x18bf2b);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x24f)]=function(_0x3fef10,_0x16c344){var _0x25886e=_0x1f5d44;this[_0x25886e(0x275)](_0x3fef10,_0x16c344),this[_0x25886e(0x2d1)](_0x3fef10,_0x16c344),this[_0x25886e(0x239)](_0x3fef10,_0x16c344),this['_setNodePermissions'](_0x3fef10,_0x16c344);},_0x39602c['prototype'][_0x1f5d44(0x275)]=function(_0x4a95cf,_0x5175f9){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2d1)]=function(_0x4dd70e,_0x1d0a77){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x250)]=function(_0x2add9b,_0x21294a){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x241)]=function(_0x57f907){return _0x57f907===this['_undefined'];},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2e5)]=function(_0x47895e,_0x5ee6d0){var _0x3bb2e6=_0x1f5d44;this[_0x3bb2e6(0x250)](_0x47895e,_0x5ee6d0),this['_setNodeExpandableState'](_0x47895e),_0x5ee6d0[_0x3bb2e6(0x2c3)]&&this[_0x3bb2e6(0x288)](_0x47895e),this[_0x3bb2e6(0x2db)](_0x47895e,_0x5ee6d0),this[_0x3bb2e6(0x23e)](_0x47895e,_0x5ee6d0),this[_0x3bb2e6(0x2ab)](_0x47895e);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2c7)]=function(_0x406f89,_0x5dc600){var _0x3d052f=_0x1f5d44;try{_0x406f89&&typeof _0x406f89[_0x3d052f(0x1ee)]==_0x3d052f(0x2e8)&&(_0x5dc600[_0x3d052f(0x1ee)]=_0x406f89['length']);}catch{}if(_0x5dc600[_0x3d052f(0x27b)]===_0x3d052f(0x2e8)||_0x5dc600[_0x3d052f(0x27b)]===_0x3d052f(0x245)){if(isNaN(_0x5dc600['value']))_0x5dc600[_0x3d052f(0x299)]=!0x0,delete _0x5dc600[_0x3d052f(0x2e9)];else switch(_0x5dc600['value']){case Number[_0x3d052f(0x1f9)]:_0x5dc600['positiveInfinity']=!0x0,delete _0x5dc600['value'];break;case Number['NEGATIVE_INFINITY']:_0x5dc600[_0x3d052f(0x25c)]=!0x0,delete _0x5dc600[_0x3d052f(0x2e9)];break;case 0x0:this[_0x3d052f(0x247)](_0x5dc600['value'])&&(_0x5dc600['negativeZero']=!0x0);break;}}else _0x5dc600[_0x3d052f(0x27b)]===_0x3d052f(0x230)&&typeof _0x406f89[_0x3d052f(0x273)]=='string'&&_0x406f89[_0x3d052f(0x273)]&&_0x5dc600[_0x3d052f(0x273)]&&_0x406f89[_0x3d052f(0x273)]!==_0x5dc600['name']&&(_0x5dc600[_0x3d052f(0x218)]=_0x406f89[_0x3d052f(0x273)]);},_0x39602c['prototype'][_0x1f5d44(0x247)]=function(_0x58bf0d){var _0x1eeae2=_0x1f5d44;return 0x1/_0x58bf0d===Number[_0x1eeae2(0x210)];},_0x39602c[_0x1f5d44(0x27c)]['_sortProps']=function(_0x4d7dd2){var _0x5c6f19=_0x1f5d44;!_0x4d7dd2['props']||!_0x4d7dd2[_0x5c6f19(0x1ef)]['length']||_0x4d7dd2['type']===_0x5c6f19(0x260)||_0x4d7dd2[_0x5c6f19(0x27b)]===_0x5c6f19(0x283)||_0x4d7dd2[_0x5c6f19(0x27b)]===_0x5c6f19(0x22b)||_0x4d7dd2[_0x5c6f19(0x1ef)][_0x5c6f19(0x1e3)](function(_0xb25f8,_0x3feabb){var _0x34181c=_0x5c6f19,_0x30ed1b=_0xb25f8[_0x34181c(0x273)][_0x34181c(0x2b3)](),_0x28978d=_0x3feabb['name'][_0x34181c(0x2b3)]();return _0x30ed1b<_0x28978d?-0x1:_0x30ed1b>_0x28978d?0x1:0x0;});},_0x39602c[_0x1f5d44(0x27c)]['_addFunctionsNode']=function(_0x5294e5,_0x377958){var _0x476737=_0x1f5d44;if(!(_0x377958[_0x476737(0x1f5)]||!_0x5294e5[_0x476737(0x1ef)]||!_0x5294e5['props'][_0x476737(0x1ee)])){for(var _0x23c633=[],_0x1cff31=[],_0x44160d=0x0,_0x4684cd=_0x5294e5['props'][_0x476737(0x1ee)];_0x44160d<_0x4684cd;_0x44160d++){var _0x36796e=_0x5294e5['props'][_0x44160d];_0x36796e[_0x476737(0x27b)]===_0x476737(0x230)?_0x23c633[_0x476737(0x2e0)](_0x36796e):_0x1cff31[_0x476737(0x2e0)](_0x36796e);}if(!(!_0x1cff31[_0x476737(0x1ee)]||_0x23c633[_0x476737(0x1ee)]<=0x1)){_0x5294e5[_0x476737(0x1ef)]=_0x1cff31;var _0x1e6ca0={'functionsNode':!0x0,'props':_0x23c633};this[_0x476737(0x275)](_0x1e6ca0,_0x377958),this[_0x476737(0x250)](_0x1e6ca0,_0x377958),this[_0x476737(0x2df)](_0x1e6ca0),this[_0x476737(0x1e4)](_0x1e6ca0,_0x377958),_0x1e6ca0['id']+='\\x20f',_0x5294e5[_0x476737(0x1ef)][_0x476737(0x21b)](_0x1e6ca0);}}},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x23e)]=function(_0xc708e1,_0x1404ba){},_0x39602c['prototype']['_setNodeExpandableState']=function(_0x44d604){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x22d)]=function(_0x3c17fb){var _0x14eb98=_0x1f5d44;return Array[_0x14eb98(0x2a1)](_0x3c17fb)||typeof _0x3c17fb==_0x14eb98(0x26a)&&this['_objectToString'](_0x3c17fb)===_0x14eb98(0x21c);},_0x39602c[_0x1f5d44(0x27c)]['_setNodePermissions']=function(_0x1360b0,_0x443f96){},_0x39602c[_0x1f5d44(0x27c)]['_cleanNode']=function(_0x26f307){var _0x360d43=_0x1f5d44;delete _0x26f307[_0x360d43(0x1f0)],delete _0x26f307['_hasSetOnItsPath'],delete _0x26f307[_0x360d43(0x2de)];},_0x39602c['prototype'][_0x1f5d44(0x239)]=function(_0x21594a,_0x1ea38a){};let _0x4fccde=new _0x39602c(),_0x5aef3e={'props':_0x39e136['defaultLimits'][_0x1f5d44(0x1ef)]||0x64,'elements':_0x39e136['defaultLimits']['elements']||0x64,'strLength':_0x39e136[_0x1f5d44(0x1dc)][_0x1f5d44(0x23c)]||0x400*0x32,'totalStrLength':_0x39e136['defaultLimits'][_0x1f5d44(0x1de)]||0x400*0x32,'autoExpandLimit':_0x39e136['defaultLimits'][_0x1f5d44(0x28a)]||0x1388,'autoExpandMaxDepth':_0x39e136['defaultLimits'][_0x1f5d44(0x21f)]||0xa},_0x374151={'props':_0x39e136[_0x1f5d44(0x225)][_0x1f5d44(0x1ef)]||0x5,'elements':_0x39e136[_0x1f5d44(0x225)][_0x1f5d44(0x1f7)]||0x5,'strLength':_0x39e136[_0x1f5d44(0x225)]['strLength']||0x100,'totalStrLength':_0x39e136[_0x1f5d44(0x225)][_0x1f5d44(0x1de)]||0x100*0x3,'autoExpandLimit':_0x39e136['reducedLimits'][_0x1f5d44(0x28a)]||0x1e,'autoExpandMaxDepth':_0x39e136['reducedLimits']['autoExpandMaxDepth']||0x2};if(_0x5d8b23){let _0x275f95=_0x4fccde['serialize'][_0x1f5d44(0x262)](_0x4fccde);_0x4fccde[_0x1f5d44(0x2b2)]=function(_0x1c90b2,_0x4276f3,_0x30aacd,_0x55932d){return _0x275f95(_0x1c90b2,_0x5d8b23(_0x4276f3),_0x30aacd,_0x55932d);};}function _0x1a7762(_0x577f01,_0x418059,_0x269690,_0x32321b,_0x4cd5b2,_0x52912d){var _0x4ce86f=_0x1f5d44;let _0x3eb726,_0xb700fa;try{_0xb700fa=_0x5553e9(),_0x3eb726=_0x5b51f5[_0x418059],!_0x3eb726||_0xb700fa-_0x3eb726['ts']>_0x4756a1[_0x4ce86f(0x291)][_0x4ce86f(0x264)]&&_0x3eb726['count']&&_0x3eb726[_0x4ce86f(0x255)]/_0x3eb726[_0x4ce86f(0x238)]<_0x4756a1['perLogpoint']['resetOnProcessingTimeAverageMs']?(_0x5b51f5[_0x418059]=_0x3eb726={'count':0x0,'time':0x0,'ts':_0xb700fa},_0x5b51f5[_0x4ce86f(0x206)]={}):_0xb700fa-_0x5b51f5['hits']['ts']>_0x4756a1['global']['resetWhenQuietMs']&&_0x5b51f5['hits']['count']&&_0x5b51f5[_0x4ce86f(0x206)]['time']/_0x5b51f5['hits'][_0x4ce86f(0x238)]<_0x4756a1['global'][_0x4ce86f(0x231)]&&(_0x5b51f5[_0x4ce86f(0x206)]={});let _0x41ced7=[],_0x1fbc3d=_0x3eb726['reduceLimits']||_0x5b51f5['hits']['reduceLimits']?_0x374151:_0x5aef3e,_0x2da3f7=_0x3d6b99=>{var _0x44db24=_0x4ce86f;let _0x4c46fe={};return _0x4c46fe[_0x44db24(0x1ef)]=_0x3d6b99[_0x44db24(0x1ef)],_0x4c46fe['elements']=_0x3d6b99[_0x44db24(0x1f7)],_0x4c46fe[_0x44db24(0x23c)]=_0x3d6b99[_0x44db24(0x23c)],_0x4c46fe['totalStrLength']=_0x3d6b99[_0x44db24(0x1de)],_0x4c46fe[_0x44db24(0x28a)]=_0x3d6b99[_0x44db24(0x28a)],_0x4c46fe[_0x44db24(0x21f)]=_0x3d6b99[_0x44db24(0x21f)],_0x4c46fe[_0x44db24(0x2c3)]=!0x1,_0x4c46fe[_0x44db24(0x1f5)]=!_0x3af781,_0x4c46fe[_0x44db24(0x2d4)]=0x1,_0x4c46fe['level']=0x0,_0x4c46fe[_0x44db24(0x1fb)]=_0x44db24(0x29b),_0x4c46fe[_0x44db24(0x296)]='root_exp',_0x4c46fe[_0x44db24(0x2bf)]=!0x0,_0x4c46fe[_0x44db24(0x1e2)]=[],_0x4c46fe[_0x44db24(0x28f)]=0x0,_0x4c46fe[_0x44db24(0x226)]=_0x39e136[_0x44db24(0x226)],_0x4c46fe[_0x44db24(0x2b7)]=0x0,_0x4c46fe[_0x44db24(0x286)]={'current':void 0x0,'parent':void 0x0,'index':0x0},_0x4c46fe;};for(var _0x42e392=0x0;_0x42e392<_0x4cd5b2[_0x4ce86f(0x1ee)];_0x42e392++)_0x41ced7[_0x4ce86f(0x2e0)](_0x4fccde[_0x4ce86f(0x2b2)]({'timeNode':_0x577f01==='time'||void 0x0},_0x4cd5b2[_0x42e392],_0x2da3f7(_0x1fbc3d),{}));if(_0x577f01===_0x4ce86f(0x29f)||_0x577f01===_0x4ce86f(0x29e)){let _0x4f7582=Error['stackTraceLimit'];try{Error[_0x4ce86f(0x221)]=0x1/0x0,_0x41ced7['push'](_0x4fccde[_0x4ce86f(0x2b2)]({'stackNode':!0x0},new Error()[_0x4ce86f(0x22e)],_0x2da3f7(_0x1fbc3d),{'strLength':0x1/0x0}));}finally{Error[_0x4ce86f(0x221)]=_0x4f7582;}}return{'method':_0x4ce86f(0x2d3),'version':_0x4cee6a,'args':[{'ts':_0x269690,'session':_0x32321b,'args':_0x41ced7,'id':_0x418059,'context':_0x52912d}]};}catch(_0x2a8c31){return{'method':_0x4ce86f(0x2d3),'version':_0x4cee6a,'args':[{'ts':_0x269690,'session':_0x32321b,'args':[{'type':_0x4ce86f(0x2a8),'error':_0x2a8c31&&_0x2a8c31['message']}],'id':_0x418059,'context':_0x52912d}]};}finally{try{if(_0x3eb726&&_0xb700fa){let _0x28b06b=_0x5553e9();_0x3eb726[_0x4ce86f(0x238)]++,_0x3eb726['time']+=_0x13f85b(_0xb700fa,_0x28b06b),_0x3eb726['ts']=_0x28b06b,_0x5b51f5[_0x4ce86f(0x206)]['count']++,_0x5b51f5[_0x4ce86f(0x206)][_0x4ce86f(0x255)]+=_0x13f85b(_0xb700fa,_0x28b06b),_0x5b51f5[_0x4ce86f(0x206)]['ts']=_0x28b06b,(_0x3eb726['count']>_0x4756a1['perLogpoint'][_0x4ce86f(0x1e8)]||_0x3eb726[_0x4ce86f(0x255)]>_0x4756a1[_0x4ce86f(0x291)][_0x4ce86f(0x281)])&&(_0x3eb726[_0x4ce86f(0x201)]=!0x0),(_0x5b51f5[_0x4ce86f(0x206)][_0x4ce86f(0x238)]>_0x4756a1[_0x4ce86f(0x2d7)][_0x4ce86f(0x1e8)]||_0x5b51f5[_0x4ce86f(0x206)][_0x4ce86f(0x255)]>_0x4756a1[_0x4ce86f(0x2d7)]['reduceOnAccumulatedProcessingTimeMs'])&&(_0x5b51f5[_0x4ce86f(0x206)]['reduceLimits']=!0x0);}}catch{}}}return _0x1a7762;}function G(_0x372717){var _0x766cc9=_0x3890c8;if(_0x372717&&typeof _0x372717=='object'&&_0x372717[_0x766cc9(0x277)])switch(_0x372717[_0x766cc9(0x277)]['name']){case _0x766cc9(0x256):return _0x372717[_0x766cc9(0x21a)](Symbol['iterator'])?Promise['resolve']():_0x372717;case _0x766cc9(0x1fe):return Promise[_0x766cc9(0x25e)]();}return _0x372717;}((_0xc5752,_0xa30047,_0x3f3995,_0x363a2d,_0x27a42d,_0x5b6f79,_0x45d099,_0x2bc6fb,_0x126cff,_0x1d3c75,_0x2e3f19,_0x464da7)=>{var _0xd5f224=_0x3890c8;if(_0xc5752[_0xd5f224(0x289)])return _0xc5752[_0xd5f224(0x289)];let _0x41b2d1={'consoleLog':()=>{},'consoleTrace':()=>{},'consoleTime':()=>{},'consoleTimeEnd':()=>{},'autoLog':()=>{},'autoLogMany':()=>{},'autoTraceMany':()=>{},'coverage':()=>{},'autoTrace':()=>{},'autoTime':()=>{},'autoTimeEnd':()=>{}};if(!X(_0xc5752,_0x2bc6fb,_0x27a42d))return _0xc5752[_0xd5f224(0x289)]=_0x41b2d1,_0xc5752['_console_ninja'];let _0x3886d2=b(_0xc5752),_0x2794c3=_0x3886d2[_0xd5f224(0x276)],_0x44129f=_0x3886d2[_0xd5f224(0x2be)],_0x277b60=_0x3886d2[_0xd5f224(0x2b0)],_0x5b8e52={'hits':{},'ts':{}},_0x1f8b30=J(_0xc5752,_0x126cff,_0x5b8e52,_0x5b6f79,_0x464da7,_0x27a42d===_0xd5f224(0x244)?G:void 0x0),_0x46c143=(_0x82e8dd,_0x59b610,_0x51fdcc,_0x5c78c9,_0x42589f,_0x28db7b)=>{var _0xf273d1=_0xd5f224;let _0x39c71d=_0xc5752[_0xf273d1(0x289)];try{return _0xc5752['_console_ninja']=_0x41b2d1,_0x1f8b30(_0x82e8dd,_0x59b610,_0x51fdcc,_0x5c78c9,_0x42589f,_0x28db7b);}finally{_0xc5752[_0xf273d1(0x289)]=_0x39c71d;}},_0x186fbf=_0x4900f9=>{_0x5b8e52['ts'][_0x4900f9]=_0x44129f();},_0x21fa3c=(_0x242207,_0x1074db)=>{var _0x67dc13=_0xd5f224;let _0x44431a=_0x5b8e52['ts'][_0x1074db];if(delete _0x5b8e52['ts'][_0x1074db],_0x44431a){let _0x41f6fe=_0x2794c3(_0x44431a,_0x44129f());_0x13354f(_0x46c143(_0x67dc13(0x255),_0x242207,_0x277b60(),_0x728f74,[_0x41f6fe],_0x1074db));}},_0x341135=_0x55d522=>{var _0x594af4=_0xd5f224,_0x22d04b;return _0x27a42d==='next.js'&&_0xc5752[_0x594af4(0x224)]&&((_0x22d04b=_0x55d522==null?void 0x0:_0x55d522[_0x594af4(0x2d9)])==null?void 0x0:_0x22d04b[_0x594af4(0x1ee)])&&(_0x55d522[_0x594af4(0x2d9)][0x0][_0x594af4(0x224)]=_0xc5752['origin']),_0x55d522;};_0xc5752['_console_ninja']={'consoleLog':(_0x18a087,_0x257091)=>{var _0x240148=_0xd5f224;_0xc5752[_0x240148(0x1e7)]['log'][_0x240148(0x273)]!==_0x240148(0x227)&&_0x13354f(_0x46c143(_0x240148(0x2d3),_0x18a087,_0x277b60(),_0x728f74,_0x257091));},'consoleTrace':(_0x16338a,_0x54e3f4)=>{var _0x1399d8=_0xd5f224,_0x26a166,_0x49fc60;_0xc5752[_0x1399d8(0x1e7)]['log'][_0x1399d8(0x273)]!==_0x1399d8(0x1e6)&&((_0x49fc60=(_0x26a166=_0xc5752[_0x1399d8(0x266)])==null?void 0x0:_0x26a166[_0x1399d8(0x2a9)])!=null&&_0x49fc60[_0x1399d8(0x286)]&&(_0xc5752[_0x1399d8(0x2a2)]=!0x0),_0x13354f(_0x341135(_0x46c143(_0x1399d8(0x29f),_0x16338a,_0x277b60(),_0x728f74,_0x54e3f4))));},'consoleError':(_0x19664d,_0x4a89b4)=>{var _0x53d07d=_0xd5f224;_0xc5752[_0x53d07d(0x2a2)]=!0x0,_0x13354f(_0x341135(_0x46c143(_0x53d07d(0x29e),_0x19664d,_0x277b60(),_0x728f74,_0x4a89b4)));},'consoleTime':_0x4b8fda=>{_0x186fbf(_0x4b8fda);},'consoleTimeEnd':(_0x53faf9,_0x3ec558)=>{_0x21fa3c(_0x3ec558,_0x53faf9);},'autoLog':(_0x5aeaac,_0x2074bc)=>{_0x13354f(_0x46c143('log',_0x2074bc,_0x277b60(),_0x728f74,[_0x5aeaac]));},'autoLogMany':(_0x3634a2,_0x3fd372)=>{var _0x24da29=_0xd5f224;_0x13354f(_0x46c143(_0x24da29(0x2d3),_0x3634a2,_0x277b60(),_0x728f74,_0x3fd372));},'autoTrace':(_0x5bfb94,_0xee276a)=>{var _0xc67014=_0xd5f224;_0x13354f(_0x341135(_0x46c143(_0xc67014(0x29f),_0xee276a,_0x277b60(),_0x728f74,[_0x5bfb94])));},'autoTraceMany':(_0x29b396,_0x5dc6f1)=>{var _0x6097b4=_0xd5f224;_0x13354f(_0x341135(_0x46c143(_0x6097b4(0x29f),_0x29b396,_0x277b60(),_0x728f74,_0x5dc6f1)));},'autoTime':(_0x1ec463,_0x159318,_0xf6b2dc)=>{_0x186fbf(_0xf6b2dc);},'autoTimeEnd':(_0x3f6263,_0x4ce919,_0x1e750a)=>{_0x21fa3c(_0x4ce919,_0x1e750a);},'coverage':_0x25e683=>{_0x13354f({'method':'coverage','version':_0x5b6f79,'args':[{'id':_0x25e683}]});}};let _0x13354f=H(_0xc5752,_0xa30047,_0x3f3995,_0x363a2d,_0x27a42d,_0x1d3c75,_0x2e3f19),_0x728f74=_0xc5752[_0xd5f224(0x29d)];return _0xc5752[_0xd5f224(0x289)];})(globalThis,'127.0.0.1',_0x3890c8(0x253),_0x3890c8(0x27a),'vite',_0x3890c8(0x2ac),_0x3890c8(0x2c0),_0x3890c8(0x2e1),_0x3890c8(0x259),_0x3890c8(0x2e4),'1',_0x3890c8(0x211));`);
  } catch (e) {
    console.error(e);
  }
}
function oo_tx(i, ...v) {
  try {
    oo_cm$1().consoleError(i, v);
  } catch (e) {
  }
  return v;
}
function registerSettingsIpc(service) {
  ipcMain.handle("settings:get-all", wrap(() => service.getAll()));
  ipcMain.handle("settings:get", wrap((_e, key) => service.get(key)));
  ipcMain.handle("settings:get-by-category", wrap((_e, category) => service.getByCategory(category)));
  ipcMain.handle("settings:set", wrap((_e, key, value) => {
    service.set(key, value);
    return true;
  }));
  ipcMain.handle("settings:upsert", wrap((_e, key, value) => {
    service.upsert(key, value);
    return true;
  }));
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
function registerProductsIpc(service) {
  ipcMain.handle("products:list", wrap(() => service.list()));
  ipcMain.handle("products:list-active", wrap(() => service.listActive()));
  ipcMain.handle("products:search", wrap((_e, query) => service.search(query)));
  ipcMain.handle("products:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain.handle("products:create", wrap((_e, input) => service.create(input)));
  ipcMain.handle("products:update", wrap((_e, id, patch) => service.update(id, patch)));
  ipcMain.handle("products:remove", wrap((_e, id) => service.remove(id)));
  ipcMain.handle("products:restore", wrap((_e, id) => service.restore(id)));
  ipcMain.handle("products:adjust-stock", wrap((_e, id, type, qty) => service.adjustStock(id, type, qty)));
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
      const safe = {};
      if (patch.nit !== void 0) safe.nit = normalizeNit(patch.nit);
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
function registerCustomersIpc(service) {
  ipcMain.handle("customers:list", wrap((_e, opts) => service.list(opts)));
  ipcMain.handle("customers:search", wrap((_e, query, opts) => service.search(query, opts)));
  ipcMain.handle("customers:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain.handle("customers:create", wrap((_e, input) => service.create(input)));
  ipcMain.handle("customers:update", wrap((_e, id, patch) => service.update(id, patch)));
  ipcMain.handle("customers:set-active", wrap((_e, id, active) => service.setActive(id, active)));
}
const SALE_COLUMNS = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot,
  payment_method, client_type, status
`;
function createSalesRepository(db) {
  const stmts = {
    insertSale: db.prepare(
      `INSERT INTO sales (
         total, subtotal, tax_rate_applied, tax_amount, currency_code,
         customer_id, customer_name_snapshot, customer_nit_snapshot,
         payment_method, client_type
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    selectPage: db.prepare(
      `SELECT ${SALE_COLUMNS}
         FROM sales
     ORDER BY id DESC
        LIMIT ? OFFSET ?`
    ),
    countAll: db.prepare("SELECT COUNT(*) AS total FROM sales"),
    dailySummary: db.prepare(`
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
    markVoided: db.prepare(
      `UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'active'`
    ),
    insertVoid: db.prepare(
      `INSERT INTO sale_voids (sale_id, reason, voided_by) VALUES (?, ?, ?)`
    ),
    restoreStock: db.prepare(
      `UPDATE products SET stock = stock + ? WHERE id = ?`
    ),
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
      record.clientType ?? "cf"
    );
    const saleId = info.lastInsertRowid;
    for (const item of record.items) {
      stmts.insertItem.run(saleId, item.id, item.qty, item.price);
      stmts.updateStock.run(item.qty, item.id);
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
        stmts.restoreStock.run(item.qty, item.product_id);
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
     * @param {PageOptions} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit, offset }) {
      return stmts.selectPage.all(limit, offset);
    },
    /** @returns {number} */
    countAll() {
      const row = (
        /** @type {{ total: number }} */
        stmts.countAll.get()
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
      const customerId = input.customerId ?? DEFAULT_CUSTOMER_ID;
      const customer = customers.requireById(customerId);
      const rawSum = input.items.reduce((acc, i) => acc + i.price * i.qty, 0);
      const { subtotal, taxAmount, total } = computeBreakdown(
        rawSum,
        taxRate,
        taxIncluded,
        decimals
      );
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
        clientType: input.clientType ?? "cf"
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
      return {
        data: repo.findPage({ limit: pageSize, offset }),
        total: repo.countAll(),
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
    }
  };
}
function registerSalesIpc(service) {
  ipcMain.handle("sales:create", wrap((_e, saleData) => service.create(saleData)));
  ipcMain.handle("sales:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain.handle("sales:list", wrap((_e, opts) => service.list(opts)));
  ipcMain.handle("sales:daily-report", wrap(() => service.dailyReport()));
  ipcMain.handle("sales:void", wrap((_e, input) => service.voidSale(input)));
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
function registerUsersIpc(service) {
  ipcMain.handle("users:login", wrap((_e, email, password) => service.login(email, password)));
  ipcMain.handle("users:list", wrap(() => service.list()));
  ipcMain.handle("users:get-by-id", wrap((_e, id) => service.getById(id)));
  ipcMain.handle("users:create", wrap((_e, input) => service.create(input)));
  ipcMain.handle("users:update", wrap((_e, id, patch) => service.update(id, patch)));
  ipcMain.handle("users:change-password", wrap((_e, id, newPassword) => service.changePassword(id, newPassword)));
  ipcMain.handle("users:set-active", wrap((_e, id, active) => service.setActive(id, active)));
  ipcMain.handle("users:update-avatar", wrap((_e, id, avatar) => service.updateAvatar(id, avatar)));
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
function registerAuditIpc(service) {
  ipcMain.handle("audit:list", wrap((_e, opts) => service.list(opts)));
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
          AND date >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR date < ?)`
      // closed_at o NULL si está abierta
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
     * Suma de ventas activas durante la sesión.
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
      return { session, movements, salesTotal };
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
      const salesTotal = repo.salesTotal(session.id, null);
      const movements = repo.movementsForSession(session.id);
      const movIn = movements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount, 0);
      const movOut = movements.filter((m) => m.type === "out").reduce((s, m) => s + m.amount, 0);
      const expected = session.opening_amount + salesTotal + movIn - movOut;
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
function registerCashIpc(service) {
  ipcMain.handle("cash:get-open", wrap(() => service.getOpenSession()));
  ipcMain.handle("cash:list", wrap(() => service.listSessions()));
  ipcMain.handle("cash:get-session", wrap((_e, id) => service.getSession(id)));
  ipcMain.handle("cash:open", wrap((_e, input) => service.openSession(input)));
  ipcMain.handle("cash:close", wrap((_e, input) => service.closeSession(input)));
  ipcMain.handle("cash:add-movement", wrap((_e, input) => service.addMovement(input)));
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
    )
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
     */
    receiveOrder: db.transaction((orderId, receivedItems) => {
      let total = 0;
      for (const item of receivedItems) {
        stmts.updateItemReceived.run(item);
        const row = stmts.findItemsByOrder.all(orderId).find((i) => i.id === item.id);
        if ((row == null ? void 0 : row.product_id) && item.qty_received > 0) {
          stmts.addStock.run({ id: row.product_id, qty: item.qty_received });
          if (row.unit_cost > 0) {
            stmts.updateProductCost.run({ id: row.product_id, cost: row.unit_cost });
          }
        }
        total += ((row == null ? void 0 : row.unit_cost) ?? 0) * item.qty_received;
      }
      const receivedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
      stmts.updateOrderStatus.run({ id: orderId, status: "received", received_at: receivedAt, total_cost: total });
    })
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
     * Recibe la orden: actualiza stock y costo de productos.
     * @param {{ orderId: number, role: string, items: { id: number, qty_received: number }[] }} input
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
      repo.receiveOrder(input.orderId, input.items);
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
function registerPurchasesIpc(service) {
  ipcMain.handle("suppliers:list", wrap(() => service.listSuppliers()));
  ipcMain.handle("suppliers:get", wrap((_e, id) => service.getSupplier(id)));
  ipcMain.handle("suppliers:create", wrap((_e, input, role) => service.createSupplier(input, role)));
  ipcMain.handle("suppliers:update", wrap((_e, id, input, role) => service.updateSupplier(id, input, role)));
  ipcMain.handle("suppliers:set-active", wrap((_e, id, active, role) => service.setSupplierActive(id, active, role)));
  ipcMain.handle("purchases:list", wrap(() => service.listOrders()));
  ipcMain.handle("purchases:get", wrap((_e, id) => service.getOrder(id)));
  ipcMain.handle("purchases:create", wrap((_e, input) => service.createOrder(input)));
  ipcMain.handle("purchases:mark-sent", wrap((_e, id, role) => service.markSent(id, role)));
  ipcMain.handle("purchases:receive", wrap((_e, input) => service.receiveOrder(input)));
  ipcMain.handle("purchases:cancel", wrap((_e, id, role) => service.cancelOrder(id, role)));
}
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
  "../database/migrations/013_purchases.sql": __vite_glob_0_12
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
  console.log(...oo_oo(`996254639_64_2_64_80_4`, "[migrator] applied:", result.applied, "skipped:", result.skipped));
  const settingsRepo = createSettingsRepository(db);
  const settings = createSettingsService(settingsRepo);
  settings.init();
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
  registerSettingsIpc(settings);
  registerProductsIpc(products);
  registerCustomersIpc(customers);
  registerSalesIpc(sales);
  registerUsersIpc(users);
  registerAuditIpc(audit);
  registerCashIpc(cash);
  registerPurchasesIpc(purchases);
}
function oo_cm() {
  try {
    return (0, eval)("globalThis._console_ninja") || (0, eval)(`/* https://github.com/wallabyjs/console-ninja#how-does-it-work */'use strict';function _0x4187(_0x52e140,_0x15844d){var _0x1edd14=_0x1edd();return _0x4187=function(_0x418736,_0x252226){_0x418736=_0x418736-0x1dc;var _0x1c174c=_0x1edd14[_0x418736];return _0x1c174c;},_0x4187(_0x52e140,_0x15844d);}var _0x3890c8=_0x4187;function _0x1edd(){var _0xd02a82=['background:\\x20rgb(30,30,30);\\x20color:\\x20rgb(255,213,92)','_connectToHostNow','NEGATIVE_INFINITY',{"resolveGetters":false,"defaultLimits":{"props":100,"elements":100,"strLength":51200,"totalStrLength":51200,"autoExpandLimit":5000,"autoExpandMaxDepth":10},"reducedLimits":{"props":5,"elements":5,"strLength":256,"totalStrLength":768,"autoExpandLimit":30,"autoExpandMaxDepth":2},"reducePolicy":{"perLogpoint":{"reduceOnCount":50,"reduceOnAccumulatedProcessingTimeMs":100,"resetWhenQuietMs":500,"resetOnProcessingTimeAverageMs":100},"global":{"reduceOnCount":1000,"reduceOnAccumulatedProcessingTimeMs":300,"resetWhenQuietMs":50,"resetOnProcessingTimeAverageMs":100}}},'_getOwnPropertyDescriptor','warn','_p_length','_regExpToString','38gkPcrc',',\\x20see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.','funcName','_isSet','hasOwnProperty','unshift','[object\\x20Array]','_maxConnectAttemptCount','ws://','autoExpandMaxDepth','default','stackTraceLimit','\\x20server','_addProperty','origin','reducedLimits','resolveGetters','disabledLog','cappedElements','indexOf','reload','Set','Symbol','_isArray','stack','port','function','resetOnProcessingTimeAverageMs','slice','onerror','_connectAttemptCount','emulator','reducePolicy','_processTreeNodeResult','count','_setNodeExpressionPath','HTMLAllCollection','String','strLength','_WebSocketClass','_addLoadNode','expo','ninjaSuppressConsole','_isUndefined','_connected','_keyStrRegExp','next.js','Number','9jOUldT','_isNegativeZero','_p_name','_ws','substr','import(\\x27url\\x27)','_consoleNinjaAllowedToStart','date','parse','_treeNodePropertiesBeforeFullValue','_setNodeLabel','_blacklistedProperty','Buffer','56195','20667vPUjDv','time','Promise','set','2035290pGkmlm','','logger\\x20failed\\x20to\\x20connect\\x20to\\x20host,\\x20see\\x20','angular','negativeInfinity','test','resolve','WebSocket','array','parent','bind','host','resetWhenQuietMs','failed\\x20to\\x20connect\\x20to\\x20host:\\x20','process','bigint','136cjwhMD','toString','object','readyState','_inBrowser','send','_attemptToReconnectShortly','_HTMLAllCollection','hostname','_allowedToSend','edge','name','stringify','_setNodeId','elapsed','constructor','182420mjmqKf','_numberRegExp',"c:\\\\Users\\\\henry\\\\.vscode\\\\extensions\\\\wallabyjs.console-ninja-1.0.525\\\\node_modules",'type','prototype','astro','pop','expressionsToEvaluate','osName','reduceOnAccumulatedProcessingTimeMs','env','Map','_sendErrorMessage','RegExp','node','[object\\x20Date]','_sortProps','_console_ninja','autoExpandLimit','path','8098092eUysyP','_disposeWebsocket','_isPrimitiveWrapperType','autoExpandPropertyCount','return\\x20import(url.pathToFileURL(path.join(nodeModules,\\x20\\x27ws/index.js\\x27)).toString());','perLogpoint','map','_extendedWarning','android','join','rootExpression','_type','_capIfString','nan','_socket','root_exp_id','concat','_console_ninja_session','error','trace','_objectToString','isArray','_ninjaIgnoreNextError','onmessage','fromCharCode','\\x20browser','getWebSocketClass','catch','unknown','versions','_dateToString','_cleanNode','1.0.0','react-native','Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20refreshing\\x20the\\x20page\\x20may\\x20help;\\x20also\\x20see\\x20','isExpressionToEvaluate','now','then','serialize','toLowerCase','index','hrtime','close','allStrLength','valueOf','ExpoDevice','_p_','_inNextEdge','[object\\x20BigInt]','Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','timeStamp','autoExpand','1777217946939','_getOwnPropertySymbols','7574025BLeRlk','sortProps','replace','NEXT_RUNTIME','_connecting','_additionalMetadata','forEach','level','symbol','modules','_Symbol','undefined','[object\\x20Set]','eventReceivedCallback','remix','_setNodeQueryPath','[object\\x20Map]','log','depth','Boolean','dockerizedApp','global','null','args','gateway.docker.internal','_addFunctionsNode','perf_hooks','5058944NenKCb','_hasMapOnItsPath','_setNodeExpandableState','push',["localhost","127.0.0.1","example.cypress.io","10.0.2.2","DESKTOP-HU7L43R","169.254.128.21","192.168.43.1","192.168.61.1","192.168.1.78"],'unref','_webSocketErrorDocsLink','','_treeNodePropertiesAfterFullValue','%c\\x20Console\\x20Ninja\\x20extension\\x20is\\x20connected\\x20to\\x20','Error','number','value','_isMap','defaultLimits','_addObjectProperty','totalStrLength','some','boolean','_WebSocket','autoExpandPreviousObjects','sort','_setNodePermissions','_allowedToConnectOnSend','disabledTrace','console','reduceOnCount','location','10.0.2.2','get','call','_propertyName','length','props','_hasSymbolPropertyOnItsPath','_reconnectTimeout','string','getOwnPropertyDescriptor','import(\\x27path\\x27)','noFunctions','nodeModules','elements','endsWith','POSITIVE_INFINITY','21223450LJhzYJ','expId','_isPrimitiveType','onopen','bound\\x20Promise','message','current','reduceLimits','_getOwnPropertyNames','data','url','_quotedRegExp','hits','match','_property','getOwnPropertySymbols','performance','toUpperCase','capped','includes'];_0x1edd=function(){return _0xd02a82;};return _0x1edd();}(function(_0x593217,_0xb66b98){var _0x477746=_0x4187,_0x4015ef=_0x593217();while(!![]){try{var _0x55fb6d=parseInt(_0x477746(0x254))/0x1*(-parseInt(_0x477746(0x216))/0x2)+parseInt(_0x477746(0x258))/0x3+-parseInt(_0x477746(0x2dd))/0x4+parseInt(_0x477746(0x2c2))/0x5+-parseInt(_0x477746(0x28c))/0x6+-parseInt(_0x477746(0x278))/0x7*(parseInt(_0x477746(0x268))/0x8)+parseInt(_0x477746(0x246))/0x9*(parseInt(_0x477746(0x1fa))/0xa);if(_0x55fb6d===_0xb66b98)break;else _0x4015ef['push'](_0x4015ef['shift']());}catch(_0x3d51fa){_0x4015ef['push'](_0x4015ef['shift']());}}}(_0x1edd,0xd34bd));function z(_0x592fc3,_0x315c78,_0x20b8bb,_0x322b6b,_0x3f5c59,_0x2ff362){var _0x1e9d9b=_0x4187,_0x1f3283,_0x1d630f,_0x518481,_0x138db6;this[_0x1e9d9b(0x2d7)]=_0x592fc3,this[_0x1e9d9b(0x263)]=_0x315c78,this[_0x1e9d9b(0x22f)]=_0x20b8bb,this['nodeModules']=_0x322b6b,this['dockerizedApp']=_0x3f5c59,this['eventReceivedCallback']=_0x2ff362,this[_0x1e9d9b(0x271)]=!0x0,this[_0x1e9d9b(0x1e5)]=!0x0,this[_0x1e9d9b(0x242)]=!0x1,this[_0x1e9d9b(0x2c6)]=!0x1,this[_0x1e9d9b(0x2bb)]=((_0x1d630f=(_0x1f3283=_0x592fc3['process'])==null?void 0x0:_0x1f3283[_0x1e9d9b(0x282)])==null?void 0x0:_0x1d630f['NEXT_RUNTIME'])===_0x1e9d9b(0x272),this[_0x1e9d9b(0x26c)]=!((_0x138db6=(_0x518481=this[_0x1e9d9b(0x2d7)][_0x1e9d9b(0x266)])==null?void 0x0:_0x518481[_0x1e9d9b(0x2a9)])!=null&&_0x138db6[_0x1e9d9b(0x286)])&&!this[_0x1e9d9b(0x2bb)],this[_0x1e9d9b(0x23d)]=null,this['_connectAttemptCount']=0x0,this[_0x1e9d9b(0x21d)]=0x14,this[_0x1e9d9b(0x2e3)]='https://tinyurl.com/37x8b79t',this[_0x1e9d9b(0x284)]=(this['_inBrowser']?_0x1e9d9b(0x2ae):'Console\\x20Ninja\\x20failed\\x20to\\x20send\\x20logs,\\x20restarting\\x20the\\x20process\\x20may\\x20help;\\x20also\\x20see\\x20')+this[_0x1e9d9b(0x2e3)];}z[_0x3890c8(0x27c)][_0x3890c8(0x2a6)]=async function(){var _0x47df01=_0x3890c8,_0x4c9b9c,_0x348789;if(this['_WebSocketClass'])return this[_0x47df01(0x23d)];let _0x5b4a33;if(this[_0x47df01(0x26c)]||this[_0x47df01(0x2bb)])_0x5b4a33=this[_0x47df01(0x2d7)][_0x47df01(0x25f)];else{if((_0x4c9b9c=this['global'][_0x47df01(0x266)])!=null&&_0x4c9b9c['_WebSocket'])_0x5b4a33=(_0x348789=this[_0x47df01(0x2d7)]['process'])==null?void 0x0:_0x348789[_0x47df01(0x1e1)];else try{_0x5b4a33=(await new Function('path',_0x47df01(0x204),_0x47df01(0x1f6),_0x47df01(0x290))(await(0x0,eval)(_0x47df01(0x1f4)),await(0x0,eval)(_0x47df01(0x24b)),this[_0x47df01(0x1f6)]))[_0x47df01(0x220)];}catch{try{_0x5b4a33=require(require(_0x47df01(0x28b))[_0x47df01(0x295)](this[_0x47df01(0x1f6)],'ws'));}catch{throw new Error('failed\\x20to\\x20find\\x20and\\x20load\\x20WebSocket');}}}return this[_0x47df01(0x23d)]=_0x5b4a33,_0x5b4a33;},z[_0x3890c8(0x27c)][_0x3890c8(0x20f)]=function(){var _0x1d32f3=_0x3890c8;this[_0x1d32f3(0x2c6)]||this[_0x1d32f3(0x242)]||this[_0x1d32f3(0x234)]>=this[_0x1d32f3(0x21d)]||(this[_0x1d32f3(0x1e5)]=!0x1,this[_0x1d32f3(0x2c6)]=!0x0,this[_0x1d32f3(0x234)]++,this[_0x1d32f3(0x249)]=new Promise((_0x1dfeca,_0x1ed537)=>{var _0x162cdd=_0x1d32f3;this[_0x162cdd(0x2a6)]()[_0x162cdd(0x2b1)](_0x47460b=>{var _0x1fc8dc=_0x162cdd;let _0xe561b2=new _0x47460b(_0x1fc8dc(0x21e)+(!this[_0x1fc8dc(0x26c)]&&this[_0x1fc8dc(0x2d6)]?_0x1fc8dc(0x2da):this[_0x1fc8dc(0x263)])+':'+this['port']);_0xe561b2[_0x1fc8dc(0x233)]=()=>{var _0x53cfe7=_0x1fc8dc;this[_0x53cfe7(0x271)]=!0x1,this[_0x53cfe7(0x28d)](_0xe561b2),this['_attemptToReconnectShortly'](),_0x1ed537(new Error('logger\\x20websocket\\x20error'));},_0xe561b2[_0x1fc8dc(0x1fd)]=()=>{var _0x1456f8=_0x1fc8dc;this[_0x1456f8(0x26c)]||_0xe561b2[_0x1456f8(0x29a)]&&_0xe561b2['_socket']['unref']&&_0xe561b2['_socket'][_0x1456f8(0x2e2)](),_0x1dfeca(_0xe561b2);},_0xe561b2['onclose']=()=>{var _0x1475d1=_0x1fc8dc;this[_0x1475d1(0x1e5)]=!0x0,this[_0x1475d1(0x28d)](_0xe561b2),this['_attemptToReconnectShortly']();},_0xe561b2[_0x1fc8dc(0x2a3)]=_0x175d79=>{var _0x2e3b9f=_0x1fc8dc;try{if(!(_0x175d79!=null&&_0x175d79[_0x2e3b9f(0x203)])||!this[_0x2e3b9f(0x2cf)])return;let _0x44f4d4=JSON[_0x2e3b9f(0x24e)](_0x175d79['data']);this[_0x2e3b9f(0x2cf)](_0x44f4d4['method'],_0x44f4d4[_0x2e3b9f(0x2d9)],this[_0x2e3b9f(0x2d7)],this[_0x2e3b9f(0x26c)]);}catch{}};})[_0x162cdd(0x2b1)](_0x2e6e48=>(this[_0x162cdd(0x242)]=!0x0,this[_0x162cdd(0x2c6)]=!0x1,this['_allowedToConnectOnSend']=!0x1,this[_0x162cdd(0x271)]=!0x0,this[_0x162cdd(0x234)]=0x0,_0x2e6e48))[_0x162cdd(0x2a7)](_0x890b60=>(this['_connected']=!0x1,this['_connecting']=!0x1,console[_0x162cdd(0x213)](_0x162cdd(0x25a)+this[_0x162cdd(0x2e3)]),_0x1ed537(new Error(_0x162cdd(0x265)+(_0x890b60&&_0x890b60[_0x162cdd(0x1ff)])))));}));},z[_0x3890c8(0x27c)]['_disposeWebsocket']=function(_0x1b2f6c){var _0x5b014b=_0x3890c8;this['_connected']=!0x1,this[_0x5b014b(0x2c6)]=!0x1;try{_0x1b2f6c['onclose']=null,_0x1b2f6c[_0x5b014b(0x233)]=null,_0x1b2f6c['onopen']=null;}catch{}try{_0x1b2f6c[_0x5b014b(0x26b)]<0x2&&_0x1b2f6c[_0x5b014b(0x2b6)]();}catch{}},z[_0x3890c8(0x27c)]['_attemptToReconnectShortly']=function(){var _0x124bb9=_0x3890c8;clearTimeout(this[_0x124bb9(0x1f1)]),!(this[_0x124bb9(0x234)]>=this[_0x124bb9(0x21d)])&&(this[_0x124bb9(0x1f1)]=setTimeout(()=>{var _0x4d4e90=_0x124bb9,_0xf6aafa;this[_0x4d4e90(0x242)]||this['_connecting']||(this[_0x4d4e90(0x20f)](),(_0xf6aafa=this[_0x4d4e90(0x249)])==null||_0xf6aafa['catch'](()=>this[_0x4d4e90(0x26e)]()));},0x1f4),this[_0x124bb9(0x1f1)][_0x124bb9(0x2e2)]&&this[_0x124bb9(0x1f1)][_0x124bb9(0x2e2)]());},z[_0x3890c8(0x27c)][_0x3890c8(0x26d)]=async function(_0x1bb714){var _0x9a6194=_0x3890c8;try{if(!this[_0x9a6194(0x271)])return;this[_0x9a6194(0x1e5)]&&this[_0x9a6194(0x20f)](),(await this[_0x9a6194(0x249)])[_0x9a6194(0x26d)](JSON[_0x9a6194(0x274)](_0x1bb714));}catch(_0x1b6312){this[_0x9a6194(0x293)]?console[_0x9a6194(0x213)](this[_0x9a6194(0x284)]+':\\x20'+(_0x1b6312&&_0x1b6312[_0x9a6194(0x1ff)])):(this['_extendedWarning']=!0x0,console[_0x9a6194(0x213)](this[_0x9a6194(0x284)]+':\\x20'+(_0x1b6312&&_0x1b6312[_0x9a6194(0x1ff)]),_0x1bb714)),this[_0x9a6194(0x271)]=!0x1,this[_0x9a6194(0x26e)]();}};function H(_0x20ad1f,_0x2292c5,_0x44fc0e,_0x23d982,_0x5cf68c,_0x2bf037,_0x2ca164,_0x17c366=ne){var _0x1889e1=_0x3890c8;let _0x540a51=_0x44fc0e['split'](',')[_0x1889e1(0x292)](_0x2d32cd=>{var _0xd94d2e=_0x1889e1,_0x5aa30d,_0x16905d,_0x42434e,_0x1ab968,_0x405adf,_0x2a8f7e,_0x117873,_0x5423c9;try{if(!_0x20ad1f[_0xd94d2e(0x29d)]){let _0x41ebfe=((_0x16905d=(_0x5aa30d=_0x20ad1f['process'])==null?void 0x0:_0x5aa30d[_0xd94d2e(0x2a9)])==null?void 0x0:_0x16905d[_0xd94d2e(0x286)])||((_0x1ab968=(_0x42434e=_0x20ad1f['process'])==null?void 0x0:_0x42434e[_0xd94d2e(0x282)])==null?void 0x0:_0x1ab968[_0xd94d2e(0x2c5)])==='edge';(_0x5cf68c===_0xd94d2e(0x244)||_0x5cf68c===_0xd94d2e(0x2d0)||_0x5cf68c===_0xd94d2e(0x27d)||_0x5cf68c===_0xd94d2e(0x25b))&&(_0x5cf68c+=_0x41ebfe?_0xd94d2e(0x222):_0xd94d2e(0x2a5));let _0x3b5c0e='';_0x5cf68c==='react-native'&&(_0x3b5c0e=(((_0x117873=(_0x2a8f7e=(_0x405adf=_0x20ad1f[_0xd94d2e(0x23f)])==null?void 0x0:_0x405adf['modules'])==null?void 0x0:_0x2a8f7e[_0xd94d2e(0x2b9)])==null?void 0x0:_0x117873[_0xd94d2e(0x280)])||_0xd94d2e(0x235))[_0xd94d2e(0x2b3)](),_0x3b5c0e&&(_0x5cf68c+='\\x20'+_0x3b5c0e,(_0x3b5c0e===_0xd94d2e(0x294)||_0x3b5c0e===_0xd94d2e(0x235)&&((_0x5423c9=_0x20ad1f[_0xd94d2e(0x1e9)])==null?void 0x0:_0x5423c9['hostname'])===_0xd94d2e(0x1ea))&&(_0x2292c5=_0xd94d2e(0x1ea)))),_0x20ad1f[_0xd94d2e(0x29d)]={'id':+new Date(),'tool':_0x5cf68c},_0x2ca164&&_0x5cf68c&&!_0x41ebfe&&(_0x3b5c0e?console['log'](_0xd94d2e(0x2bd)+_0x3b5c0e+_0xd94d2e(0x217)):console[_0xd94d2e(0x2d3)](_0xd94d2e(0x2e6)+(_0x5cf68c['charAt'](0x0)[_0xd94d2e(0x20b)]()+_0x5cf68c[_0xd94d2e(0x24a)](0x1))+',',_0xd94d2e(0x20e),'see\\x20https://tinyurl.com/2vt8jxzw\\x20for\\x20more\\x20info.'));}let _0x326972=new z(_0x20ad1f,_0x2292c5,_0x2d32cd,_0x23d982,_0x2bf037,_0x17c366);return _0x326972[_0xd94d2e(0x26d)]['bind'](_0x326972);}catch(_0x266308){return console[_0xd94d2e(0x213)]('logger\\x20failed\\x20to\\x20connect\\x20to\\x20host',_0x266308&&_0x266308[_0xd94d2e(0x1ff)]),()=>{};}});return _0x3b9c7f=>_0x540a51['forEach'](_0x742346=>_0x742346(_0x3b9c7f));}function ne(_0x31e108,_0x3ec168,_0x417cab,_0xfd62c4){var _0x4be061=_0x3890c8;_0xfd62c4&&_0x31e108===_0x4be061(0x22a)&&_0x417cab[_0x4be061(0x1e9)][_0x4be061(0x22a)]();}function b(_0x30160c){var _0x151986=_0x3890c8,_0x2c787f,_0x2a95b9;let _0x2b4527=function(_0x1f6955,_0x424bf1){return _0x424bf1-_0x1f6955;},_0x19085c;if(_0x30160c[_0x151986(0x20a)])_0x19085c=function(){var _0x56aa7e=_0x151986;return _0x30160c[_0x56aa7e(0x20a)][_0x56aa7e(0x2b0)]();};else{if(_0x30160c[_0x151986(0x266)]&&_0x30160c[_0x151986(0x266)][_0x151986(0x2b5)]&&((_0x2a95b9=(_0x2c787f=_0x30160c[_0x151986(0x266)])==null?void 0x0:_0x2c787f[_0x151986(0x282)])==null?void 0x0:_0x2a95b9['NEXT_RUNTIME'])!==_0x151986(0x272))_0x19085c=function(){var _0x2687a2=_0x151986;return _0x30160c[_0x2687a2(0x266)][_0x2687a2(0x2b5)]();},_0x2b4527=function(_0x841d75,_0x2991da){return 0x3e8*(_0x2991da[0x0]-_0x841d75[0x0])+(_0x2991da[0x1]-_0x841d75[0x1])/0xf4240;};else try{let {performance:_0xd3a2df}=require(_0x151986(0x2dc));_0x19085c=function(){var _0x52330d=_0x151986;return _0xd3a2df[_0x52330d(0x2b0)]();};}catch{_0x19085c=function(){return+new Date();};}}return{'elapsed':_0x2b4527,'timeStamp':_0x19085c,'now':()=>Date[_0x151986(0x2b0)]()};}function X(_0x31ddec,_0x301594,_0x57b351){var _0xd50045=_0x3890c8,_0x21878c,_0x18f50c,_0x1295d0,_0x2b81d1,_0x429f3b,_0x1a0b9b,_0x4dbdad;if(_0x31ddec[_0xd50045(0x24c)]!==void 0x0)return _0x31ddec[_0xd50045(0x24c)];let _0x36bf8=((_0x18f50c=(_0x21878c=_0x31ddec['process'])==null?void 0x0:_0x21878c[_0xd50045(0x2a9)])==null?void 0x0:_0x18f50c[_0xd50045(0x286)])||((_0x2b81d1=(_0x1295d0=_0x31ddec[_0xd50045(0x266)])==null?void 0x0:_0x1295d0[_0xd50045(0x282)])==null?void 0x0:_0x2b81d1['NEXT_RUNTIME'])===_0xd50045(0x272),_0xd67b84=!!(_0x57b351===_0xd50045(0x2ad)&&((_0x429f3b=_0x31ddec[_0xd50045(0x23f)])==null?void 0x0:_0x429f3b[_0xd50045(0x2cb)]));function _0x224a39(_0x3f855b){var _0x554bf3=_0xd50045;if(_0x3f855b['startsWith']('/')&&_0x3f855b[_0x554bf3(0x1f8)]('/')){let _0x1a86b1=new RegExp(_0x3f855b['slice'](0x1,-0x1));return _0xda75d7=>_0x1a86b1[_0x554bf3(0x25d)](_0xda75d7);}else{if(_0x3f855b[_0x554bf3(0x20d)]('*')||_0x3f855b[_0x554bf3(0x20d)]('?')){let _0x1cb7b0=new RegExp('^'+_0x3f855b['replace'](/\\./g,String[_0x554bf3(0x2a4)](0x5c)+'.')['replace'](/\\*/g,'.*')['replace'](/\\?/g,'.')+String[_0x554bf3(0x2a4)](0x24));return _0x3d762c=>_0x1cb7b0['test'](_0x3d762c);}else return _0x362679=>_0x362679===_0x3f855b;}}let _0x8cb568=_0x301594[_0xd50045(0x292)](_0x224a39);return _0x31ddec[_0xd50045(0x24c)]=_0x36bf8||!_0x301594,!_0x31ddec[_0xd50045(0x24c)]&&((_0x1a0b9b=_0x31ddec[_0xd50045(0x1e9)])==null?void 0x0:_0x1a0b9b[_0xd50045(0x270)])&&(_0x31ddec[_0xd50045(0x24c)]=_0x8cb568[_0xd50045(0x1df)](_0x16149e=>_0x16149e(_0x31ddec[_0xd50045(0x1e9)][_0xd50045(0x270)]))),_0xd67b84&&!_0x31ddec[_0xd50045(0x24c)]&&!((_0x4dbdad=_0x31ddec[_0xd50045(0x1e9)])!=null&&_0x4dbdad[_0xd50045(0x270)])&&(_0x31ddec[_0xd50045(0x24c)]=!0x0),_0x31ddec[_0xd50045(0x24c)];}function J(_0x1b046d,_0x3af781,_0x5b51f5,_0x4cee6a,_0x39e136,_0x5d8b23){var _0x1f5d44=_0x3890c8;_0x1b046d=_0x1b046d,_0x3af781=_0x3af781,_0x5b51f5=_0x5b51f5,_0x4cee6a=_0x4cee6a,_0x39e136=_0x39e136,_0x39e136=_0x39e136||{},_0x39e136['defaultLimits']=_0x39e136['defaultLimits']||{},_0x39e136[_0x1f5d44(0x225)]=_0x39e136[_0x1f5d44(0x225)]||{},_0x39e136[_0x1f5d44(0x236)]=_0x39e136[_0x1f5d44(0x236)]||{},_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x291)]=_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x291)]||{},_0x39e136[_0x1f5d44(0x236)]['global']=_0x39e136[_0x1f5d44(0x236)]['global']||{};let _0x4756a1={'perLogpoint':{'reduceOnCount':_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x291)][_0x1f5d44(0x1e8)]||0x32,'reduceOnAccumulatedProcessingTimeMs':_0x39e136['reducePolicy'][_0x1f5d44(0x291)][_0x1f5d44(0x281)]||0x64,'resetWhenQuietMs':_0x39e136[_0x1f5d44(0x236)]['perLogpoint']['resetWhenQuietMs']||0x1f4,'resetOnProcessingTimeAverageMs':_0x39e136[_0x1f5d44(0x236)]['perLogpoint']['resetOnProcessingTimeAverageMs']||0x64},'global':{'reduceOnCount':_0x39e136['reducePolicy'][_0x1f5d44(0x2d7)][_0x1f5d44(0x1e8)]||0x3e8,'reduceOnAccumulatedProcessingTimeMs':_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x2d7)]['reduceOnAccumulatedProcessingTimeMs']||0x12c,'resetWhenQuietMs':_0x39e136[_0x1f5d44(0x236)]['global'][_0x1f5d44(0x264)]||0x32,'resetOnProcessingTimeAverageMs':_0x39e136[_0x1f5d44(0x236)][_0x1f5d44(0x2d7)][_0x1f5d44(0x231)]||0x64}},_0x41af91=b(_0x1b046d),_0x13f85b=_0x41af91[_0x1f5d44(0x276)],_0x5553e9=_0x41af91[_0x1f5d44(0x2be)];function _0x39602c(){var _0x293841=_0x1f5d44;this[_0x293841(0x243)]=/^(?!(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$)[_$a-zA-Z\\xA0-\\uFFFF][_$a-zA-Z0-9\\xA0-\\uFFFF]*$/,this[_0x293841(0x279)]=/^(0|[1-9][0-9]*)$/,this[_0x293841(0x205)]=/'([^\\\\']|\\\\')*'/,this['_undefined']=_0x1b046d[_0x293841(0x2cd)],this[_0x293841(0x26f)]=_0x1b046d[_0x293841(0x23a)],this['_getOwnPropertyDescriptor']=Object[_0x293841(0x1f3)],this[_0x293841(0x202)]=Object['getOwnPropertyNames'],this['_Symbol']=_0x1b046d[_0x293841(0x22c)],this[_0x293841(0x215)]=RegExp[_0x293841(0x27c)][_0x293841(0x269)],this['_dateToString']=Date[_0x293841(0x27c)][_0x293841(0x269)];}_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2b2)]=function(_0x254f7f,_0x1babfb,_0x2e90c6,_0xdb54a9){var _0x33bfa3=_0x1f5d44,_0x168568=this,_0x471824=_0x2e90c6[_0x33bfa3(0x2bf)];function _0x3a3c67(_0x142852,_0x2cc0b4,_0x381677){var _0x16d30c=_0x33bfa3;_0x2cc0b4[_0x16d30c(0x27b)]=_0x16d30c(0x2a8),_0x2cc0b4[_0x16d30c(0x29e)]=_0x142852[_0x16d30c(0x1ff)],_0x3b2ef2=_0x381677[_0x16d30c(0x286)]['current'],_0x381677[_0x16d30c(0x286)][_0x16d30c(0x200)]=_0x2cc0b4,_0x168568[_0x16d30c(0x24f)](_0x2cc0b4,_0x381677);}let _0x361300,_0x7450c3,_0x1f473b=_0x1b046d[_0x33bfa3(0x240)];_0x1b046d[_0x33bfa3(0x240)]=!0x0,_0x1b046d[_0x33bfa3(0x1e7)]&&(_0x361300=_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x29e)],_0x7450c3=_0x1b046d['console'][_0x33bfa3(0x213)],_0x361300&&(_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x29e)]=function(){}),_0x7450c3&&(_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x213)]=function(){}));try{try{_0x2e90c6[_0x33bfa3(0x2c9)]++,_0x2e90c6[_0x33bfa3(0x2bf)]&&_0x2e90c6[_0x33bfa3(0x1e2)]['push'](_0x1babfb);var _0x2e727d,_0x4ce0a7,_0x5c981d,_0x3de9f4,_0x2ee350=[],_0x1fd1ab=[],_0x5481d5,_0x4e2612=this[_0x33bfa3(0x297)](_0x1babfb),_0x443a68=_0x4e2612==='array',_0xf19808=!0x1,_0x10ecde=_0x4e2612===_0x33bfa3(0x230),_0x4ec234=this[_0x33bfa3(0x1fc)](_0x4e2612),_0x13a3ac=this[_0x33bfa3(0x28e)](_0x4e2612),_0x21daba=_0x4ec234||_0x13a3ac,_0x5d7eb8={},_0x4a200a=0x0,_0x2e69b1=!0x1,_0x3b2ef2,_0x1ec59c=/^(([1-9]{1}[0-9]*)|0)$/;if(_0x2e90c6['depth']){if(_0x443a68){if(_0x4ce0a7=_0x1babfb[_0x33bfa3(0x1ee)],_0x4ce0a7>_0x2e90c6['elements']){for(_0x5c981d=0x0,_0x3de9f4=_0x2e90c6[_0x33bfa3(0x1f7)],_0x2e727d=_0x5c981d;_0x2e727d<_0x3de9f4;_0x2e727d++)_0x1fd1ab['push'](_0x168568[_0x33bfa3(0x223)](_0x2ee350,_0x1babfb,_0x4e2612,_0x2e727d,_0x2e90c6));_0x254f7f[_0x33bfa3(0x228)]=!0x0;}else{for(_0x5c981d=0x0,_0x3de9f4=_0x4ce0a7,_0x2e727d=_0x5c981d;_0x2e727d<_0x3de9f4;_0x2e727d++)_0x1fd1ab['push'](_0x168568[_0x33bfa3(0x223)](_0x2ee350,_0x1babfb,_0x4e2612,_0x2e727d,_0x2e90c6));}_0x2e90c6['autoExpandPropertyCount']+=_0x1fd1ab[_0x33bfa3(0x1ee)];}if(!(_0x4e2612===_0x33bfa3(0x2d8)||_0x4e2612===_0x33bfa3(0x2cd))&&!_0x4ec234&&_0x4e2612!=='String'&&_0x4e2612!==_0x33bfa3(0x252)&&_0x4e2612!==_0x33bfa3(0x267)){var _0x2d45fa=_0xdb54a9[_0x33bfa3(0x1ef)]||_0x2e90c6[_0x33bfa3(0x1ef)];if(this['_isSet'](_0x1babfb)?(_0x2e727d=0x0,_0x1babfb[_0x33bfa3(0x2c8)](function(_0x3b3e4c){var _0x118b02=_0x33bfa3;if(_0x4a200a++,_0x2e90c6['autoExpandPropertyCount']++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;return;}if(!_0x2e90c6[_0x118b02(0x2af)]&&_0x2e90c6['autoExpand']&&_0x2e90c6[_0x118b02(0x28f)]>_0x2e90c6[_0x118b02(0x28a)]){_0x2e69b1=!0x0;return;}_0x1fd1ab[_0x118b02(0x2e0)](_0x168568[_0x118b02(0x223)](_0x2ee350,_0x1babfb,'Set',_0x2e727d++,_0x2e90c6,function(_0xba6f7b){return function(){return _0xba6f7b;};}(_0x3b3e4c)));})):this[_0x33bfa3(0x2ea)](_0x1babfb)&&_0x1babfb[_0x33bfa3(0x2c8)](function(_0x26b876,_0x1cd31e){var _0x13d9e6=_0x33bfa3;if(_0x4a200a++,_0x2e90c6[_0x13d9e6(0x28f)]++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;return;}if(!_0x2e90c6[_0x13d9e6(0x2af)]&&_0x2e90c6[_0x13d9e6(0x2bf)]&&_0x2e90c6[_0x13d9e6(0x28f)]>_0x2e90c6[_0x13d9e6(0x28a)]){_0x2e69b1=!0x0;return;}var _0x5245d5=_0x1cd31e[_0x13d9e6(0x269)]();_0x5245d5['length']>0x64&&(_0x5245d5=_0x5245d5[_0x13d9e6(0x232)](0x0,0x64)+'...'),_0x1fd1ab[_0x13d9e6(0x2e0)](_0x168568['_addProperty'](_0x2ee350,_0x1babfb,_0x13d9e6(0x283),_0x5245d5,_0x2e90c6,function(_0x437b32){return function(){return _0x437b32;};}(_0x26b876)));}),!_0xf19808){try{for(_0x5481d5 in _0x1babfb)if(!(_0x443a68&&_0x1ec59c[_0x33bfa3(0x25d)](_0x5481d5))&&!this[_0x33bfa3(0x251)](_0x1babfb,_0x5481d5,_0x2e90c6)){if(_0x4a200a++,_0x2e90c6['autoExpandPropertyCount']++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;break;}if(!_0x2e90c6['isExpressionToEvaluate']&&_0x2e90c6[_0x33bfa3(0x2bf)]&&_0x2e90c6[_0x33bfa3(0x28f)]>_0x2e90c6[_0x33bfa3(0x28a)]){_0x2e69b1=!0x0;break;}_0x1fd1ab[_0x33bfa3(0x2e0)](_0x168568[_0x33bfa3(0x1dd)](_0x2ee350,_0x5d7eb8,_0x1babfb,_0x4e2612,_0x5481d5,_0x2e90c6));}}catch{}if(_0x5d7eb8[_0x33bfa3(0x214)]=!0x0,_0x10ecde&&(_0x5d7eb8[_0x33bfa3(0x248)]=!0x0),!_0x2e69b1){var _0x4a9287=[][_0x33bfa3(0x29c)](this[_0x33bfa3(0x202)](_0x1babfb))['concat'](this[_0x33bfa3(0x2c1)](_0x1babfb));for(_0x2e727d=0x0,_0x4ce0a7=_0x4a9287[_0x33bfa3(0x1ee)];_0x2e727d<_0x4ce0a7;_0x2e727d++)if(_0x5481d5=_0x4a9287[_0x2e727d],!(_0x443a68&&_0x1ec59c[_0x33bfa3(0x25d)](_0x5481d5['toString']()))&&!this[_0x33bfa3(0x251)](_0x1babfb,_0x5481d5,_0x2e90c6)&&!_0x5d7eb8[typeof _0x5481d5!=_0x33bfa3(0x2ca)?_0x33bfa3(0x2ba)+_0x5481d5['toString']():_0x5481d5]){if(_0x4a200a++,_0x2e90c6[_0x33bfa3(0x28f)]++,_0x4a200a>_0x2d45fa){_0x2e69b1=!0x0;break;}if(!_0x2e90c6[_0x33bfa3(0x2af)]&&_0x2e90c6[_0x33bfa3(0x2bf)]&&_0x2e90c6[_0x33bfa3(0x28f)]>_0x2e90c6[_0x33bfa3(0x28a)]){_0x2e69b1=!0x0;break;}_0x1fd1ab['push'](_0x168568[_0x33bfa3(0x1dd)](_0x2ee350,_0x5d7eb8,_0x1babfb,_0x4e2612,_0x5481d5,_0x2e90c6));}}}}}if(_0x254f7f['type']=_0x4e2612,_0x21daba?(_0x254f7f[_0x33bfa3(0x2e9)]=_0x1babfb[_0x33bfa3(0x2b8)](),this[_0x33bfa3(0x298)](_0x4e2612,_0x254f7f,_0x2e90c6,_0xdb54a9)):_0x4e2612===_0x33bfa3(0x24d)?_0x254f7f[_0x33bfa3(0x2e9)]=this[_0x33bfa3(0x2aa)]['call'](_0x1babfb):_0x4e2612===_0x33bfa3(0x267)?_0x254f7f[_0x33bfa3(0x2e9)]=_0x1babfb['toString']():_0x4e2612===_0x33bfa3(0x285)?_0x254f7f['value']=this[_0x33bfa3(0x215)][_0x33bfa3(0x1ec)](_0x1babfb):_0x4e2612===_0x33bfa3(0x2ca)&&this[_0x33bfa3(0x2cc)]?_0x254f7f[_0x33bfa3(0x2e9)]=this[_0x33bfa3(0x2cc)]['prototype'][_0x33bfa3(0x269)]['call'](_0x1babfb):!_0x2e90c6[_0x33bfa3(0x2d4)]&&!(_0x4e2612===_0x33bfa3(0x2d8)||_0x4e2612===_0x33bfa3(0x2cd))&&(delete _0x254f7f[_0x33bfa3(0x2e9)],_0x254f7f[_0x33bfa3(0x20c)]=!0x0),_0x2e69b1&&(_0x254f7f['cappedProps']=!0x0),_0x3b2ef2=_0x2e90c6[_0x33bfa3(0x286)][_0x33bfa3(0x200)],_0x2e90c6['node'][_0x33bfa3(0x200)]=_0x254f7f,this['_treeNodePropertiesBeforeFullValue'](_0x254f7f,_0x2e90c6),_0x1fd1ab['length']){for(_0x2e727d=0x0,_0x4ce0a7=_0x1fd1ab['length'];_0x2e727d<_0x4ce0a7;_0x2e727d++)_0x1fd1ab[_0x2e727d](_0x2e727d);}_0x2ee350[_0x33bfa3(0x1ee)]&&(_0x254f7f[_0x33bfa3(0x1ef)]=_0x2ee350);}catch(_0x36e778){_0x3a3c67(_0x36e778,_0x254f7f,_0x2e90c6);}this[_0x33bfa3(0x2c7)](_0x1babfb,_0x254f7f),this[_0x33bfa3(0x2e5)](_0x254f7f,_0x2e90c6),_0x2e90c6[_0x33bfa3(0x286)][_0x33bfa3(0x200)]=_0x3b2ef2,_0x2e90c6[_0x33bfa3(0x2c9)]--,_0x2e90c6[_0x33bfa3(0x2bf)]=_0x471824,_0x2e90c6['autoExpand']&&_0x2e90c6[_0x33bfa3(0x1e2)][_0x33bfa3(0x27e)]();}finally{_0x361300&&(_0x1b046d['console'][_0x33bfa3(0x29e)]=_0x361300),_0x7450c3&&(_0x1b046d[_0x33bfa3(0x1e7)][_0x33bfa3(0x213)]=_0x7450c3),_0x1b046d[_0x33bfa3(0x240)]=_0x1f473b;}return _0x254f7f;},_0x39602c[_0x1f5d44(0x27c)]['_getOwnPropertySymbols']=function(_0xd19fef){var _0x1f8178=_0x1f5d44;return Object['getOwnPropertySymbols']?Object[_0x1f8178(0x209)](_0xd19fef):[];},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x219)]=function(_0x5ece89){var _0x396459=_0x1f5d44;return!!(_0x5ece89&&_0x1b046d['Set']&&this[_0x396459(0x2a0)](_0x5ece89)===_0x396459(0x2ce)&&_0x5ece89[_0x396459(0x2c8)]);},_0x39602c['prototype'][_0x1f5d44(0x251)]=function(_0x5e3ecf,_0x457efe,_0x503699){var _0x58ab93=_0x1f5d44;if(!_0x503699[_0x58ab93(0x226)]){let _0x40a764=this['_getOwnPropertyDescriptor'](_0x5e3ecf,_0x457efe);if(_0x40a764&&_0x40a764[_0x58ab93(0x1eb)])return!0x0;}return _0x503699[_0x58ab93(0x1f5)]?typeof _0x5e3ecf[_0x457efe]==_0x58ab93(0x230):!0x1;},_0x39602c['prototype'][_0x1f5d44(0x297)]=function(_0x55aea2){var _0x3223a6=_0x1f5d44,_0x435cfc='';return _0x435cfc=typeof _0x55aea2,_0x435cfc===_0x3223a6(0x26a)?this[_0x3223a6(0x2a0)](_0x55aea2)==='[object\\x20Array]'?_0x435cfc=_0x3223a6(0x260):this['_objectToString'](_0x55aea2)===_0x3223a6(0x287)?_0x435cfc=_0x3223a6(0x24d):this['_objectToString'](_0x55aea2)===_0x3223a6(0x2bc)?_0x435cfc=_0x3223a6(0x267):_0x55aea2===null?_0x435cfc='null':_0x55aea2[_0x3223a6(0x277)]&&(_0x435cfc=_0x55aea2[_0x3223a6(0x277)][_0x3223a6(0x273)]||_0x435cfc):_0x435cfc===_0x3223a6(0x2cd)&&this[_0x3223a6(0x26f)]&&_0x55aea2 instanceof this[_0x3223a6(0x26f)]&&(_0x435cfc=_0x3223a6(0x23a)),_0x435cfc;},_0x39602c['prototype'][_0x1f5d44(0x2a0)]=function(_0x2bac5a){var _0x4622cb=_0x1f5d44;return Object['prototype'][_0x4622cb(0x269)][_0x4622cb(0x1ec)](_0x2bac5a);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x1fc)]=function(_0x2ccf2c){var _0x674b58=_0x1f5d44;return _0x2ccf2c===_0x674b58(0x1e0)||_0x2ccf2c===_0x674b58(0x1f2)||_0x2ccf2c===_0x674b58(0x2e8);},_0x39602c[_0x1f5d44(0x27c)]['_isPrimitiveWrapperType']=function(_0x5299e2){var _0x55fd87=_0x1f5d44;return _0x5299e2===_0x55fd87(0x2d5)||_0x5299e2==='String'||_0x5299e2===_0x55fd87(0x245);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x223)]=function(_0x157555,_0x1174b0,_0x2697a9,_0x20ea02,_0x1e29d4,_0x5f3380){var _0x174700=this;return function(_0x3816dd){var _0x4b6516=_0x4187,_0x57f376=_0x1e29d4[_0x4b6516(0x286)][_0x4b6516(0x200)],_0xed0e7b=_0x1e29d4[_0x4b6516(0x286)]['index'],_0x57849c=_0x1e29d4['node'][_0x4b6516(0x261)];_0x1e29d4['node']['parent']=_0x57f376,_0x1e29d4[_0x4b6516(0x286)]['index']=typeof _0x20ea02==_0x4b6516(0x2e8)?_0x20ea02:_0x3816dd,_0x157555[_0x4b6516(0x2e0)](_0x174700[_0x4b6516(0x208)](_0x1174b0,_0x2697a9,_0x20ea02,_0x1e29d4,_0x5f3380)),_0x1e29d4[_0x4b6516(0x286)]['parent']=_0x57849c,_0x1e29d4['node'][_0x4b6516(0x2b4)]=_0xed0e7b;};},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x1dd)]=function(_0x16666b,_0x37b24a,_0xca6b76,_0x5eaca8,_0x47f24d,_0x518bd1,_0x3aad4c){var _0x5a59c9=_0x1f5d44,_0x5d7f32=this;return _0x37b24a[typeof _0x47f24d!=_0x5a59c9(0x2ca)?_0x5a59c9(0x2ba)+_0x47f24d['toString']():_0x47f24d]=!0x0,function(_0x186abb){var _0x227537=_0x5a59c9,_0x93753=_0x518bd1[_0x227537(0x286)]['current'],_0x3a8b46=_0x518bd1[_0x227537(0x286)][_0x227537(0x2b4)],_0x5cf7ec=_0x518bd1[_0x227537(0x286)]['parent'];_0x518bd1[_0x227537(0x286)]['parent']=_0x93753,_0x518bd1['node'][_0x227537(0x2b4)]=_0x186abb,_0x16666b[_0x227537(0x2e0)](_0x5d7f32[_0x227537(0x208)](_0xca6b76,_0x5eaca8,_0x47f24d,_0x518bd1,_0x3aad4c)),_0x518bd1[_0x227537(0x286)][_0x227537(0x261)]=_0x5cf7ec,_0x518bd1[_0x227537(0x286)]['index']=_0x3a8b46;};},_0x39602c[_0x1f5d44(0x27c)]['_property']=function(_0x1e9096,_0x2437b1,_0x5a258e,_0x306875,_0xeb1ab2){var _0x2e8b77=_0x1f5d44,_0x1ab203=this;_0xeb1ab2||(_0xeb1ab2=function(_0x2125a7,_0x5a8e51){return _0x2125a7[_0x5a8e51];});var _0x1a70b4=_0x5a258e[_0x2e8b77(0x269)](),_0x4a3b80=_0x306875[_0x2e8b77(0x27f)]||{},_0x4ec463=_0x306875[_0x2e8b77(0x2d4)],_0x436a10=_0x306875['isExpressionToEvaluate'];try{var _0x4a65f6=this[_0x2e8b77(0x2ea)](_0x1e9096),_0x14070f=_0x1a70b4;_0x4a65f6&&_0x14070f[0x0]==='\\x27'&&(_0x14070f=_0x14070f[_0x2e8b77(0x24a)](0x1,_0x14070f['length']-0x2));var _0x33f2fd=_0x306875[_0x2e8b77(0x27f)]=_0x4a3b80[_0x2e8b77(0x2ba)+_0x14070f];_0x33f2fd&&(_0x306875['depth']=_0x306875[_0x2e8b77(0x2d4)]+0x1),_0x306875['isExpressionToEvaluate']=!!_0x33f2fd;var _0x761c47=typeof _0x5a258e==_0x2e8b77(0x2ca),_0x2a07c1={'name':_0x761c47||_0x4a65f6?_0x1a70b4:this['_propertyName'](_0x1a70b4)};if(_0x761c47&&(_0x2a07c1[_0x2e8b77(0x2ca)]=!0x0),!(_0x2437b1===_0x2e8b77(0x260)||_0x2437b1===_0x2e8b77(0x2e7))){var _0x336b0f=this[_0x2e8b77(0x212)](_0x1e9096,_0x5a258e);if(_0x336b0f&&(_0x336b0f[_0x2e8b77(0x257)]&&(_0x2a07c1['setter']=!0x0),_0x336b0f[_0x2e8b77(0x1eb)]&&!_0x33f2fd&&!_0x306875[_0x2e8b77(0x226)]))return _0x2a07c1['getter']=!0x0,this[_0x2e8b77(0x237)](_0x2a07c1,_0x306875),_0x2a07c1;}var _0x42b0f3;try{_0x42b0f3=_0xeb1ab2(_0x1e9096,_0x5a258e);}catch(_0x470aa0){return _0x2a07c1={'name':_0x1a70b4,'type':_0x2e8b77(0x2a8),'error':_0x470aa0[_0x2e8b77(0x1ff)]},this[_0x2e8b77(0x237)](_0x2a07c1,_0x306875),_0x2a07c1;}var _0x3f69d6=this[_0x2e8b77(0x297)](_0x42b0f3),_0x26ec12=this[_0x2e8b77(0x1fc)](_0x3f69d6);if(_0x2a07c1['type']=_0x3f69d6,_0x26ec12)this['_processTreeNodeResult'](_0x2a07c1,_0x306875,_0x42b0f3,function(){var _0x27d61e=_0x2e8b77;_0x2a07c1[_0x27d61e(0x2e9)]=_0x42b0f3[_0x27d61e(0x2b8)](),!_0x33f2fd&&_0x1ab203[_0x27d61e(0x298)](_0x3f69d6,_0x2a07c1,_0x306875,{});});else{var _0x353800=_0x306875[_0x2e8b77(0x2bf)]&&_0x306875[_0x2e8b77(0x2c9)]<_0x306875[_0x2e8b77(0x21f)]&&_0x306875[_0x2e8b77(0x1e2)][_0x2e8b77(0x229)](_0x42b0f3)<0x0&&_0x3f69d6!==_0x2e8b77(0x230)&&_0x306875['autoExpandPropertyCount']<_0x306875[_0x2e8b77(0x28a)];_0x353800||_0x306875[_0x2e8b77(0x2c9)]<_0x4ec463||_0x33f2fd?this['serialize'](_0x2a07c1,_0x42b0f3,_0x306875,_0x33f2fd||{}):this[_0x2e8b77(0x237)](_0x2a07c1,_0x306875,_0x42b0f3,function(){var _0x26b4af=_0x2e8b77;_0x3f69d6==='null'||_0x3f69d6===_0x26b4af(0x2cd)||(delete _0x2a07c1[_0x26b4af(0x2e9)],_0x2a07c1[_0x26b4af(0x20c)]=!0x0);});}return _0x2a07c1;}finally{_0x306875[_0x2e8b77(0x27f)]=_0x4a3b80,_0x306875[_0x2e8b77(0x2d4)]=_0x4ec463,_0x306875[_0x2e8b77(0x2af)]=_0x436a10;}},_0x39602c[_0x1f5d44(0x27c)]['_capIfString']=function(_0x400724,_0x56f824,_0x52035a,_0x2a5d1b){var _0x1c76fb=_0x1f5d44,_0x5d1231=_0x2a5d1b[_0x1c76fb(0x23c)]||_0x52035a[_0x1c76fb(0x23c)];if((_0x400724===_0x1c76fb(0x1f2)||_0x400724===_0x1c76fb(0x23b))&&_0x56f824[_0x1c76fb(0x2e9)]){let _0x1dff43=_0x56f824[_0x1c76fb(0x2e9)][_0x1c76fb(0x1ee)];_0x52035a[_0x1c76fb(0x2b7)]+=_0x1dff43,_0x52035a[_0x1c76fb(0x2b7)]>_0x52035a[_0x1c76fb(0x1de)]?(_0x56f824[_0x1c76fb(0x20c)]='',delete _0x56f824[_0x1c76fb(0x2e9)]):_0x1dff43>_0x5d1231&&(_0x56f824[_0x1c76fb(0x20c)]=_0x56f824['value'][_0x1c76fb(0x24a)](0x0,_0x5d1231),delete _0x56f824[_0x1c76fb(0x2e9)]);}},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2ea)]=function(_0x2b582){var _0x4f59b4=_0x1f5d44;return!!(_0x2b582&&_0x1b046d[_0x4f59b4(0x283)]&&this[_0x4f59b4(0x2a0)](_0x2b582)===_0x4f59b4(0x2d2)&&_0x2b582[_0x4f59b4(0x2c8)]);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x1ed)]=function(_0xd0769c){var _0x56daad=_0x1f5d44;if(_0xd0769c[_0x56daad(0x207)](/^\\d+$/))return _0xd0769c;var _0x44321c;try{_0x44321c=JSON[_0x56daad(0x274)](''+_0xd0769c);}catch{_0x44321c='\\x22'+this[_0x56daad(0x2a0)](_0xd0769c)+'\\x22';}return _0x44321c[_0x56daad(0x207)](/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)?_0x44321c=_0x44321c[_0x56daad(0x24a)](0x1,_0x44321c[_0x56daad(0x1ee)]-0x2):_0x44321c=_0x44321c[_0x56daad(0x2c4)](/'/g,'\\x5c\\x27')[_0x56daad(0x2c4)](/\\\\"/g,'\\x22')[_0x56daad(0x2c4)](/(^"|"$)/g,'\\x27'),_0x44321c;},_0x39602c[_0x1f5d44(0x27c)]['_processTreeNodeResult']=function(_0x35d4de,_0x18bf2b,_0x4b4ba8,_0x5e4ad4){var _0x3ae3b4=_0x1f5d44;this[_0x3ae3b4(0x24f)](_0x35d4de,_0x18bf2b),_0x5e4ad4&&_0x5e4ad4(),this[_0x3ae3b4(0x2c7)](_0x4b4ba8,_0x35d4de),this['_treeNodePropertiesAfterFullValue'](_0x35d4de,_0x18bf2b);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x24f)]=function(_0x3fef10,_0x16c344){var _0x25886e=_0x1f5d44;this[_0x25886e(0x275)](_0x3fef10,_0x16c344),this[_0x25886e(0x2d1)](_0x3fef10,_0x16c344),this[_0x25886e(0x239)](_0x3fef10,_0x16c344),this['_setNodePermissions'](_0x3fef10,_0x16c344);},_0x39602c['prototype'][_0x1f5d44(0x275)]=function(_0x4a95cf,_0x5175f9){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2d1)]=function(_0x4dd70e,_0x1d0a77){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x250)]=function(_0x2add9b,_0x21294a){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x241)]=function(_0x57f907){return _0x57f907===this['_undefined'];},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2e5)]=function(_0x47895e,_0x5ee6d0){var _0x3bb2e6=_0x1f5d44;this[_0x3bb2e6(0x250)](_0x47895e,_0x5ee6d0),this['_setNodeExpandableState'](_0x47895e),_0x5ee6d0[_0x3bb2e6(0x2c3)]&&this[_0x3bb2e6(0x288)](_0x47895e),this[_0x3bb2e6(0x2db)](_0x47895e,_0x5ee6d0),this[_0x3bb2e6(0x23e)](_0x47895e,_0x5ee6d0),this[_0x3bb2e6(0x2ab)](_0x47895e);},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x2c7)]=function(_0x406f89,_0x5dc600){var _0x3d052f=_0x1f5d44;try{_0x406f89&&typeof _0x406f89[_0x3d052f(0x1ee)]==_0x3d052f(0x2e8)&&(_0x5dc600[_0x3d052f(0x1ee)]=_0x406f89['length']);}catch{}if(_0x5dc600[_0x3d052f(0x27b)]===_0x3d052f(0x2e8)||_0x5dc600[_0x3d052f(0x27b)]===_0x3d052f(0x245)){if(isNaN(_0x5dc600['value']))_0x5dc600[_0x3d052f(0x299)]=!0x0,delete _0x5dc600[_0x3d052f(0x2e9)];else switch(_0x5dc600['value']){case Number[_0x3d052f(0x1f9)]:_0x5dc600['positiveInfinity']=!0x0,delete _0x5dc600['value'];break;case Number['NEGATIVE_INFINITY']:_0x5dc600[_0x3d052f(0x25c)]=!0x0,delete _0x5dc600[_0x3d052f(0x2e9)];break;case 0x0:this[_0x3d052f(0x247)](_0x5dc600['value'])&&(_0x5dc600['negativeZero']=!0x0);break;}}else _0x5dc600[_0x3d052f(0x27b)]===_0x3d052f(0x230)&&typeof _0x406f89[_0x3d052f(0x273)]=='string'&&_0x406f89[_0x3d052f(0x273)]&&_0x5dc600[_0x3d052f(0x273)]&&_0x406f89[_0x3d052f(0x273)]!==_0x5dc600['name']&&(_0x5dc600[_0x3d052f(0x218)]=_0x406f89[_0x3d052f(0x273)]);},_0x39602c['prototype'][_0x1f5d44(0x247)]=function(_0x58bf0d){var _0x1eeae2=_0x1f5d44;return 0x1/_0x58bf0d===Number[_0x1eeae2(0x210)];},_0x39602c[_0x1f5d44(0x27c)]['_sortProps']=function(_0x4d7dd2){var _0x5c6f19=_0x1f5d44;!_0x4d7dd2['props']||!_0x4d7dd2[_0x5c6f19(0x1ef)]['length']||_0x4d7dd2['type']===_0x5c6f19(0x260)||_0x4d7dd2[_0x5c6f19(0x27b)]===_0x5c6f19(0x283)||_0x4d7dd2[_0x5c6f19(0x27b)]===_0x5c6f19(0x22b)||_0x4d7dd2[_0x5c6f19(0x1ef)][_0x5c6f19(0x1e3)](function(_0xb25f8,_0x3feabb){var _0x34181c=_0x5c6f19,_0x30ed1b=_0xb25f8[_0x34181c(0x273)][_0x34181c(0x2b3)](),_0x28978d=_0x3feabb['name'][_0x34181c(0x2b3)]();return _0x30ed1b<_0x28978d?-0x1:_0x30ed1b>_0x28978d?0x1:0x0;});},_0x39602c[_0x1f5d44(0x27c)]['_addFunctionsNode']=function(_0x5294e5,_0x377958){var _0x476737=_0x1f5d44;if(!(_0x377958[_0x476737(0x1f5)]||!_0x5294e5[_0x476737(0x1ef)]||!_0x5294e5['props'][_0x476737(0x1ee)])){for(var _0x23c633=[],_0x1cff31=[],_0x44160d=0x0,_0x4684cd=_0x5294e5['props'][_0x476737(0x1ee)];_0x44160d<_0x4684cd;_0x44160d++){var _0x36796e=_0x5294e5['props'][_0x44160d];_0x36796e[_0x476737(0x27b)]===_0x476737(0x230)?_0x23c633[_0x476737(0x2e0)](_0x36796e):_0x1cff31[_0x476737(0x2e0)](_0x36796e);}if(!(!_0x1cff31[_0x476737(0x1ee)]||_0x23c633[_0x476737(0x1ee)]<=0x1)){_0x5294e5[_0x476737(0x1ef)]=_0x1cff31;var _0x1e6ca0={'functionsNode':!0x0,'props':_0x23c633};this[_0x476737(0x275)](_0x1e6ca0,_0x377958),this[_0x476737(0x250)](_0x1e6ca0,_0x377958),this[_0x476737(0x2df)](_0x1e6ca0),this[_0x476737(0x1e4)](_0x1e6ca0,_0x377958),_0x1e6ca0['id']+='\\x20f',_0x5294e5[_0x476737(0x1ef)][_0x476737(0x21b)](_0x1e6ca0);}}},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x23e)]=function(_0xc708e1,_0x1404ba){},_0x39602c['prototype']['_setNodeExpandableState']=function(_0x44d604){},_0x39602c[_0x1f5d44(0x27c)][_0x1f5d44(0x22d)]=function(_0x3c17fb){var _0x14eb98=_0x1f5d44;return Array[_0x14eb98(0x2a1)](_0x3c17fb)||typeof _0x3c17fb==_0x14eb98(0x26a)&&this['_objectToString'](_0x3c17fb)===_0x14eb98(0x21c);},_0x39602c[_0x1f5d44(0x27c)]['_setNodePermissions']=function(_0x1360b0,_0x443f96){},_0x39602c[_0x1f5d44(0x27c)]['_cleanNode']=function(_0x26f307){var _0x360d43=_0x1f5d44;delete _0x26f307[_0x360d43(0x1f0)],delete _0x26f307['_hasSetOnItsPath'],delete _0x26f307[_0x360d43(0x2de)];},_0x39602c['prototype'][_0x1f5d44(0x239)]=function(_0x21594a,_0x1ea38a){};let _0x4fccde=new _0x39602c(),_0x5aef3e={'props':_0x39e136['defaultLimits'][_0x1f5d44(0x1ef)]||0x64,'elements':_0x39e136['defaultLimits']['elements']||0x64,'strLength':_0x39e136[_0x1f5d44(0x1dc)][_0x1f5d44(0x23c)]||0x400*0x32,'totalStrLength':_0x39e136['defaultLimits'][_0x1f5d44(0x1de)]||0x400*0x32,'autoExpandLimit':_0x39e136['defaultLimits'][_0x1f5d44(0x28a)]||0x1388,'autoExpandMaxDepth':_0x39e136['defaultLimits'][_0x1f5d44(0x21f)]||0xa},_0x374151={'props':_0x39e136[_0x1f5d44(0x225)][_0x1f5d44(0x1ef)]||0x5,'elements':_0x39e136[_0x1f5d44(0x225)][_0x1f5d44(0x1f7)]||0x5,'strLength':_0x39e136[_0x1f5d44(0x225)]['strLength']||0x100,'totalStrLength':_0x39e136[_0x1f5d44(0x225)][_0x1f5d44(0x1de)]||0x100*0x3,'autoExpandLimit':_0x39e136['reducedLimits'][_0x1f5d44(0x28a)]||0x1e,'autoExpandMaxDepth':_0x39e136['reducedLimits']['autoExpandMaxDepth']||0x2};if(_0x5d8b23){let _0x275f95=_0x4fccde['serialize'][_0x1f5d44(0x262)](_0x4fccde);_0x4fccde[_0x1f5d44(0x2b2)]=function(_0x1c90b2,_0x4276f3,_0x30aacd,_0x55932d){return _0x275f95(_0x1c90b2,_0x5d8b23(_0x4276f3),_0x30aacd,_0x55932d);};}function _0x1a7762(_0x577f01,_0x418059,_0x269690,_0x32321b,_0x4cd5b2,_0x52912d){var _0x4ce86f=_0x1f5d44;let _0x3eb726,_0xb700fa;try{_0xb700fa=_0x5553e9(),_0x3eb726=_0x5b51f5[_0x418059],!_0x3eb726||_0xb700fa-_0x3eb726['ts']>_0x4756a1[_0x4ce86f(0x291)][_0x4ce86f(0x264)]&&_0x3eb726['count']&&_0x3eb726[_0x4ce86f(0x255)]/_0x3eb726[_0x4ce86f(0x238)]<_0x4756a1['perLogpoint']['resetOnProcessingTimeAverageMs']?(_0x5b51f5[_0x418059]=_0x3eb726={'count':0x0,'time':0x0,'ts':_0xb700fa},_0x5b51f5[_0x4ce86f(0x206)]={}):_0xb700fa-_0x5b51f5['hits']['ts']>_0x4756a1['global']['resetWhenQuietMs']&&_0x5b51f5['hits']['count']&&_0x5b51f5[_0x4ce86f(0x206)]['time']/_0x5b51f5['hits'][_0x4ce86f(0x238)]<_0x4756a1['global'][_0x4ce86f(0x231)]&&(_0x5b51f5[_0x4ce86f(0x206)]={});let _0x41ced7=[],_0x1fbc3d=_0x3eb726['reduceLimits']||_0x5b51f5['hits']['reduceLimits']?_0x374151:_0x5aef3e,_0x2da3f7=_0x3d6b99=>{var _0x44db24=_0x4ce86f;let _0x4c46fe={};return _0x4c46fe[_0x44db24(0x1ef)]=_0x3d6b99[_0x44db24(0x1ef)],_0x4c46fe['elements']=_0x3d6b99[_0x44db24(0x1f7)],_0x4c46fe[_0x44db24(0x23c)]=_0x3d6b99[_0x44db24(0x23c)],_0x4c46fe['totalStrLength']=_0x3d6b99[_0x44db24(0x1de)],_0x4c46fe[_0x44db24(0x28a)]=_0x3d6b99[_0x44db24(0x28a)],_0x4c46fe[_0x44db24(0x21f)]=_0x3d6b99[_0x44db24(0x21f)],_0x4c46fe[_0x44db24(0x2c3)]=!0x1,_0x4c46fe[_0x44db24(0x1f5)]=!_0x3af781,_0x4c46fe[_0x44db24(0x2d4)]=0x1,_0x4c46fe['level']=0x0,_0x4c46fe[_0x44db24(0x1fb)]=_0x44db24(0x29b),_0x4c46fe[_0x44db24(0x296)]='root_exp',_0x4c46fe[_0x44db24(0x2bf)]=!0x0,_0x4c46fe[_0x44db24(0x1e2)]=[],_0x4c46fe[_0x44db24(0x28f)]=0x0,_0x4c46fe[_0x44db24(0x226)]=_0x39e136[_0x44db24(0x226)],_0x4c46fe[_0x44db24(0x2b7)]=0x0,_0x4c46fe[_0x44db24(0x286)]={'current':void 0x0,'parent':void 0x0,'index':0x0},_0x4c46fe;};for(var _0x42e392=0x0;_0x42e392<_0x4cd5b2[_0x4ce86f(0x1ee)];_0x42e392++)_0x41ced7[_0x4ce86f(0x2e0)](_0x4fccde[_0x4ce86f(0x2b2)]({'timeNode':_0x577f01==='time'||void 0x0},_0x4cd5b2[_0x42e392],_0x2da3f7(_0x1fbc3d),{}));if(_0x577f01===_0x4ce86f(0x29f)||_0x577f01===_0x4ce86f(0x29e)){let _0x4f7582=Error['stackTraceLimit'];try{Error[_0x4ce86f(0x221)]=0x1/0x0,_0x41ced7['push'](_0x4fccde[_0x4ce86f(0x2b2)]({'stackNode':!0x0},new Error()[_0x4ce86f(0x22e)],_0x2da3f7(_0x1fbc3d),{'strLength':0x1/0x0}));}finally{Error[_0x4ce86f(0x221)]=_0x4f7582;}}return{'method':_0x4ce86f(0x2d3),'version':_0x4cee6a,'args':[{'ts':_0x269690,'session':_0x32321b,'args':_0x41ced7,'id':_0x418059,'context':_0x52912d}]};}catch(_0x2a8c31){return{'method':_0x4ce86f(0x2d3),'version':_0x4cee6a,'args':[{'ts':_0x269690,'session':_0x32321b,'args':[{'type':_0x4ce86f(0x2a8),'error':_0x2a8c31&&_0x2a8c31['message']}],'id':_0x418059,'context':_0x52912d}]};}finally{try{if(_0x3eb726&&_0xb700fa){let _0x28b06b=_0x5553e9();_0x3eb726[_0x4ce86f(0x238)]++,_0x3eb726['time']+=_0x13f85b(_0xb700fa,_0x28b06b),_0x3eb726['ts']=_0x28b06b,_0x5b51f5[_0x4ce86f(0x206)]['count']++,_0x5b51f5[_0x4ce86f(0x206)][_0x4ce86f(0x255)]+=_0x13f85b(_0xb700fa,_0x28b06b),_0x5b51f5[_0x4ce86f(0x206)]['ts']=_0x28b06b,(_0x3eb726['count']>_0x4756a1['perLogpoint'][_0x4ce86f(0x1e8)]||_0x3eb726[_0x4ce86f(0x255)]>_0x4756a1[_0x4ce86f(0x291)][_0x4ce86f(0x281)])&&(_0x3eb726[_0x4ce86f(0x201)]=!0x0),(_0x5b51f5[_0x4ce86f(0x206)][_0x4ce86f(0x238)]>_0x4756a1[_0x4ce86f(0x2d7)][_0x4ce86f(0x1e8)]||_0x5b51f5[_0x4ce86f(0x206)][_0x4ce86f(0x255)]>_0x4756a1[_0x4ce86f(0x2d7)]['reduceOnAccumulatedProcessingTimeMs'])&&(_0x5b51f5[_0x4ce86f(0x206)]['reduceLimits']=!0x0);}}catch{}}}return _0x1a7762;}function G(_0x372717){var _0x766cc9=_0x3890c8;if(_0x372717&&typeof _0x372717=='object'&&_0x372717[_0x766cc9(0x277)])switch(_0x372717[_0x766cc9(0x277)]['name']){case _0x766cc9(0x256):return _0x372717[_0x766cc9(0x21a)](Symbol['iterator'])?Promise['resolve']():_0x372717;case _0x766cc9(0x1fe):return Promise[_0x766cc9(0x25e)]();}return _0x372717;}((_0xc5752,_0xa30047,_0x3f3995,_0x363a2d,_0x27a42d,_0x5b6f79,_0x45d099,_0x2bc6fb,_0x126cff,_0x1d3c75,_0x2e3f19,_0x464da7)=>{var _0xd5f224=_0x3890c8;if(_0xc5752[_0xd5f224(0x289)])return _0xc5752[_0xd5f224(0x289)];let _0x41b2d1={'consoleLog':()=>{},'consoleTrace':()=>{},'consoleTime':()=>{},'consoleTimeEnd':()=>{},'autoLog':()=>{},'autoLogMany':()=>{},'autoTraceMany':()=>{},'coverage':()=>{},'autoTrace':()=>{},'autoTime':()=>{},'autoTimeEnd':()=>{}};if(!X(_0xc5752,_0x2bc6fb,_0x27a42d))return _0xc5752[_0xd5f224(0x289)]=_0x41b2d1,_0xc5752['_console_ninja'];let _0x3886d2=b(_0xc5752),_0x2794c3=_0x3886d2[_0xd5f224(0x276)],_0x44129f=_0x3886d2[_0xd5f224(0x2be)],_0x277b60=_0x3886d2[_0xd5f224(0x2b0)],_0x5b8e52={'hits':{},'ts':{}},_0x1f8b30=J(_0xc5752,_0x126cff,_0x5b8e52,_0x5b6f79,_0x464da7,_0x27a42d===_0xd5f224(0x244)?G:void 0x0),_0x46c143=(_0x82e8dd,_0x59b610,_0x51fdcc,_0x5c78c9,_0x42589f,_0x28db7b)=>{var _0xf273d1=_0xd5f224;let _0x39c71d=_0xc5752[_0xf273d1(0x289)];try{return _0xc5752['_console_ninja']=_0x41b2d1,_0x1f8b30(_0x82e8dd,_0x59b610,_0x51fdcc,_0x5c78c9,_0x42589f,_0x28db7b);}finally{_0xc5752[_0xf273d1(0x289)]=_0x39c71d;}},_0x186fbf=_0x4900f9=>{_0x5b8e52['ts'][_0x4900f9]=_0x44129f();},_0x21fa3c=(_0x242207,_0x1074db)=>{var _0x67dc13=_0xd5f224;let _0x44431a=_0x5b8e52['ts'][_0x1074db];if(delete _0x5b8e52['ts'][_0x1074db],_0x44431a){let _0x41f6fe=_0x2794c3(_0x44431a,_0x44129f());_0x13354f(_0x46c143(_0x67dc13(0x255),_0x242207,_0x277b60(),_0x728f74,[_0x41f6fe],_0x1074db));}},_0x341135=_0x55d522=>{var _0x594af4=_0xd5f224,_0x22d04b;return _0x27a42d==='next.js'&&_0xc5752[_0x594af4(0x224)]&&((_0x22d04b=_0x55d522==null?void 0x0:_0x55d522[_0x594af4(0x2d9)])==null?void 0x0:_0x22d04b[_0x594af4(0x1ee)])&&(_0x55d522[_0x594af4(0x2d9)][0x0][_0x594af4(0x224)]=_0xc5752['origin']),_0x55d522;};_0xc5752['_console_ninja']={'consoleLog':(_0x18a087,_0x257091)=>{var _0x240148=_0xd5f224;_0xc5752[_0x240148(0x1e7)]['log'][_0x240148(0x273)]!==_0x240148(0x227)&&_0x13354f(_0x46c143(_0x240148(0x2d3),_0x18a087,_0x277b60(),_0x728f74,_0x257091));},'consoleTrace':(_0x16338a,_0x54e3f4)=>{var _0x1399d8=_0xd5f224,_0x26a166,_0x49fc60;_0xc5752[_0x1399d8(0x1e7)]['log'][_0x1399d8(0x273)]!==_0x1399d8(0x1e6)&&((_0x49fc60=(_0x26a166=_0xc5752[_0x1399d8(0x266)])==null?void 0x0:_0x26a166[_0x1399d8(0x2a9)])!=null&&_0x49fc60[_0x1399d8(0x286)]&&(_0xc5752[_0x1399d8(0x2a2)]=!0x0),_0x13354f(_0x341135(_0x46c143(_0x1399d8(0x29f),_0x16338a,_0x277b60(),_0x728f74,_0x54e3f4))));},'consoleError':(_0x19664d,_0x4a89b4)=>{var _0x53d07d=_0xd5f224;_0xc5752[_0x53d07d(0x2a2)]=!0x0,_0x13354f(_0x341135(_0x46c143(_0x53d07d(0x29e),_0x19664d,_0x277b60(),_0x728f74,_0x4a89b4)));},'consoleTime':_0x4b8fda=>{_0x186fbf(_0x4b8fda);},'consoleTimeEnd':(_0x53faf9,_0x3ec558)=>{_0x21fa3c(_0x3ec558,_0x53faf9);},'autoLog':(_0x5aeaac,_0x2074bc)=>{_0x13354f(_0x46c143('log',_0x2074bc,_0x277b60(),_0x728f74,[_0x5aeaac]));},'autoLogMany':(_0x3634a2,_0x3fd372)=>{var _0x24da29=_0xd5f224;_0x13354f(_0x46c143(_0x24da29(0x2d3),_0x3634a2,_0x277b60(),_0x728f74,_0x3fd372));},'autoTrace':(_0x5bfb94,_0xee276a)=>{var _0xc67014=_0xd5f224;_0x13354f(_0x341135(_0x46c143(_0xc67014(0x29f),_0xee276a,_0x277b60(),_0x728f74,[_0x5bfb94])));},'autoTraceMany':(_0x29b396,_0x5dc6f1)=>{var _0x6097b4=_0xd5f224;_0x13354f(_0x341135(_0x46c143(_0x6097b4(0x29f),_0x29b396,_0x277b60(),_0x728f74,_0x5dc6f1)));},'autoTime':(_0x1ec463,_0x159318,_0xf6b2dc)=>{_0x186fbf(_0xf6b2dc);},'autoTimeEnd':(_0x3f6263,_0x4ce919,_0x1e750a)=>{_0x21fa3c(_0x4ce919,_0x1e750a);},'coverage':_0x25e683=>{_0x13354f({'method':'coverage','version':_0x5b6f79,'args':[{'id':_0x25e683}]});}};let _0x13354f=H(_0xc5752,_0xa30047,_0x3f3995,_0x363a2d,_0x27a42d,_0x1d3c75,_0x2e3f19),_0x728f74=_0xc5752[_0xd5f224(0x29d)];return _0xc5752[_0xd5f224(0x289)];})(globalThis,'127.0.0.1',_0x3890c8(0x253),_0x3890c8(0x27a),'vite',_0x3890c8(0x2ac),_0x3890c8(0x2c0),_0x3890c8(0x2e1),_0x3890c8(0x259),_0x3890c8(0x2e4),'1',_0x3890c8(0x211));`);
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
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(app.getAppPath(), "dist", "index.html"));
  }
}
app.whenReady().then(() => {
  bootstrap();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
