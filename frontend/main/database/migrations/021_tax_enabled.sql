-- 021_tax_enabled.sql
-- Agrega el interruptor global de IVA.
-- Por defecto desactivado: los precios ya incluyen IVA y no se desglosa en ningun lado.
-- INSERT OR IGNORE: no pisa el valor si el usuario ya lo cambio.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('tax_enabled', '0', 'boolean', 'tax', 'Habilitar calculo y visualizacion de IVA en toda la app');
