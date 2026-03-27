-- Configuracion de politica de cobro por tienda
CREATE TABLE IF NOT EXISTS store_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  cashier_can_charge BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO store_settings (id, cashier_can_charge)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS charged_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sales
ADD COLUMN IF NOT EXISTS charged_at TIMESTAMP;

UPDATE sales
SET charged_by_user_id = user_id,
    charged_at = COALESCE(charged_at, sale_date)
WHERE payment_status = 'completed'
  AND charged_by_user_id IS NULL;
