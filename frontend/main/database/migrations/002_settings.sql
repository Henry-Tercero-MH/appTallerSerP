-- 002_settings.sql
-- Tabla de configuracion parametrica. `type` restringe los valores que el
-- service aceptara y como deserializa `value` (que siempre se almacena TEXT).
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
