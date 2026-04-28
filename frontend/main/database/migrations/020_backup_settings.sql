-- Configuración del backup automático
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('backup_interval_hours', '720',  'number', 'backup', 'Intervalo entre backups automáticos en horas (24=diario, 168=semanal, 720=mensual)'),
  ('backup_max_copies',     '10',   'number', 'backup', 'Número máximo de copias automáticas a conservar');
