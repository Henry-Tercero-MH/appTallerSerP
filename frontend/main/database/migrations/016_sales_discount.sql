-- Descuentos en ventas
ALTER TABLE sales ADD COLUMN discount_type   TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sales ADD COLUMN discount_value  REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
