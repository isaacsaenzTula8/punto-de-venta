ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS presentation_id INTEGER REFERENCES product_presentations(id) ON DELETE SET NULL;

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS presentation_name VARCHAR(100);

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS units_factor INTEGER;

UPDATE sale_items
SET units_factor = 1
WHERE units_factor IS NULL;

ALTER TABLE sale_items
ALTER COLUMN units_factor SET DEFAULT 1;

ALTER TABLE sale_items
ALTER COLUMN units_factor SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sale_items_units_factor_check'
  ) THEN
    ALTER TABLE sale_items
    ADD CONSTRAINT sale_items_units_factor_check
    CHECK (units_factor > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sale_items_presentation_id
ON sale_items(presentation_id);
