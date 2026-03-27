-- Guarda costo historico por item de venta para calculo de utilidad real.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS cost_historico DECIMAL(10, 2) NOT NULL DEFAULT 0
  CHECK (cost_historico >= 0);
