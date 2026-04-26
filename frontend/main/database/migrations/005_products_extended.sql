-- 005_products_extended.sql
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
