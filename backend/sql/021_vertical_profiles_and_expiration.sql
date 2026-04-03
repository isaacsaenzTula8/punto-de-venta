ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS store_vertical VARCHAR(30) NOT NULL DEFAULT 'general';

UPDATE business_settings
SET store_vertical = 'general'
WHERE store_vertical IS NULL OR LENGTH(TRIM(store_vertical)) = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_settings_store_vertical_check'
  ) THEN
    ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_store_vertical_check
    CHECK (store_vertical IN ('general', 'pharmacy', 'fashion', 'grocery', 'restaurant', 'hardware', 'wholesale'));
  END IF;
END $$;

ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE business_settings
SET enabled_modules = '[]'::jsonb
WHERE enabled_modules IS NULL;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS expiration_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS expiration_date DATE;

CREATE INDEX IF NOT EXISTS idx_products_expiration_date
ON products(expiration_date);

CREATE INDEX IF NOT EXISTS idx_products_expiration_required
ON products(expiration_required);
