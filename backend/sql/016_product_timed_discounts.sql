-- Descuentos por producto con vigencia (inicio / fin)
CREATE TABLE IF NOT EXISTS product_discounts (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  discount_type VARCHAR(10) NOT NULL CHECK (discount_type IN ('amount', 'percent')),
  discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value > 0),
  start_at TIMESTAMP NOT NULL,
  end_at TIMESTAMP NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (end_at > start_at),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

CREATE INDEX IF NOT EXISTS idx_product_discounts_product_branch
ON product_discounts(product_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_product_discounts_window
ON product_discounts(branch_id, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_product_discounts_active
ON product_discounts(active);
