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
- PostgreSQL
- npm

## Configuración

1. Instala dependencias:

```bash
npm install
```

2. Crea tu entorno local:

```bash
cp .env.example .env.local
```

3. Ajusta las variables:

- `DATABASE_URL`: conexión a PostgreSQL
- `AUTH_SECRET`: secreto para Auth.js
- `NEXT_PUBLIC_APP_URL`: URL pública de la app
- `PAYMENT_PROVIDER`: `mock` o `stripe`
- Si `PAYMENT_PROVIDER="stripe"`, también necesitas:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

## Base de datos

Aplicar migraciones:

```bash
npm run db:migrate
```

Cargar datos de ejemplo:

```bash
npm run db:seed
```

Reset completo con seed:

```bash
npm run db:reset
```

Abrir Prisma Studio:

```bash
npm run db:studio
```

## Desarrollo

Levantar la app:

```bash
npm run dev
```

Validar tests:

```bash
npm test
```

Validar build de producción:

```bash
npm run build
```

## Pagos

### Modo mock

Usa `PAYMENT_PROVIDER="mock"` para desarrollo rápido sin Stripe real.

- El checkout crea la orden
- El pago se confirma automáticamente
- El flujo completa el pedido sin webhook externo

### Modo Stripe

Usa `PAYMENT_PROVIDER="stripe"` cuando quieras probar el flujo real.

- El checkout crea un `PaymentIntent`
- El usuario continúa a `/checkout/pago`
- Stripe Elements confirma el pago
- El webhook `/api/webhooks/stripe` actualiza el estado del pago y del pedido

El proyecto ya incluye validación de envs por modo de pago, así que si activas Stripe sin sus claves necesarias, la app fallará con un error explícito al arrancar.

## Credenciales de seed

Después de `npm run db:seed` quedan disponibles:

- Admin: `admin@marketplace.com` / `admin1234`
- Productor: `productor@test.com` / `vendor1234`
- Cliente: `cliente@test.com` / `cliente1234`

## Estado actual

El proyecto está operativo para desarrollo local y ya tiene:

- build pasando
- tests básicos de checkout, pagos, envs y utilidades de catálogo
- soporte de pago mock y flujo base con Stripe

Todavía hay áreas en evolución, especialmente admin, reglas avanzadas de fulfillment y documentación funcional más profunda.
