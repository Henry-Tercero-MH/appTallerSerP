-- 022_printer_settings.sql
-- Configuracion de impresora para recibos.
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('receipt_printer',    '',              'string', 'ticket', 'Nombre exacto de la impresora para recibos (vacío = abre diálogo del sistema)'),
  ('receipt_paper_size', 'half-letter',   'string', 'ticket', 'Tamaño de papel: half-letter | letter | thermal-80');
