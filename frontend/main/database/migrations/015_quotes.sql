CREATE TABLE IF NOT EXISTS quotes (
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
