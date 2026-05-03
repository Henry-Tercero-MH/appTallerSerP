-- 025_license_tokens.sql
-- Tabla de tokens de activación. Cada token puede usarse una sola vez.
-- Una vez quemado (used=1) no puede activar ninguna otra instalación.

CREATE TABLE IF NOT EXISTS license_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,
  used       INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Token inicial para Mangueras del Sur.
-- El valor real del token lo conoce solo el desarrollador.
-- Hash SHA-256 de: MDS-TE82-A9VU-PUFP
INSERT OR IGNORE INTO license_tokens (token_hash) VALUES
  ('e75940ac91d31e64764e2a50df1033ffb1dccf8e65c09d1845d5be44982b58af');

-- Setting de estado de activación
INSERT OR IGNORE INTO settings (key, value, type, category)
VALUES ('is_activated', 'false', 'boolean', 'system');
