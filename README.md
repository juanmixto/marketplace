# 🌾 Marketplace Agroalimentario

Plataforma de compra directa al productor. Los compradores exploran el catálogo, aplican cupones y promociones, pagan (one-shot o por suscripción recurrente tipo "caja semanal") y siguen sus pedidos. Los productores gestionan catálogo, promociones, planes de suscripción, pedidos y liquidaciones. Los administradores supervisan la plataforma con panel de analítica, moderación y escritura sobre productos/productores/promociones/planes.

## 🚀 Lanzar la aplicación

**Requisito único: Docker instalado**

```bash
./dev.sh
```

Eso es. Se levanta automáticamente:
- Base de datos PostgreSQL
- Migraciones y datos de prueba
- Servidor Next.js (normalmente **http://localhost:3000**, o **3003+** si 3000 está ocupado)

**Para limpiar y reiniciar:**
```bash
./dev.sh --reset
```

---

## 📋 Acceso a la aplicación

Una vez ejecutado `./dev.sh`, accede a **http://localhost:3000** con estas credenciales:

| Rol | Email | Contraseña | URL directa |
|-----|-------|-----------|------------|
| 👨‍💼 **Admin** | `admin@marketplace.com` | `admin1234` | http://localhost:3000/admin/dashboard |
| 🌾 **Productor** | `productor@test.com` | `vendor1234` | http://localhost:3000/vendor/dashboard |
| 👤 **Comprador** | `cliente@test.com` | `cliente1234` | http://localhost:3000/cuenta/pedidos |

---

## 🛑 Parar la aplicación

```bash
docker compose down
```

---

## 📚 Stack técnico

- **Next.js 16** + App Router  
- **React 19**  
- **Prisma 7** + **PostgreSQL**  
- **NextAuth v5** (autenticación por credenciales)  
- **Tailwind CSS 4** (estilos)  
- **Stripe** (modo mock para desarrollo)  
- **Zustand** (estado del carrito)  
- **Node test runner** (tests)

## 🎯 Áreas principales

- **Pública**: home, catálogo, detalle de productos, perfil de productor, búsqueda y filtros.
- **Comprador**: carrito, checkout (con promociones y descuentos aplicados), pagos, historial de pedidos, **suscripciones** con skip / pausa / cancelación, favoritos, direcciones, incidencias.
- **Productor**: dashboard, catálogo con búsqueda/filtros/stepper de stock y subida multi-imagen, **promociones** (CRUD), **planes de suscripción** (CRUD), pedidos con FSM manual (CONFIRMED→PREPARING→READY→SHIPPED), liquidaciones, valoraciones, perfil comercial.
- **Admin**: dashboard, analítica (PR #321), pedidos, productos, productores con KPIs, promociones, suscripciones, envíos, liquidaciones, comisiones, incidencias, auditoría y configuración. Superadmin puede editar productos, productores, promociones y planes de suscripción (PR #355). Panel opcional servido en host aislado (`ADMIN_HOST`, ver [`docs/admin-host.md`](./docs/admin-host.md)).

### Envíos

`SHIPPING_PROVIDER="SENDCLOUD"` integra generación de etiquetas y seguimiento vía [Sendcloud](https://www.sendcloud.com/) (PR #331). Webhook en `/api/webhooks/sendcloud`. Para desarrollo sin credenciales, usa `SHIPPING_PROVIDER="MOCK"` y la página local de avance manual en `/dev/mock-shipment/[ref]`.

## 🌐 Idiomas y auto-traducción de productos

El storefront ya funciona en **español e inglés** para navegación, páginas públicas y catálogo.

### Qué hace actualmente
- guarda el idioma del usuario en la cookie `mp_locale`
- traduce la UI pública y de catálogo con el sistema interno de i18n
- si un producto fue escrito originalmente en otro idioma, puede mostrar una **traducción automática** de `nombre`, `descripción` y `unidad`
- enseña una insignia visual para avisar al comprador, por ejemplo: `Auto-translated from Spanish`

### Tecnología usada
La traducción actual **no usa servicios externos** como Google Translate, DeepL u OpenAI.
Se implementa con lógica interna en:
- `src/i18n/server.ts`
- `src/i18n/public-page-copy.ts`
- `src/i18n/catalog-copy.ts`

### Limitación importante
La auto-traducción actual es **heurística y basada en glosarios**, adecuada para copy corto del catálogo. Si más adelante se necesita máxima calidad en producción, lo recomendado es evolucionar a:
- campos bilingües en base de datos (`nameEs`, `nameEn`, etc.), o
- traducción persistida al guardar con un proveedor externo

Más detalle en la wiki: [`docs/wiki/Internationalization and Auto-translation.md`](./docs/wiki/Internationalization%20and%20Auto-translation.md).

## 💻 Requisitos del sistema

- **Node.js 20+**
- **Docker** (para PostgreSQL)
- **npm**

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
| `npm test` | Tests rápidos sin base de datos |
| `npm run test:parallel` | Tests rápidos en paralelo |
| `npm run test:db` | Tests con base de datos y migraciones |
| `npm run test:db:parallel` | Tests con base de datos en paralelo |
| `npm run test:integration` | Tests de integración |
| `npm run test:e2e:smoke` | Smoke Playwright contra `marketplace_test` en `http://localhost:3001` |
| `npm run db:studio` | Prisma Studio en http://localhost:5555 |
| `npm run db:reset` | Reset de BD con seed (sin arrancar app) |
| `npm run typecheck` | Validación completa de TypeScript |
| `npm run typecheck:app` | TypeScript de la app |
| `npm run typecheck:test` | TypeScript de los tests |
| `npm run build` | Build de producción |

Más detalle del flujo de validación en [`CONTRIBUTING.md`](./CONTRIBUTING.md).

### Smoke local

Si ejecutas `npm run test:e2e:smoke`, Playwright levanta `next dev`
contra la base de datos sembrada `marketplace_test` y activa
`PLAYWRIGHT_E2E=1` para que catálogo y configuración no usen caché
vieja. Esa combinación evita falsos fallos cuando repites el smoke
varias veces seguidas.

Si prefieres abrir la app manualmente con ese mismo entorno, usa:

```bash
./dev.sh --smoke
```

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

El proyecto está operativo para desarrollo local y cubre hoy:

- Storefront público con i18n ES/EN y auto-traducción heurística del catálogo.
- Checkout con Stripe (mock en dev, live con Connect destination charges) y evaluación de promociones/cupones.
- **Suscripciones** (RFC 0001): plan CRUD en vendor, ciclo de compra con Stripe Subscriptions + Stripe Prices, materialización de pedidos en `invoice.paid`, skip/pause/cancel propagados a Stripe, emails transaccionales de renovación y fallo de pago.
- **Promociones**: CRUD en vendor, evaluación en checkout, vista read-only en admin.
- **Sendcloud** para etiquetas y tracking (webhook + panel de envíos en admin).
- **Panel admin** con analítica, grids con filtros operativos, escritura superadmin sobre productos/productores/promociones/planes, y aislamiento opcional por host.
- **Auth hardening**: validación de callbacks, portal switcher, aislamiento por host, scaffold de impersonation (PR #356).
- **Mobile UX** con scroll lock, safe-area insets, CTAs fijas y tap targets ≥44px.

Áreas todavía en evolución: robustez SEO técnico, instrumentación analítica end-to-end más allá del dashboard actual, y cobertura legal/consent.

## 📚 Documentación

- [`AGENTS.md`](./AGENTS.md) — convenciones para trabajar en el repo (agentes y humanos).
- [`docs/conventions.md`](./docs/conventions.md) — stack, imports, patrón de Server Actions, campos Prisma, layout, env vars.
- [`docs/git-workflow.md`](./docs/git-workflow.md) — flujo trunk-based y reglas de higiene.
- [`docs/admin-host.md`](./docs/admin-host.md) — aislamiento del panel admin en host propio.
- [`docs/rfcs/0001-promotions-and-subscriptions.md`](./docs/rfcs/0001-promotions-and-subscriptions.md) — RFC de Promotions & Subscriptions (Activo, fases 1–5 entregadas).
- [`docs/issues-backlog.md`](./docs/issues-backlog.md) — backlog de hardening pendiente.
- [`docs/wiki/`](./docs/wiki/) — wiki operativa (Home, Architecture, Storefront and Routes, Product Overview, Operations Runbook, Developer Onboarding, Analytics and KPIs, SEO, i18n).
- [`src/i18n/README.md`](./src/i18n/README.md) — convenciones i18n (flat keys vs `*-copy.ts` vs `labelKey`).
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — flujo de validación local antes de abrir PR.
- [`SECURITY.md`](./SECURITY.md) — política de reporte de vulnerabilidades.
