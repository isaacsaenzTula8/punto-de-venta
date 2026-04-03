ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 20;

UPDATE business_settings
SET low_stock_threshold = 20
WHERE low_stock_threshold IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_settings_low_stock_threshold_check'
  ) THEN
    ALTER TABLE business_settings
    ADD CONSTRAINT business_settings_low_stock_threshold_check
    CHECK (low_stock_threshold >= 0);
  END IF;
END $$;
