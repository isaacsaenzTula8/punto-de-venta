-- Base para ventas en linea (ecommerce) sin romper POS actual

CREATE TABLE IF NOT EXISTS online_customers (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(180),
  phone VARCHAR(40),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_online_customers_email_unique
ON online_customers (LOWER(email))
WHERE email IS NOT NULL AND LENGTH(TRIM(email)) > 0;

CREATE INDEX IF NOT EXISTS idx_online_customers_phone ON online_customers(phone);
CREATE INDEX IF NOT EXISTS idx_online_customers_active ON online_customers(active);

CREATE TABLE IF NOT EXISTS online_orders (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  customer_id INTEGER REFERENCES online_customers(id) ON DELETE SET NULL,

  sales_channel VARCHAR(20) NOT NULL DEFAULT 'web'
    CHECK (sales_channel IN ('web', 'app', 'social', 'phone')),
  fulfillment_type VARCHAR(20) NOT NULL DEFAULT 'pickup'
    CHECK (fulfillment_type IN ('pickup', 'delivery')),

  order_status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (order_status IN (
      'draft',
      'pending_payment',
      'paid',
      'preparing',
      'ready_for_pickup',
      'out_for_delivery',
      'completed',
      'cancelled',
      'refunded'
    )),
  payment_method VARCHAR(30) NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'card', 'transfer', 'mixed', 'credit', 'cash_on_delivery', 'online_gateway')),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  payment_reference TEXT,

  currency_code VARCHAR(8) NOT NULL DEFAULT 'GTQ',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  discount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  shipping_fee DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (shipping_fee >= 0),
  total DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),

  customer_name_snapshot VARCHAR(180),
  customer_email_snapshot VARCHAR(180),
  customer_phone_snapshot VARCHAR(40),
  delivery_address TEXT,
  delivery_reference TEXT,
  delivery_notes TEXT,
  internal_notes TEXT,

  linked_sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,

  placed_at TIMESTAMP,
  paid_at TIMESTAMP,
  completed_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_online_orders_branch_id ON online_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_customer_id ON online_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_online_orders_status ON online_orders(order_status);
CREATE INDEX IF NOT EXISTS idx_online_orders_payment_status ON online_orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_online_orders_created_at ON online_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_online_orders_branch_status ON online_orders(branch_id, order_status);
CREATE INDEX IF NOT EXISTS idx_online_orders_branch_created_at ON online_orders(branch_id, created_at);

CREATE TABLE IF NOT EXISTS online_order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,

  product_name VARCHAR(200) NOT NULL,
  product_sku VARCHAR(80) NOT NULL,
  product_image_url TEXT,

  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  subtotal DECIMAL(10,2) NOT NULL CHECK (subtotal >= 0),

  item_status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (item_status IN ('active', 'cancelled', 'refunded')),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_online_order_items_order_id ON online_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_online_order_items_product_id ON online_order_items(product_id);

CREATE TABLE IF NOT EXISTS online_order_status_history (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL
    CHECK (to_status IN (
      'draft',
      'pending_payment',
      'paid',
      'preparing',
      'ready_for_pickup',
      'out_for_delivery',
      'completed',
      'cancelled',
      'refunded'
    )),
  changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  change_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_online_order_status_history_order_id
ON online_order_status_history(order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $fn$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_online_customers_updated_at'
  ) THEN
    CREATE TRIGGER update_online_customers_updated_at
    BEFORE UPDATE ON online_customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_online_orders_updated_at'
  ) THEN
    CREATE TRIGGER update_online_orders_updated_at
    BEFORE UPDATE ON online_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
