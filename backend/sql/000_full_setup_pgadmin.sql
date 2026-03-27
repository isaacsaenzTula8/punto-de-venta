-- =====================================================
-- POS SYSTEM - FULL SETUP (PGADMIN)
-- Crea todo desde cero para el backend actual.
-- ADVERTENCIA: elimina objetos existentes en esta base.
-- =====================================================

BEGIN;

-- Limpieza de vistas
DROP VIEW IF EXISTS top_selling_products CASCADE;
DROP VIEW IF EXISTS daily_sales_summary CASCADE;
DROP VIEW IF EXISTS products_low_stock CASCADE;

-- Limpieza de triggers/funciones
DROP TRIGGER IF EXISTS reduce_stock_on_sale ON sales;
DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
DROP FUNCTION IF EXISTS reduce_product_stock();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Limpieza de tablas (orden por dependencias)
DROP TABLE IF EXISTS auth_sessions CASCADE;
DROP TABLE IF EXISTS store_settings CASCADE;
DROP TABLE IF EXISTS sale_return_items CASCADE;
DROP TABLE IF EXISTS sale_returns CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS cash_sessions CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- TABLA: categories
-- =====================================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_categories_name ON categories(name);
CREATE INDEX idx_categories_active ON categories(active);

-- =====================================================
-- TABLA: users (incluye seguridad + superadmin)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'cashier'
      CHECK (role IN ('superadmin', 'admin', 'cashier', 'manager')),
    active BOOLEAN DEFAULT true,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMP,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(active);

-- =====================================================
-- TABLA: products
-- =====================================================
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    barcode VARCHAR(80),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    cost DECIMAL(10, 2) CHECK (cost >= 0),
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    min_stock INTEGER DEFAULT 10,
    image_url TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE UNIQUE INDEX idx_products_barcode_unique ON products(barcode)
WHERE barcode IS NOT NULL AND length(trim(barcode)) > 0;
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_stock ON products(stock);

-- =====================================================
-- TABLA: cash_sessions
-- =====================================================
CREATE TABLE cash_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    opening_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (opening_amount >= 0),
    closing_amount DECIMAL(10, 2) CHECK (closing_amount >= 0),
    opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP,
    total_cash_sales DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total_cash_refunds DECIMAL(10, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cash_sessions_user_status ON cash_sessions(user_id, status);
CREATE INDEX idx_cash_sessions_opened_at ON cash_sessions(opened_at);

-- =====================================================
-- TABLA: sales
-- =====================================================
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    sale_number VARCHAR(50) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    charged_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    charged_at TIMESTAMP,
    customer_id INTEGER,
    cash_session_id INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    tax DECIMAL(10, 2) DEFAULT 0 CHECK (tax >= 0),
    discount DECIMAL(10, 2) DEFAULT 0 CHECK (discount >= 0),
    total DECIMAL(10, 2) NOT NULL CHECK (total >= 0),
    payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'mixed', 'credit')),
    payment_status VARCHAR(20) DEFAULT 'completed' CHECK (payment_status IN ('pending', 'completed', 'cancelled', 'refunded')),
    notes TEXT,
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sales_number ON sales(sale_number);
CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_charged_by ON sales(charged_by_user_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_cash_session ON sales(cash_session_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_payment_method ON sales(payment_method);
CREATE INDEX idx_sales_payment_status ON sales(payment_status);
CREATE INDEX idx_sales_date_status ON sales(sale_date, payment_status);

-- =====================================================
-- TABLA: sale_items
-- =====================================================
CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    product_sku VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    returned_quantity INTEGER NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),
    cost_historico DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (cost_historico >= 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

-- =====================================================
-- TABLA: sale_returns
-- =====================================================
CREATE TABLE sale_returns (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    cash_session_id INTEGER REFERENCES cash_sessions(id) ON DELETE SET NULL,
    return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('partial', 'full')),
    refund_method VARCHAR(20) NOT NULL CHECK (refund_method IN ('cash', 'card', 'transfer', 'mixed', 'credit')),
    total_refund DECIMAL(10, 2) NOT NULL CHECK (total_refund >= 0),
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sale_returns_sale_id ON sale_returns(sale_id);
CREATE INDEX idx_sale_returns_created_at ON sale_returns(created_at);

-- =====================================================
-- TABLA: sale_return_items
-- =====================================================
CREATE TABLE sale_return_items (
    id SERIAL PRIMARY KEY,
    sale_return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
    sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX idx_sale_return_items_return_id ON sale_return_items(sale_return_id);
CREATE INDEX idx_sale_return_items_sale_item_id ON sale_return_items(sale_item_id);

-- =====================================================
-- TABLA: auth_sessions
-- =====================================================
CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_active ON auth_sessions(user_id, revoked_at, expires_at);

-- =====================================================
-- TABLA: store_settings
-- =====================================================
CREATE TABLE store_settings (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    cashier_can_charge BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION reduce_product_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_status = 'completed' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'completed') THEN
        UPDATE products p
        SET stock = stock - si.quantity
        FROM sale_items si
        WHERE si.sale_id = NEW.id
          AND si.product_id = p.id
          AND p.id IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reduce_stock_on_sale AFTER INSERT OR UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION reduce_product_stock();

-- =====================================================
-- VISTAS
-- =====================================================
CREATE OR REPLACE VIEW products_low_stock AS
SELECT
    p.id,
    p.sku,
    p.name,
    c.name AS category_name,
    p.stock,
    p.min_stock,
    p.price
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.stock <= p.min_stock
  AND p.active = true
ORDER BY p.stock ASC;

CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT
    DATE(sale_date) AS date,
    COUNT(*) AS total_transactions,
    SUM(total) AS total_sales,
    AVG(total) AS average_ticket,
    SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) AS cash_sales,
    SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) AS card_sales,
    SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END) AS transfer_sales,
    SUM(CASE WHEN payment_method = 'credit' THEN total ELSE 0 END) AS credit_sales
FROM sales
WHERE payment_status = 'completed'
GROUP BY DATE(sale_date)
ORDER BY date DESC;

CREATE OR REPLACE VIEW top_selling_products AS
SELECT
    p.id,
    p.sku,
    p.name,
    c.name AS category_name,
    SUM(si.quantity) AS total_quantity_sold,
    SUM(si.subtotal) AS total_revenue,
    COUNT(DISTINCT si.sale_id) AS times_sold
FROM sale_items si
JOIN products p ON si.product_id = p.id
LEFT JOIN categories c ON p.category_id = c.id
JOIN sales s ON si.sale_id = s.id
WHERE s.payment_status = 'completed'
GROUP BY p.id, p.sku, p.name, c.name
ORDER BY total_revenue DESC;

-- =====================================================
-- SEEDS MINIMOS
-- =====================================================
INSERT INTO categories (name, description) VALUES
('Cafeteria', 'Bebidas de cafe y relacionadas'),
('Bebidas', 'Bebidas frias y calientes'),
('Alimentos', 'Comidas y platillos'),
('Snacks', 'Bocadillos y aperitivos'),
('Postres', 'Postres y dulces'),
('Panaderia', 'Productos de panaderia'),
('Otros', 'Otros productos');

INSERT INTO products (sku, name, description, price, cost, category_id, stock, min_stock) VALUES
('CAF-001', 'Cafe Americano', 'Cafe americano tradicional', 35.00, 15.00, 1, 100, 20),
('CAF-002', 'Cappuccino', 'Cappuccino con espuma de leche', 45.00, 20.00, 1, 100, 20),
('CAF-003', 'Latte', 'Cafe latte con arte', 48.00, 22.00, 1, 100, 20),
('PAN-001', 'Croissant', 'Croissant de mantequilla', 32.00, 12.00, 6, 50, 15),
('PAN-002', 'Donut Chocolate', 'Donut con cobertura de chocolate', 28.00, 10.00, 6, 60, 15),
('ALI-001', 'Sandwich Club', 'Sandwich club triple', 85.00, 40.00, 3, 30, 10),
('ALI-002', 'Ensalada Cesar', 'Ensalada cesar con pollo', 95.00, 45.00, 3, 25, 10),
('SNK-001', 'Papas Fritas', 'Papas fritas crujientes', 38.00, 15.00, 4, 80, 20),
('SNK-002', 'Nachos', 'Nachos con queso y jalapenos', 65.00, 30.00, 4, 40, 15),
('BEB-001', 'Coca Cola', 'Coca Cola 355ml', 25.00, 12.00, 2, 200, 30),
('BEB-002', 'Agua Mineral', 'Agua mineral 500ml', 20.00, 8.00, 2, 150, 30),
('BEB-003', 'Jugo Natural', 'Jugo natural de naranja', 42.00, 20.00, 2, 50, 15),
('POS-001', 'Cheesecake', 'Cheesecake de fresa', 58.00, 28.00, 5, 20, 8),
('POS-002', 'Brownie', 'Brownie de chocolate', 45.00, 20.00, 5, 35, 10),
('PAN-003', 'Muffin Arandanos', 'Muffin de arandanos', 35.00, 15.00, 6, 45, 15),
('PAN-004', 'Bagel', 'Bagel con queso crema', 38.00, 16.00, 6, 40, 15),
('ALI-003', 'Wrap Pollo', 'Wrap de pollo y vegetales', 78.00, 38.00, 3, 28, 10),
('BEB-004', 'Smoothie Frutas', 'Smoothie de frutas mixtas', 55.00, 28.00, 2, 30, 10);

INSERT INTO store_settings (id, cashier_can_charge)
VALUES (1, true);

COMMIT;

-- Luego crea el superadmin con:
-- cd backend
-- npm run create:user -- root root@pos.com "Super Administrador" superadmin admin123
