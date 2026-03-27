# 📊 Base de Datos PostgreSQL - Sistema POS

## 🗄️ Descripción

Este directorio contiene el esquema completo de la base de datos PostgreSQL para el Sistema POS.

## 📁 Archivos

- `database-schema.sql` - Esquema completo con tablas, índices, triggers, vistas y datos iniciales

## 🏗️ Estructura de Tablas

### 1. **categories**
Categorías de productos
- id (SERIAL PRIMARY KEY)
- name (VARCHAR - único)
- description (TEXT)
- active (BOOLEAN)

### 2. **products**
Catálogo de productos
- id (SERIAL PRIMARY KEY)
- sku (VARCHAR - único)
- barcode (VARCHAR - opcional, único cuando tiene valor)
- name (VARCHAR)
- description (TEXT)
- price (DECIMAL)
- cost (DECIMAL)
- category_id (FK → categories)
- stock (INTEGER)
- min_stock (INTEGER)
- image_url (TEXT)
- active (BOOLEAN)

### 3. **users**
Usuarios del sistema (cajeros, administradores)
- id (SERIAL PRIMARY KEY)
- username (VARCHAR - único)
- email (VARCHAR - único)
- password_hash (VARCHAR)
- full_name (VARCHAR)
- role (VARCHAR: admin, cashier, manager)
- active (BOOLEAN)
- last_login (TIMESTAMP)

### 4. **sales**
Registro de ventas
- id (SERIAL PRIMARY KEY)
- sale_number (VARCHAR - único)
- user_id (FK → users)
- customer_id (INTEGER - futuro módulo de clientes)
- subtotal (DECIMAL)
- tax (DECIMAL)
- discount (DECIMAL)
- total (DECIMAL)
- payment_method (VARCHAR: cash, card, transfer, mixed, credit)
- payment_status (VARCHAR: pending, completed, cancelled, refunded)
- notes (TEXT)
- sale_date (TIMESTAMP)

### 5. **sale_items**
Detalle de productos en cada venta
- id (SERIAL PRIMARY KEY)
- sale_id (FK → sales)
- product_id (FK → products)
- product_name (VARCHAR - histórico)
- product_sku (VARCHAR - histórico)
- quantity (INTEGER)
- cost_historico (DECIMAL - costo unitario al vender)
- unit_price (DECIMAL)
- subtotal (DECIMAL)

## 🚀 Instalación

### Opción 1: Crear base de datos nueva

```bash
# 1. Crear base de datos
createdb pos_system

# 2. Ejecutar el script
psql -U tu_usuario -d pos_system -f database-schema.sql
```

### Opción 2: Usar base de datos existente

```bash
psql -U tu_usuario -d tu_base_datos -f database-schema.sql
```

### Opción 3: Desde psql interactivo

```sql
-- Conectarse a PostgreSQL
psql -U tu_usuario

-- Crear base de datos
CREATE DATABASE pos_system;

-- Conectarse a la base de datos
\c pos_system

-- Ejecutar el script
\i database-schema.sql
```

## 🔧 Características Especiales

### Triggers Automáticos

1. **update_updated_at** - Actualiza automáticamente el campo `updated_at` en todas las tablas
2. **reduce_stock_on_sale** - Reduce el stock de productos automáticamente al completar una venta

### Vistas Útiles

1. **products_low_stock** - Productos con stock bajo
   ```sql
   SELECT * FROM products_low_stock;
   ```

2. **daily_sales_summary** - Resumen de ventas diarias
   ```sql
   SELECT * FROM daily_sales_summary WHERE date = CURRENT_DATE;
   ```

3. **top_selling_products** - Productos más vendidos
   ```sql
   SELECT * FROM top_selling_products LIMIT 10;
   ```

## 📝 Consultas Útiles

### Ver ventas de hoy
```sql
SELECT * FROM sales 
WHERE DATE(sale_date) = CURRENT_DATE 
ORDER BY sale_date DESC;
```

### Reporte de ventas por método de pago (últimos 30 días)
```sql
SELECT 
    payment_method,
    COUNT(*) as transactions,
    SUM(total) as total_amount
FROM sales
WHERE sale_date >= CURRENT_DATE - INTERVAL '30 days'
AND payment_status = 'completed'
GROUP BY payment_method;
```

### Ver productos por categoría
```sql
SELECT p.*, c.name as category 
FROM products p 
LEFT JOIN categories c ON p.category_id = c.id 
WHERE c.name = 'Cafetería';
```

### Ventas por hora del día (hoy)
```sql
SELECT 
    EXTRACT(HOUR FROM sale_date) as hour,
    COUNT(*) as transactions,
    SUM(total) as total_sales
FROM sales
WHERE DATE(sale_date) = CURRENT_DATE
AND payment_status = 'completed'
GROUP BY EXTRACT(HOUR FROM sale_date)
ORDER BY hour;
```

### Top 5 cajeros del mes
```sql
SELECT 
    u.full_name,
    COUNT(s.id) as transactions,
    SUM(s.total) as total_sales
FROM users u
JOIN sales s ON u.id = s.user_id
WHERE s.sale_date >= DATE_TRUNC('month', CURRENT_DATE)
AND s.payment_status = 'completed'
GROUP BY u.id, u.full_name
ORDER BY total_sales DESC
LIMIT 5;
```

## 🔐 Seguridad

### Usuarios por Defecto

El script crea dos usuarios por defecto:

| Usuario  | Email              | Role    |
|----------|-------------------|---------|
| admin    | admin@pos.com     | admin   |
| cajero1  | cajero1@pos.com   | cashier |

**⚠️ IMPORTANTE:** Las contraseñas son solo placeholders. Debes:
1. Cambiar los password_hash por hashes reales usando bcrypt
2. Cambiar las contraseñas inmediatamente en producción

### Generar Hash de Contraseña (Node.js)

```javascript
const bcrypt = require('bcrypt');
const password = 'tu_contraseña_segura';
const hash = await bcrypt.hash(password, 10);
console.log(hash);
```

## 🔄 Migraciones

Para actualizar la base de datos existente sin perder datos:

```sql
-- Backup antes de migrar
pg_dump pos_system > backup_$(date +%Y%m%d).sql

-- Aplicar cambios específicos
ALTER TABLE products ADD COLUMN IF NOT EXISTS new_field VARCHAR(100);
```

## 📊 Datos de Ejemplo

El script incluye:
- ✅ 7 categorías de productos
- ✅ 18 productos de ejemplo
- ✅ 2 usuarios (admin y cajero)

## 🧪 Testing

### Crear venta de prueba

```sql
-- Iniciar transacción
BEGIN;

-- Crear venta
INSERT INTO sales (sale_number, user_id, subtotal, tax, total, payment_method, payment_status)
VALUES ('SALE-TEST-001', 1, 100.00, 16.00, 116.00, 'cash', 'completed')
RETURNING id;

-- Supongamos que el ID retornado es 1
-- Agregar items
INSERT INTO sale_items (sale_id, product_id, product_name, product_sku, quantity, unit_price, subtotal)
VALUES 
(1, 1, 'Café Americano', 'CAF-001', 2, 35.00, 70.00),
(1, 4, 'Croissant', 'PAN-001', 1, 32.00, 32.00);

-- Confirmar
COMMIT;

-- Verificar stock reducido
SELECT sku, name, stock FROM products WHERE id IN (1, 4);
```

## 🛠️ Mantenimiento

### Reindexar tablas
```sql
REINDEX TABLE products;
REINDEX TABLE sales;
```

### Ver tamaño de tablas
```sql
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Limpiar ventas antiguas (más de 2 años)
```sql
DELETE FROM sales 
WHERE sale_date < CURRENT_DATE - INTERVAL '2 years'
AND payment_status = 'cancelled';
```

## 📞 Soporte

Para más información sobre PostgreSQL:
- [Documentación oficial](https://www.postgresql.org/docs/)
- [Tutorial PostgreSQL](https://www.postgresqltutorial.com/)

## 🔗 Conexión con Supabase

Si usas Supabase, puedes ejecutar este script desde el SQL Editor en tu dashboard de Supabase.

1. Ve a tu proyecto en Supabase
2. Abre el SQL Editor
3. Copia y pega el contenido de `database-schema.sql`
4. Ejecuta el script

---

**Nota:** Este esquema está optimizado para un sistema POS de pequeña a mediana escala. Para grandes volúmenes, considera particionamiento de tablas y estrategias de archivado.
