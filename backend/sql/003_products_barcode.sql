-- Agrega soporte para codigo de barras opcional en products.
-- Unico solo cuando tiene valor (permite multiples NULL).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
  ON products(barcode)
  WHERE barcode IS NOT NULL AND length(trim(barcode)) > 0;
