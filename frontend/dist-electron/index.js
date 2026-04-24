import { app as T, ipcMain as u, BrowserWindow as F } from "electron";
import q, { join as S } from "node:path";
import x from "better-sqlite3";
import V from "node:crypto";
const X = `-- 001_init.sql
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
`, P = `-- 002_settings.sql
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
`, k = `-- 003_sales_tax_snapshot.sql
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
`, $ = `-- 004_customers.sql
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
let _ = null;
function H() {
  if (_) return _;
  const t = q.join(T.getPath("userData"), "taller_pos.sqlite"), e = new x(t);
  return e.pragma("journal_mode = WAL"), e.pragma("foreign_keys = ON"), e.pragma("synchronous = NORMAL"), _ = e, e;
}
const Y = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    checksum    TEXT    NOT NULL,
    executed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;
function j(t) {
  const e = t.replace(/\r\n/g, `
`);
  return V.createHash("sha256").update(e, "utf8").digest("hex");
}
function G(t, e) {
  t.exec(Y);
  const n = t.prepare("SELECT checksum FROM schema_migrations WHERE name = ?"), s = t.prepare(
    "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)"
  ), o = [...e].sort((i, c) => i.name.localeCompare(c.name)), r = [], a = [];
  for (const i of o) {
    const c = j(i.sql), l = n.get(i.name);
    if (l) {
      if (l.checksum !== c)
        throw new Error(
          `Migration tampering detected: "${i.name}" fue aplicada con checksum ${l.checksum} pero el archivo actual tiene ${c}. Nunca modifiques migraciones ya aplicadas; crea una nueva.`
        );
      a.push(i.name);
      continue;
    }
    t.transaction(() => {
      t.exec(i.sql), s.run(i.name, c);
    })(), r.push(i.name);
  }
  return { applied: r, skipped: a };
}
function W(t) {
  const e = {
    selectAll: t.prepare("SELECT key, value, type, category, description, updated_at FROM settings"),
    selectByKey: t.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE key = ?"
    ),
    selectByCategory: t.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE category = ?"
    ),
    updateValue: t.prepare(
      `UPDATE settings
         SET value = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE key = ?`
    )
  };
  return {
    /** @returns {SettingRow[]} */
    findAll() {
      return e.selectAll.all();
    },
    /**
     * @param {string} key
     * @returns {SettingRow | undefined}
     */
    findByKey(n) {
      return e.selectByKey.get(n);
    },
    /**
     * @param {string} category
     * @returns {SettingRow[]}
     */
    findByCategory(n) {
      return e.selectByCategory.all(n);
    },
    /**
     * Actualiza solo el valor (ya serializado a TEXT).
     * No inserta: la creacion de claves es responsabilidad de migraciones.
     * @param {string} key
     * @param {string} serializedValue
     * @returns {number} filas afectadas (0 si key no existe)
     */
    updateValue(n, s) {
      return e.updateValue.run(s, n).changes;
    }
  };
}
class D extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(e, n) {
    super(n), this.name = "SettingError", this.code = e;
  }
}
class L extends D {
  /** @param {string} key */
  constructor(e) {
    super("SETTING_NOT_FOUND", `Setting no encontrado: "${e}"`), this.name = "SettingNotFoundError", this.key = e;
  }
}
class m extends D {
  /**
   * @param {string} key
   * @param {string} expectedType
   * @param {unknown} receivedValue
   */
  constructor(e, n, s) {
    super(
      "SETTING_INVALID_VALUE",
      `Setting "${e}" requiere tipo "${n}" pero recibio ${typeof s} (${String(
        s
      )})`
    ), this.name = "SettingValidationError", this.key = e, this.expectedType = n;
  }
}
function O(t) {
  return { ...t, value: K(t.value, t.type, t.key) };
}
function K(t, e, n) {
  switch (e) {
    case "string":
      return t;
    case "number": {
      const s = Number(t);
      if (!Number.isFinite(s))
        throw new m(n, "number", t);
      return s;
    }
    case "boolean":
      return t === "1" || t === "true";
    case "json":
      try {
        return JSON.parse(t);
      } catch {
        throw new m(n, "json", t);
      }
    default:
      throw new m(n, e, t);
  }
}
function z(t, e, n) {
  switch (e) {
    case "string":
      if (typeof t != "string") throw new m(n, "string", t);
      return t;
    case "number":
      if (typeof t != "number" || !Number.isFinite(t))
        throw new m(n, "number", t);
      return String(t);
    case "boolean":
      if (typeof t != "boolean") throw new m(n, "boolean", t);
      return t ? "1" : "0";
    case "json":
      try {
        return JSON.stringify(t);
      } catch {
        throw new m(n, "json", t);
      }
    default:
      throw new m(n, e, t);
  }
}
function Z(t) {
  const e = /* @__PURE__ */ new Map();
  let n = !1;
  function s() {
    e.clear();
    for (const r of t.findAll())
      e.set(r.key, O(r));
    n = !0;
  }
  function o() {
    n || s();
  }
  return {
    init: s,
    /**
     * @param {string} key
     * @returns {TypedSetting['value']}
     * @throws {SettingNotFoundError}
     */
    get(r) {
      o();
      const a = e.get(r);
      if (!a) throw new L(r);
      return a.value;
    },
    /**
     * Devuelve settings agrupados por `category`:
     *   { tax: { tax_rate: 0.12, ... }, business: { ... }, ... }
     * @returns {Record<string, Record<string, TypedSetting['value']>>}
     */
    getAll() {
      o();
      const r = {};
      for (const a of e.values())
        r[a.category] || (r[a.category] = {}), r[a.category][a.key] = a.value;
      return r;
    },
    /**
     * @param {string} category
     * @returns {Record<string, TypedSetting['value']>}
     */
    getByCategory(r) {
      o();
      const a = {};
      for (const i of e.values())
        i.category === r && (a[i.key] = i.value);
      return a;
    },
    /**
     * Valida tipo, persiste y actualiza el cache. Si la key no existe en DB
     * lanza SettingNotFoundError (no creamos claves: eso va por migraciones).
     *
     * @param {string} key
     * @param {unknown} value
     * @throws {SettingNotFoundError | SettingValidationError}
     */
    set(r, a) {
      o();
      const i = e.get(r);
      if (!i) throw new L(r);
      const c = z(a, i.type, r);
      if (t.updateValue(r, c) === 0)
        throw e.delete(r), new L(r);
      const E = t.findByKey(r);
      e.set(r, O(E));
    }
  };
}
function d(t) {
  return (...e) => {
    try {
      return { ok: !0, data: t(...e) };
    } catch (n) {
      const s = n && typeof n == "object" && "code" in n && typeof n.code == "string" ? n.code : "UNEXPECTED_ERROR", o = n instanceof Error ? n.message : String(n);
      return n && typeof n == "object" && "code" in n || console.error("[ipc] unexpected error:", n), { ok: !1, error: { code: s, message: o } };
    }
  };
}
function Q(t) {
  u.handle("settings:get-all", d(() => t.getAll())), u.handle("settings:get", d((e, n) => t.get(n))), u.handle("settings:get-by-category", d((e, n) => t.getByCategory(n))), u.handle("settings:set", d((e, n, s) => (t.set(n, s), !0)));
}
function J(t) {
  const e = {
    selectAll: t.prepare("SELECT id, code, name, price, stock FROM products"),
    selectById: t.prepare("SELECT id, code, name, price, stock FROM products WHERE id = ?"),
    searchByName: t.prepare(
      "SELECT id, code, name, price, stock FROM products WHERE name LIKE ? OR code LIKE ?"
    )
  };
  return {
    /** @returns {ProductRow[]} */
    findAll() {
      return e.selectAll.all();
    },
    /**
     * @param {number} id
     * @returns {ProductRow | undefined}
     */
    findById(n) {
      return e.selectById.get(n);
    },
    /**
     * Busca por substring en name o code.
     * @param {string} query
     * @returns {ProductRow[]}
     */
    search(n) {
      const s = `%${n}%`;
      return e.searchByName.all(s, s);
    }
  };
}
function ee(t) {
  return {
    list() {
      return t.findAll();
    },
    /**
     * @param {string} query
     */
    search(e) {
      const n = typeof e == "string" ? e.trim() : "";
      return n.length === 0 ? t.findAll() : t.search(n);
    },
    /**
     * Devuelve el producto o null si no existe. No lanza "not found":
     * el caller frecuentemente quiere distinguir 404 de error real y el
     * patron null es mas simple que un error tipado para un read sync.
     *
     * @param {number} id
     * @returns {import('./products.repository.js').ProductRow | null}
     */
    getById(e) {
      if (!Number.isInteger(e) || e <= 0)
        throw Object.assign(new Error(`product id invalido: ${e}`), {
          code: "PRODUCT_INVALID_ID"
        });
      return t.findById(e) ?? null;
    }
  };
}
function te(t) {
  u.handle("products:list", d(() => t.list())), u.handle("products:search", d((e, n) => t.search(n))), u.handle("products:get-by-id", d((e, n) => t.getById(n)));
}
const f = "id, nit, name, email, phone, address, active, created_at, updated_at";
function ne(t) {
  const e = {
    selectAllActive: t.prepare(`SELECT ${f} FROM customers WHERE active = 1 ORDER BY name`),
    selectAllAny: t.prepare(`SELECT ${f} FROM customers ORDER BY name`),
    selectById: t.prepare(`SELECT ${f} FROM customers WHERE id = ?`),
    searchActive: t.prepare(
      `SELECT ${f} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?) AND active = 1
     ORDER BY name
        LIMIT 50`
    ),
    searchAny: t.prepare(
      `SELECT ${f} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?)
     ORDER BY name
        LIMIT 50`
    ),
    insert: t.prepare(
      `INSERT INTO customers (nit, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    ),
    setActive: t.prepare(
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
    findAll(n = {}) {
      return (n.includeInactive ? e.selectAllAny : e.selectAllActive).all();
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | undefined}
     */
    findById(n) {
      return e.selectById.get(n);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(n, s = {}) {
      const o = `%${n}%`;
      return (s.includeInactive ? e.searchAny : e.searchActive).all(o, o);
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {number|bigint} id insertado
     */
    insert(n) {
      return e.insert.run(
        n.nit,
        n.name,
        n.email ?? null,
        n.phone ?? null,
        n.address ?? null
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
    update(n, s) {
      const o = [], r = [];
      for (const [c, l] of Object.entries(s))
        l !== void 0 && (o.push(`${c} = ?`), r.push(l));
      if (o.length === 0) return 0;
      o.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
      const a = `UPDATE customers SET ${o.join(", ")} WHERE id = ?`;
      return r.push(n), t.prepare(a).run(...r).changes;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     * @returns {number} rows affected
     */
    setActive(n, s) {
      return e.setActive.run(s ? 1 : 0, n).changes;
    }
  };
}
class M extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(e, n) {
    super(n), this.name = "CustomerError", this.code = e;
  }
}
class g extends M {
  /** @param {number} id */
  constructor(e) {
    super("CUSTOMER_NOT_FOUND", `Cliente no encontrado: #${e}`), this.id = e;
  }
}
class p extends M {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(e, n) {
    super("CUSTOMER_INVALID", `${e}: ${n}`), this.field = e;
  }
}
const se = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function C(t) {
  const e = (t ?? "").trim().toUpperCase();
  return e.length === 0 ? "C/F" : e;
}
function b(t) {
  if (typeof t != "string" || t.trim().length < 2)
    throw new p("name", "nombre requerido (minimo 2 caracteres)");
}
function w(t) {
  if (!(t == null || t === "") && !se.test(t))
    throw new p("email", "formato de email invalido");
}
function re(t) {
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    list(e = {}) {
      return t.findAll(e);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(e, n = {}) {
      const s = typeof e == "string" ? e.trim() : "";
      return s.length === 0 ? t.findAll(n) : t.search(s, n);
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | null}
     */
    getById(e) {
      if (!Number.isInteger(e) || e <= 0)
        throw new p("id", `id invalido: ${e}`);
      return t.findById(e) ?? null;
    },
    /**
     * Version "throw on not found" usada internamente por sales.service.create
     * cuando necesita snapshot garantizado (el POS ya seleccionó un cliente).
     *
     * @param {number} id
     * @returns {CustomerRow}
     * @throws {CustomerNotFoundError}
     */
    requireById(e) {
      const n = t.findById(e);
      if (!n) throw new g(e);
      return n;
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {CustomerRow}
     */
    create(e) {
      var a, i, c;
      b(e.name), w(e.email);
      const n = C(e.nit), s = t.insert({
        nit: n,
        name: e.name.trim(),
        email: ((a = e.email) == null ? void 0 : a.trim()) || null,
        phone: ((i = e.phone) == null ? void 0 : i.trim()) || null,
        address: ((c = e.address) == null ? void 0 : c.trim()) || null
      }), o = typeof s == "bigint" ? Number(s) : s, r = t.findById(o);
      if (!r) throw new Error("Cliente recien insertado no encontrado (race imposible)");
      return r;
    },
    /**
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {CustomerRow}
     */
    update(e, n) {
      var a, i, c;
      if (!Number.isInteger(e) || e <= 0)
        throw new p("id", `id invalido: ${e}`);
      if (e === 1)
        throw new p("id", 'No se puede editar "Consumidor Final"');
      n.name !== void 0 && b(n.name), n.email !== void 0 && w(n.email);
      const s = {};
      if (n.nit !== void 0 && (s.nit = C(n.nit)), n.name !== void 0 && (s.name = n.name.trim()), n.email !== void 0 && (s.email = ((a = n.email) == null ? void 0 : a.trim()) || null), n.phone !== void 0 && (s.phone = ((i = n.phone) == null ? void 0 : i.trim()) || null), n.address !== void 0 && (s.address = ((c = n.address) == null ? void 0 : c.trim()) || null), n.active !== void 0 && (s.active = n.active ? 1 : 0), t.update(e, s) === 0) throw new g(e);
      const r = t.findById(e);
      if (!r) throw new g(e);
      return r;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(e, n) {
      if (!Number.isInteger(e) || e <= 0)
        throw new p("id", `id invalido: ${e}`);
      if (e === 1)
        throw new p("id", 'No se puede desactivar "Consumidor Final"');
      if (t.setActive(e, n) === 0) throw new g(e);
      return !0;
    }
  };
}
function ae(t) {
  u.handle("customers:list", d((e, n) => t.list(n))), u.handle("customers:search", d((e, n, s) => t.search(n, s))), u.handle("customers:get-by-id", d((e, n) => t.getById(n))), u.handle("customers:create", d((e, n) => t.create(n))), u.handle("customers:update", d((e, n, s) => t.update(n, s))), u.handle("customers:set-active", d((e, n, s) => t.setActive(n, s)));
}
const U = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot
`;
function oe(t) {
  const e = {
    insertSale: t.prepare(
      `INSERT INTO sales (
         total, subtotal, tax_rate_applied, tax_amount, currency_code,
         customer_id, customer_name_snapshot, customer_nit_snapshot
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertItem: t.prepare(
      "INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)"
    ),
    updateStock: t.prepare("UPDATE products SET stock = stock - ? WHERE id = ?"),
    selectById: t.prepare(`SELECT ${U} FROM sales WHERE id = ?`),
    /**
     * LEFT JOIN a products para mostrar nombre/codigo actuales. NO es
     * snapshot; para el snapshot real a nivel linea, agregar columnas
     * product_code_snapshot/product_name_snapshot a sale_items en migracion
     * futura. Hoy vive como deuda conocida.
     */
    selectItems: t.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
     ORDER BY si.id ASC`
    ),
    selectPage: t.prepare(
      `SELECT ${U}
         FROM sales
     ORDER BY id DESC
        LIMIT ? OFFSET ?`
    ),
    countAll: t.prepare("SELECT COUNT(*) AS total FROM sales")
  };
  return {
    insertSale: t.transaction((s) => {
      const r = e.insertSale.run(
        s.total,
        s.subtotal,
        s.taxRate,
        s.taxAmount,
        s.currencyCode,
        s.customerId,
        s.customerNameSnapshot,
        s.customerNitSnapshot
      ).lastInsertRowid;
      for (const a of s.items)
        e.insertItem.run(r, a.id, a.qty, a.price), e.updateStock.run(a.qty, a.id);
      return r;
    }),
    /**
     * @param {number} id
     * @returns {SaleRow | undefined}
     */
    findSaleById(s) {
      return e.selectById.get(s);
    },
    /**
     * @param {number} saleId
     * @returns {SaleItemRow[]}
     */
    findSaleItems(s) {
      return e.selectItems.all(s);
    },
    /**
     * @param {PageOptions} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit: s, offset: o }) {
      return e.selectPage.all(s, o);
    },
    /** @returns {number} */
    countAll() {
      return /** @type {{ total: number }} */ e.countAll.get().total;
    }
  };
}
const ie = 200, ce = 1;
function le(t) {
  if (!t || !Array.isArray(t.items) || t.items.length === 0)
    throw Object.assign(new Error("La venta debe contener al menos un item"), {
      code: "SALE_EMPTY"
    });
  for (const e of t.items) {
    if (!Number.isInteger(e.id) || e.id <= 0)
      throw Object.assign(new Error(`product_id invalido: ${e.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    if (!Number.isInteger(e.qty) || e.qty <= 0)
      throw Object.assign(new Error(`qty invalida para producto ${e.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    if (!Number.isFinite(e.price) || e.price < 0)
      throw Object.assign(new Error(`price invalido para producto ${e.id}`), {
        code: "SALE_INVALID_ITEM"
      });
  }
  if (t.customerId !== void 0 && (!Number.isInteger(t.customerId) || t.customerId <= 0))
    throw Object.assign(new Error(`customer_id invalido: ${t.customerId}`), {
      code: "SALE_INVALID_CUSTOMER"
    });
}
function ue(t, e, n, s) {
  const o = Math.pow(10, s), r = (l) => Math.round(l * o) / o;
  if (n) {
    const l = r(t), E = r(l - l / (1 + e));
    return { subtotal: r(l - E), taxAmount: E, total: l };
  }
  const a = r(t), i = r(a * e), c = r(a + i);
  return { subtotal: a, taxAmount: i, total: c };
}
function de(t, e, n) {
  return {
    /**
     * @param {SaleInput} input
     * @returns {SaleCreatedResult}
     */
    create(s) {
      le(s);
      const o = (
        /** @type {number} */
        e.get("tax_rate")
      ), r = (
        /** @type {boolean} */
        e.get("tax_included_in_price")
      ), a = (
        /** @type {string} */
        e.get("currency_code")
      ), i = (
        /** @type {number} */
        e.get("decimal_places")
      ), c = s.customerId ?? ce, l = n.requireById(c), E = s.items.reduce((B, y) => B + y.price * y.qty, 0), { subtotal: N, taxAmount: A, total: h } = ue(
        E,
        o,
        r,
        i
      ), I = t.insertSale({
        items: s.items,
        subtotal: N,
        taxRate: o,
        taxAmount: A,
        total: h,
        currencyCode: a,
        customerId: c,
        customerNameSnapshot: l.name,
        customerNitSnapshot: l.nit
      });
      return {
        saleId: typeof I == "bigint" ? Number(I) : I,
        subtotal: N,
        taxRate: o,
        taxAmount: A,
        total: h,
        currencyCode: a,
        customerId: c,
        customerName: l.name,
        customerNit: l.nit
      };
    },
    /**
     * @param {number} id
     * @returns {SaleWithItems | null}
     */
    getById(s) {
      if (!Number.isInteger(s) || s <= 0)
        throw Object.assign(new Error(`sale id invalido: ${s}`), { code: "SALE_INVALID_ID" });
      const o = t.findSaleById(s);
      if (!o) return null;
      const r = t.findSaleItems(s);
      return { ...o, items: r };
    },
    /**
     * @param {{ page?: number, pageSize?: number }} [opts]
     * @returns {SaleListResult}
     */
    list(s = {}) {
      const o = Number.isInteger(s.page) && /** @type {number} */
      s.page > 0 ? (
        /** @type {number} */
        s.page
      ) : 1, r = Number.isInteger(s.pageSize) && /** @type {number} */
      s.pageSize > 0 ? (
        /** @type {number} */
        s.pageSize
      ) : 50, a = Math.min(r, ie), i = (o - 1) * a;
      return {
        data: t.findPage({ limit: a, offset: i }),
        total: t.countAll(),
        page: o,
        pageSize: a
      };
    }
  };
}
function me(t) {
  u.handle("sales:create", d((e, n) => t.create(n))), u.handle("sales:get-by-id", d((e, n) => t.getById(n))), u.handle("sales:list", d((e, n) => t.list(n)));
}
const Ee = /* @__PURE__ */ Object.assign({
  "../database/migrations/001_init.sql": X,
  "../database/migrations/002_settings.sql": P,
  "../database/migrations/003_sales_tax_snapshot.sql": k,
  "../database/migrations/004_customers.sql": $
});
function pe() {
  return Object.entries(Ee).map(([t, e]) => ({
    name: t.split("/").pop(),
    sql: e
  }));
}
function Te() {
  const t = H(), e = G(t, pe());
  console.log("[migrator] applied:", e.applied, "skipped:", e.skipped);
  const n = W(t), s = Z(n);
  s.init();
  const o = J(t), r = ee(o), a = ne(t), i = re(a), c = oe(t), l = de(c, s, i);
  Q(s), te(r), ae(i), me(l);
}
let R = null;
function v() {
  R = new F({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: S(T.getAppPath(), "dist-electron", "preload.js"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), process.env.VITE_DEV_SERVER_URL ? R.loadURL(process.env.VITE_DEV_SERVER_URL) : R.loadFile(S(T.getAppPath(), "dist", "index.html"));
}
T.whenReady().then(() => {
  Te(), v();
});
T.on("window-all-closed", () => {
  process.platform !== "darwin" && T.quit();
});
T.on("activate", () => {
  F.getAllWindows().length === 0 && v();
});
