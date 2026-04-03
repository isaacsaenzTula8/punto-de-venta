-- Presentaciones de producto (unidad, caja, paquete, etc.)
CREATE TABLE IF NOT EXISTS product_presentations (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name VARCHAR(100) NOT NULL,
  sku VARCHAR(120),
  barcode VARCHAR(120),
  units_factor INTEGER NOT NULL CHECK (units_factor > 0),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_presentations_product
ON product_presentations(product_id);

CREATE INDEX IF NOT EXISTS idx_product_presentations_branch
ON product_presentations(branch_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_presentations_product_name_active
ON product_presentations(product_id, LOWER(name))
WHERE active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_presentations_barcode_unique
ON product_presentations(barcode)
WHERE barcode IS NOT NULL AND LENGTH(TRIM(barcode)) > 0;

-- Base: asegurar presentacion Unidad para productos existentes
INSERT INTO product_presentations (
  product_id,
  branch_id,
  name,
  sku,
  barcode,
  units_factor,
  price,
  is_default,
  active
)
SELECT
  p.id,
  p.branch_id,
  'Unidad',
  p.sku,
  p.barcode,
  1,
  p.price,
  true,
  true
FROM products p
WHERE NOT EXISTS (
  SELECT 1
  FROM product_presentations pp
  WHERE pp.product_id = p.id
);
