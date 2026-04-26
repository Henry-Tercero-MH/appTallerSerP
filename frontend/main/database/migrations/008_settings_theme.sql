-- 008_settings_theme.sql
-- Agrega la clave app_theme para persistir la paleta de colores seleccionada.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('app_theme', 'crimson', 'string', 'app', 'Paleta de colores del sistema (slug de tema)');
