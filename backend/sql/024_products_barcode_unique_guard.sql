-- Refuerzo: asegurar unicidad de codigo de barras en products
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
ON products(barcode)
WHERE barcode IS NOT NULL AND LENGTH(TRIM(barcode)) > 0;
