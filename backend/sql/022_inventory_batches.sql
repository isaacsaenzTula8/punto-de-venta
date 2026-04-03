-- Inventario por lote para productos con caducidad/traceabilidad
CREATE TABLE IF NOT EXISTS product_batches (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  batch_code VARCHAR(80) NOT NULL,
  expiration_date DATE,
  quantity_initial INTEGER NOT NULL CHECK (quantity_initial > 0),
  quantity_current INTEGER NOT NULL CHECK (quantity_current >= 0),
  unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_batches_unique_code_active
ON product_batches(product_id, LOWER(batch_code))
WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_product_batches_product_branch
ON product_batches(product_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_product_batches_expiration_date
ON product_batches(expiration_date);

CREATE TABLE IF NOT EXISTS product_batch_movements (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES product_batches(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('in', 'out', 'adjust', 'sale', 'refund')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reason VARCHAR(160),
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  sale_item_id INTEGER REFERENCES sale_items(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_batch_movements_batch
ON product_batch_movements(batch_id);

CREATE INDEX IF NOT EXISTS idx_product_batch_movements_product_branch
ON product_batch_movements(product_id, branch_id);

CREATE TABLE IF NOT EXISTS sale_item_batch_allocations (
  id SERIAL PRIMARY KEY,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
  quantity_units INTEGER NOT NULL CHECK (quantity_units > 0),
  returned_units INTEGER NOT NULL DEFAULT 0 CHECK (returned_units >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_sale_item
ON sale_item_batch_allocations(sale_item_id);

CREATE INDEX IF NOT EXISTS idx_sale_item_batch_allocations_batch
ON sale_item_batch_allocations(batch_id);
