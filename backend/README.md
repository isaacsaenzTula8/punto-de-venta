# Backend POS (Node + PostgreSQL)

Backend base para:
- Login y seguridad por rol (`admin`, `cashier`, `manager`)
- Apertura/cierre de caja
- Registro de ventas con detalle de items

## 1) Requisitos
- Node.js 20+
- PostgreSQL 14+

## 2) Configuracion
1. Copia `.env.example` a `.env`
2. Ajusta `DATABASE_URL` y `JWT_SECRET`

## 3) Base de datos
Si aun no ejecutaste el esquema principal:

```bash
psql -U postgres -d pos_system -f ../database-schema.sql
```

Luego ejecuta migraciones:

```bash
psql -U postgres -d pos_system -f sql/001_cash_sessions.sql
psql -U postgres -d pos_system -f sql/002_security_sessions.sql
psql -U postgres -d pos_system -f sql/003_products_barcode.sql
psql -U postgres -d pos_system -f sql/004_sale_items_historic_cost.sql
psql -U postgres -d pos_system -f sql/005_credit_sales_prep.sql
psql -U postgres -d pos_system -f sql/006_store_charge_policy.sql
psql -U postgres -d pos_system -f sql/007_returns_and_cash_adjustments.sql
psql -U postgres -d pos_system -f sql/008_multi_branch_foundation.sql
psql -U postgres -d pos_system -f sql/009_system_settings_feature_flags.sql
psql -U postgres -d pos_system -f sql/010_business_settings.sql
```

## 4) Instalar y correr
```bash
cd backend
npm install
npm run dev
```

Servidor: `http://localhost:4000`

## 5) Crear usuario admin/cajero
```bash
npm run create:user -- root root@pos.com "Super Administrador" superadmin admin123
```

## 6) Endpoints principales

### Health
`GET /api/health`

### Auth
- `POST /api/auth/login`
  - body: `{ "username": "admin", "password": "admin123" }`
- `GET /api/auth/me` (Bearer token)
- `POST /api/auth/logout` (Bearer token)

### Caja (Bearer token)
- `GET /api/cash/current`
- `POST /api/cash/open`
  - body: `{ "openingAmount": 300 }`
- `POST /api/cash/close`
  - body: `{ "closingAmount": 1250 }`

### Ventas (Bearer token)
- `POST /api/sales`
  - body:
```json
{
  "paymentMethod": "cash",
  "customerId": null,
  "notes": "venta mostrador",
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 3, "quantity": 1 }
  ]
}
```
- `POST /api/sales`
  - para guardar pedido sin cobrar: agregar `"chargeNow": false`
- `POST /api/sales/:id/charge`
  - body: `{ "paymentMethod": "cash" }`
- `POST /api/sales/:id/refund`
  - body parcial:
```json
{
  "refundMethod": "cash",
  "returnAll": false,
  "items": [
    { "saleItemId": 15, "quantity": 1 }
  ]
}
```
  - body total:
```json
{
  "refundMethod": "cash",
  "returnAll": true
}
```
- `GET /api/sales/recent`

### Configuracion tienda (Bearer token)
- `GET /api/settings/store`
- `PATCH /api/settings/store` (solo superadmin)
  - body: `{ "cashierCanCharge": false }`
- `GET /api/settings/system` (solo superadmin)
- `PATCH /api/settings/system` (solo superadmin)
  - body: `{ "multiBranchEnabled": true }`
- `GET /api/settings/business`
  - (si multi-sucursal activo, admite `?branchId=2`)
- `PATCH /api/settings/business` (solo superadmin)
  - body:
```json
{
  "branchId": 1,
  "businessName": "Tienda Central",
  "nit": "1234567-8",
  "phone": "5555-5555",
  "address": "Zona 1",
  "currencyCode": "GTQ",
  "logoUrl": "",
  "useDarkMode": false
}
```

### Sucursales (Bearer token)
- `GET /api/branches`
- `GET /api/branches/:id` (solo superadmin)
- `POST /api/branches` (solo superadmin)
  - body: `{ "code": "NORTE", "name": "Sucursal Norte" }`
- `PATCH /api/branches/:id` (solo superadmin)
- `DELETE /api/branches/:id` (solo superadmin)
  - bloquea borrado si la sucursal tiene usuarios/ventas/caja/productos/categorias
Nota: estas rutas solo se habilitan cuando `multiBranchEnabled = true`.

### Productos (Bearer token)
- `GET /api/products`
- `POST /api/products` (`barcode` opcional)
- `PATCH /api/products/:id` (`barcode` opcional)
- `POST /api/products/reassign-branch` (solo superadmin y con multi-sucursal activo)
  - body:
```json
{
  "targetBranchId": 2,
  "productIds": [10, 11, 12]
}
```
  - comportamiento: intenta mapear categoria por nombre en la sucursal destino; si no existe, deja `category_id = null`

### Usuarios (solo superadmin)
- `GET /api/users`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/reset-password`

## Notas
- Los precios se guardan tal como se venden (sin desglose de impuesto en UI).
- La sesion expira por JWT y por inactividad (`SESSION_IDLE_MINUTES`).
