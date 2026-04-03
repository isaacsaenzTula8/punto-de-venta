# Despliegue AWS (Pruebas Online)

Guia para levantar POS en una sola instancia EC2 (Free Tier) con:
- `Frontend` en `Nginx` (archivos estaticos de `dist/`)
- `Backend` Node.js con `systemd`
- `PostgreSQL` en la misma EC2 (rapido para pruebas) o RDS aparte

## 1. Crear EC2

1. Lanza una instancia Ubuntu 24.04 LTS (`t3.micro` o `t2.micro`).
2. Security Group (inbound):
   - `22` SSH (tu IP)
   - `80` HTTP (0.0.0.0/0)
   - `443` HTTPS (0.0.0.0/0) (opcional por ahora)
   - `4000` NO abrirlo publicamente (se usa interno por Nginx)
3. Conectate por SSH:

```bash
ssh -i /ruta/tu-key.pem ubuntu@TU_EC2_PUBLIC_IP
```

## 2. Instalar runtime

En EC2:

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib curl git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3. Clonar proyecto

```bash
cd /var/www
sudo git clone https://github.com/TU_USUARIO/punto-de-venta.git
sudo chown -R ubuntu:ubuntu /var/www/punto-de-venta
cd /var/www/punto-de-venta
```

## 4. Base de datos PostgreSQL (local EC2)

1. Crear DB y usuario:

```bash
sudo -u postgres psql
```

Dentro de psql:

```sql
CREATE DATABASE pos_system;
CREATE USER pos_user WITH ENCRYPTED PASSWORD 'CAMBIA_ESTA_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE pos_system TO pos_user;
\q
```

2. Cargar SQL inicial/migraciones (segun tu flujo actual):
- `database-schema.sql`
- `backend/sql/*.sql` en orden

Ejemplo:

```bash
psql "postgresql://pos_user:CAMBIA_ESTA_PASSWORD@localhost:5432/pos_system" -f database-schema.sql
```

## 5. Backend (Node + systemd)

1. Instalar dependencias backend:

```bash
cd /var/www/punto-de-venta/backend
npm ci
cp .env.production.example .env
```

2. Editar `backend/.env`:
- `PORT=4000`
- `DATABASE_URL=postgresql://pos_user:...@localhost:5432/pos_system`
- `JWT_SECRET=...`

3. Crear servicio systemd:

```bash
sudo cp /var/www/punto-de-venta/deploy/aws/pos-backend.service /etc/systemd/system/pos-backend.service
sudo systemctl daemon-reload
sudo systemctl enable pos-backend
sudo systemctl start pos-backend
sudo systemctl status pos-backend
```

## 6. Frontend build + Nginx

1. Build frontend:

```bash
cd /var/www/punto-de-venta
cp .env.production.example .env.production
npm ci
npm run build
```

2. Configurar Nginx:

```bash
sudo cp /var/www/punto-de-venta/deploy/aws/nginx-pos.conf /etc/nginx/sites-available/pos
sudo ln -s /etc/nginx/sites-available/pos /etc/nginx/sites-enabled/pos
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

3. Abrir en navegador:
- `http://TU_EC2_PUBLIC_IP`

## 7. Actualizaciones

```bash
cd /var/www/punto-de-venta
git pull

cd backend
npm ci
sudo systemctl restart pos-backend

cd ..
npm ci
npm run build
sudo systemctl reload nginx
```

## 8. HTTPS (siguiente paso recomendado)

Cuando tengas dominio:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

