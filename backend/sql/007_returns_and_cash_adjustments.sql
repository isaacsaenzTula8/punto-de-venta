-- Devoluciones parciales/completas + ajuste de caja

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0);

ALTER TABLE cash_sessions
ADD COLUMN IF NOT EXISTS total_cash_sales DECIMAL(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE cash_sessions
ADD COLUMN IF NOT EXISTS total_cash_refunds DECIMAL(10, 2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sale_returns (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cash_session_id INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
  return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('partial', 'full')),
  refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('cash', 'card', 'transfer', 'mixed', 'credit')),
  total_refund DECIMAL(10, 2) NOT NULL CHECK (total_refund >= 0),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_id ON sale_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_created_at ON sale_returns(created_at);

CREATE TABLE IF NOT EXISTS sale_return_items (
  id SERIAL PRIMARY KEY,
  sale_return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_return_items_return_id ON sale_return_items(sale_return_id);
CREATE INDEX IF NOT EXISTS idx_sale_return_items_sale_item_id ON sale_return_items(sale_item_id);
