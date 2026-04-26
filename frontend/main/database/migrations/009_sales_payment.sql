-- 009_sales_payment.sql
-- Agrega método de pago y tipo de cliente a la tabla de ventas.

ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'credit', 'card', 'transfer'));

ALTER TABLE sales ADD COLUMN client_type TEXT NOT NULL DEFAULT 'cf'
  CHECK (client_type IN ('cf', 'registered', 'company'));
