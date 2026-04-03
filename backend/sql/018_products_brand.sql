ALTER TABLE products
ADD COLUMN IF NOT EXISTS brand VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_products_brand
ON products(brand);
