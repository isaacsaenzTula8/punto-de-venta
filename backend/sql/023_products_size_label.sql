ALTER TABLE products
ADD COLUMN IF NOT EXISTS size_label VARCHAR(80);

CREATE INDEX IF NOT EXISTS idx_products_size_label
ON products(size_label);
