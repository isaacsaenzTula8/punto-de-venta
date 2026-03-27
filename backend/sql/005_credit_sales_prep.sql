-- Prepara ventas a credito para futuro modulo de clientes.
-- Nota: customer_id se deja sin FK hasta crear tabla customers.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS customer_id INTEGER;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales
  ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'card', 'transfer', 'mixed', 'credit'));

CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
