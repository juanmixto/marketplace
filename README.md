# Marketplace

Marketplace agroalimentario con compra directa al productor. La aplicación incluye escaparate público, carrito y checkout para compradores, panel de catálogo para productores y un área inicial de administración.

## Stack

- Next.js 16 + App Router
- React 19
- Prisma 7 + PostgreSQL
- NextAuth v5 con credenciales
- Tailwind CSS 4
- Stripe con modo `mock` para desarrollo
- Zustand para carrito en cliente
- Node test runner + `tsx` para tests rápidos

## Áreas principales

- Público: home, catálogo, detalle de producto y fichas de productor
- Comprador: carrito, checkout, pago y seguimiento de pedidos
- Productor: dashboard, catálogo, alta y edición de productos
- Admin: dashboard base

## Requisitos

- Node.js 20+
- Docker (para PostgreSQL)
- npm

---

## Arranque rápido (recomendado)

Un solo comando levanta la base de datos, aplica migraciones, carga los datos de prueba y arranca Next.js:

```bash
./dev.sh
```

La app queda disponible en **http://localhost:3000**

### Reiniciar con base de datos limpia

```bash
./dev.sh --reset
```

Borra todos los datos y repuebla desde cero con el seed.

### Parar todo

```bash
docker compose down
```

---

## Usuarios de prueba

Disponibles tras el seed (se cargan automáticamente con `./dev.sh`):

| Rol | Email | Contraseña | Panel |
|-----|-------|-----------|-------|
| Admin | `admin@marketplace.com` | `admin1234` | `/admin/dashboard` |
| Vendedor | `productor@test.com` | `vendor1234` | `/vendor/dashboard` |
| Comprador | `cliente@test.com` | `cliente1234` | `/cuenta/pedidos` |

---

## Configuración manual (sin el script)

Si prefieres lanzarlo paso a paso:

### 1. Instala dependencias

```bash
npm install
```

### 2. Variables de entorno

El fichero `.env.local` ya está configurado para desarrollo local con valores por defecto:

- `PAYMENT_PROVIDER=mock` — no necesitas Stripe real
- `DATABASE_URL` apunta a PostgreSQL en localhost:5432

Si necesitas ajustarlo, edita `.env.local` directamente.

### 3. Base de datos

```bash
# Levantar PostgreSQL con Docker
docker compose up -d db

# Aplicar migraciones
npm run db:migrate

# Cargar datos de ejemplo
npm run db:seed
```

### 4. Arrancar la app

```bash
npm run dev
```

---

## Herramientas de desarrollo

| Comando | Descripción |
|---------|-------------|
| `./dev.sh` | Arranque completo en un comando |
| `./dev.sh --reset` | Reset de BD + arranque |
| `npm test` | Tests unitarios |
| `npm run db:studio` | Prisma Studio en http://localhost:5555 |
| `npm run db:reset` | Reset de BD con seed (sin arrancar app) |
| `npm run typecheck` | Validación de TypeScript sin compilar |
| `npm run build` | Build de producción |

---

## Pagos

### Modo mock (por defecto)

`PAYMENT_PROVIDER="mock"` — el checkout confirma el pedido automáticamente sin Stripe real. Ideal para desarrollar y probar flujos de compra.

### Modo Stripe

Cambia a `PAYMENT_PROVIDER="stripe"` en `.env.local` y añade tus claves de test:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

El webhook de confirmación está en `/api/webhooks/stripe`. Para recibirlo en local usa [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Estado actual

El proyecto está operativo para desarrollo local y ya tiene:

- Build pasando
- Tests básicos de checkout, pagos, envs y utilidades de catálogo
- Soporte de pago mock y flujo base con Stripe

Áreas en evolución: panel admin completo, incidencias, liquidaciones, emails transaccionales y Stripe Connect para vendedores.
