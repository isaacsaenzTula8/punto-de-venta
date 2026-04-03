ALTER TABLE products
ADD COLUMN IF NOT EXISTS location_code VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_products_location_code ON products(location_code);
