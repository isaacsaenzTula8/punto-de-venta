
  # Sistema de Punto de Venta

  This is a code bundle for Sistema de Punto de Venta. The original project is available at https://www.figma.com/design/bRw4XWzwU2A29d19j6TlWk/Sistema-de-Punto-de-Venta.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Backend (Login + Caja + Ventas)

  El backend base esta en `backend/`.

  1. Configura `backend/.env` desde `backend/.env.example`
  2. Ejecuta `database-schema.sql` y luego `backend/sql/001_cash_sessions.sql`
  3. Ejecuta `backend/sql/002_security_sessions.sql`
  3. Entra a `backend` y corre:
     - `npm i`
     - `npm run dev`

  Para que frontend apunte al backend, crea un `.env` en raiz con:
  - `VITE_API_URL=http://localhost:4000/api`

  ## Despliegue Online (AWS)

  Guia y plantillas listas en:
  - `deploy/aws/README.md`
  - `deploy/aws/nginx-pos.conf`
  - `deploy/aws/pos-backend.service`
  - `.env.production.example`
  - `backend/.env.production.example`
  
