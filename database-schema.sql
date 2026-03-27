-- =====================================================
-- SISTEMA POS - ESQUEMA DE BASE DE DATOS POSTGRESQL
-- =====================================================
-- Autor: Sistema POS
-- Fecha: 2026-03-25
-- Descripción: Esquema completo para sistema de punto de venta
-- =====================================================

-- Eliminar tablas existentes (¡CUIDADO EN PRODUCCIÓN!)
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- TABLA: categories
-- Descripción: Categorías de productos
-- =====================================================
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsquedas rápidas por nombre
CREATE INDEX idx_categories_name ON categories(name);
CREATE INDEX idx_categories_active ON categories(active);

COMMENT ON TABLE categories IS 'Categorías de productos del sistema POS';
COMMENT ON COLUMN categories.active IS 'Indica si la categoría está activa';


-- =====================================================
-- TABLA: products
-- Descripción: Catálogo de productos
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

-- Índices para optimización
CREATE INDEX idx_products_sku ON products(sku);
CREATE UNIQUE INDEX idx_products_barcode_unique ON products(barcode)
WHERE barcode IS NOT NULL AND length(trim(barcode)) > 0;
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(active);
CREATE INDEX idx_products_stock ON products(stock);

COMMENT ON TABLE products IS 'Catálogo de productos disponibles para la venta';
COMMENT ON COLUMN products.sku IS 'Código único del producto (Stock Keeping Unit)';
COMMENT ON COLUMN products.barcode IS 'Código de barras (opcional) para búsqueda con lector';
COMMENT ON COLUMN products.cost IS 'Costo de adquisición del producto';
COMMENT ON COLUMN products.min_stock IS 'Stock mínimo para alertas';
COMMENT ON COLUMN products.active IS 'Indica si el producto está disponible para venta';


-- =====================================================
-- TABLA: users
-- Descripción: Usuarios del sistema (cajeros, administradores)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'cashier', 'manager')),
    active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(active);

COMMENT ON TABLE users IS 'Usuarios del sistema POS (cajeros y administradores)';
COMMENT ON COLUMN users.role IS 'Rol del usuario: admin, cashier, manager';


-- =====================================================
-- TABLA: sales
-- Descripción: Registro de ventas realizadas
-- =====================================================
CREATE TABLE sales (
    id SERIAL PRIMARY KEY,
    sale_number VARCHAR(50) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_id INTEGER,
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

-- Índices para optimización de consultas
CREATE INDEX idx_sales_number ON sales(sale_number);
CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_payment_method ON sales(payment_method);
CREATE INDEX idx_sales_payment_status ON sales(payment_status);
CREATE INDEX idx_sales_date_status ON sales(sale_date, payment_status);

COMMENT ON TABLE sales IS 'Registro de todas las ventas realizadas en el sistema';
COMMENT ON COLUMN sales.sale_number IS 'Número único de venta (ej: SALE-000001)';
COMMENT ON COLUMN sales.tax IS 'Impuestos aplicados (IVA u otros)';
COMMENT ON COLUMN sales.discount IS 'Descuentos aplicados a la venta';
COMMENT ON COLUMN sales.payment_method IS 'Método de pago: cash, card, transfer, mixed, credit';
COMMENT ON COLUMN sales.payment_status IS 'Estado del pago: pending, completed, cancelled, refunded';


-- =====================================================
-- TABLA: sale_items
-- Descripción: Detalle de productos en cada venta
-- =====================================================
CREATE TABLE sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    product_sku VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    cost_historico DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (cost_historico >= 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);

COMMENT ON TABLE sale_items IS 'Detalle de productos incluidos en cada venta';
COMMENT ON COLUMN sale_items.product_name IS 'Nombre del producto al momento de la venta (histórico)';
COMMENT ON COLUMN sale_items.product_sku IS 'SKU del producto al momento de la venta (histórico)';
COMMENT ON COLUMN sale_items.cost_historico IS 'Costo unitario capturado al momento de la venta';


-- =====================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================

-- Función para actualizar el campo updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Función para reducir stock automáticamente al confirmar una venta
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
$$ language 'plpgsql';

-- Trigger para reducir stock
CREATE TRIGGER reduce_stock_on_sale AFTER INSERT OR UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION reduce_product_stock();


-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista: Productos con stock bajo
CREATE OR REPLACE VIEW products_low_stock AS
SELECT 
    p.id,
    p.sku,
    p.name,
    c.name as category_name,
    p.stock,
    p.min_stock,
    p.price
FROM products p
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.stock <= p.min_stock
AND p.active = true
ORDER BY p.stock ASC;

COMMENT ON VIEW products_low_stock IS 'Productos con stock igual o menor al mínimo establecido';


-- Vista: Resumen de ventas diarias
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT 
    DATE(sale_date) as date,
    COUNT(*) as total_transactions,
    SUM(total) as total_sales,
    AVG(total) as average_ticket,
    SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_sales,
    SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_sales,
    SUM(CASE WHEN payment_method = 'transfer' THEN total ELSE 0 END) as transfer_sales,
    SUM(CASE WHEN payment_method = 'credit' THEN total ELSE 0 END) as credit_sales
FROM sales
WHERE payment_status = 'completed'
GROUP BY DATE(sale_date)
ORDER BY date DESC;

COMMENT ON VIEW daily_sales_summary IS 'Resumen de ventas agrupado por día';


-- Vista: Top productos más vendidos
CREATE OR REPLACE VIEW top_selling_products AS
SELECT 
    p.id,
    p.sku,
    p.name,
    c.name as category_name,
    SUM(si.quantity) as total_quantity_sold,
    SUM(si.subtotal) as total_revenue,
    COUNT(DISTINCT si.sale_id) as times_sold
FROM sale_items si
JOIN products p ON si.product_id = p.id
LEFT JOIN categories c ON p.category_id = c.id
JOIN sales s ON si.sale_id = s.id
WHERE s.payment_status = 'completed'
GROUP BY p.id, p.sku, p.name, c.name
ORDER BY total_revenue DESC;

COMMENT ON VIEW top_selling_products IS 'Productos más vendidos ordenados por ingresos totales';


-- =====================================================
-- DATOS INICIALES (SEEDS)
-- =====================================================

-- Insertar categorías
INSERT INTO categories (name, description) VALUES
('Cafetería', 'Bebidas de café y relacionadas'),
('Bebidas', 'Bebidas frías y calientes'),
('Alimentos', 'Comidas y platillos'),
('Snacks', 'Bocadillos y aperitivos'),
('Postres', 'Postres y dulces'),
('Panadería', 'Productos de panadería'),
('Otros', 'Otros productos');


-- Insertar usuario administrador por defecto
-- Contraseña: admin123 (deberías cambiarla en producción y usar hash real)
INSERT INTO users (username, email, password_hash, full_name, role) VALUES
('admin', 'admin@pos.com', '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Usuario Admin', 'admin'),
('cajero1', 'cajero1@pos.com', '$2a$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Cajero Principal', 'cashier');


-- Insertar productos de ejemplo
INSERT INTO products (sku, name, description, price, cost, category_id, stock, min_stock) VALUES
('CAF-001', 'Café Americano', 'Café americano tradicional', 35.00, 15.00, 1, 100, 20),
('CAF-002', 'Cappuccino', 'Cappuccino con espuma de leche', 45.00, 20.00, 1, 100, 20),
('CAF-003', 'Latte', 'Café latte con arte', 48.00, 22.00, 1, 100, 20),
('PAN-001', 'Croissant', 'Croissant de mantequilla', 32.00, 12.00, 6, 50, 15),
('PAN-002', 'Donut Chocolate', 'Donut con cobertura de chocolate', 28.00, 10.00, 6, 60, 15),
('ALI-001', 'Sandwich Club', 'Sandwich club triple', 85.00, 40.00, 3, 30, 10),
('ALI-002', 'Ensalada César', 'Ensalada césar con pollo', 95.00, 45.00, 3, 25, 10),
('SNK-001', 'Papas Fritas', 'Papas fritas crujientes', 38.00, 15.00, 4, 80, 20),
('SNK-002', 'Nachos', 'Nachos con queso y jalapeños', 65.00, 30.00, 4, 40, 15),
('BEB-001', 'Coca Cola', 'Coca Cola 355ml', 25.00, 12.00, 2, 200, 30),
('BEB-002', 'Agua Mineral', 'Agua mineral 500ml', 20.00, 8.00, 2, 150, 30),
('BEB-003', 'Jugo Natural', 'Jugo natural de naranja', 42.00, 20.00, 2, 50, 15),
('POS-001', 'Cheesecake', 'Cheesecake de fresa', 58.00, 28.00, 5, 20, 8),
('POS-002', 'Brownie', 'Brownie de chocolate', 45.00, 20.00, 5, 35, 10),
('PAN-003', 'Muffin Arándanos', 'Muffin de arándanos', 35.00, 15.00, 6, 45, 15),
('PAN-004', 'Bagel', 'Bagel con queso crema', 38.00, 16.00, 6, 40, 15),
('ALI-003', 'Wrap Pollo', 'Wrap de pollo y vegetales', 78.00, 38.00, 3, 28, 10),
('BEB-004', 'Smoothie Frutas', 'Smoothie de frutas mixtas', 55.00, 28.00, 2, 30, 10);


-- =====================================================
-- CONSULTAS ÚTILES DE EJEMPLO
-- =====================================================

-- Ver productos con stock bajo
-- SELECT * FROM products_low_stock;

-- Ver resumen de ventas del día actual
-- SELECT * FROM daily_sales_summary WHERE date = CURRENT_DATE;

-- Ver top 10 productos más vendidos
-- SELECT * FROM top_selling_products LIMIT 10;

-- Ver ventas de hoy
-- SELECT * FROM sales WHERE DATE(sale_date) = CURRENT_DATE ORDER BY sale_date DESC;

-- Ver productos por categoría
-- SELECT p.*, c.name as category 
-- FROM products p 
-- LEFT JOIN categories c ON p.category_id = c.id 
-- WHERE c.name = 'Cafetería';

-- Reporte de ventas por método de pago (últimos 30 días)
-- SELECT 
--     payment_method,
--     COUNT(*) as transactions,
--     SUM(total) as total_amount
-- FROM sales
-- WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
-- AND payment_status = 'completed'
-- GROUP BY payment_method;

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================

-- Para ejecutar este script en PostgreSQL:
-- psql -U tu_usuario -d tu_base_datos -f database-schema.sql
