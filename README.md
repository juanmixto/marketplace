# Marketplace Agroalimentario

Marketplace de compra directa al productor. Los compradores exploran el catalogo, compran con pago unico o suscripciones, siguen sus pedidos y gestionan sus direcciones. Los productores administran catalogo, promociones, planes de suscripcion, pedidos y liquidaciones. El backoffice de admin cubre analitica, moderacion y escritura sobre las entidades principales.

## Inicio rapido

Requisito minimo: Docker instalado.

```bash
./dev.sh
```

Eso levanta automaticamente:
- PostgreSQL
- migraciones y datos de prueba
- el servidor Next.js, normalmente en `http://localhost:3000`

Para reiniciar desde cero:

```bash
./dev.sh --reset
```

## Acceso local

Con `./dev.sh` activo, entra en `http://localhost:3000` con estas credenciales:

| Rol | Email | Password | Entrada directa |
|---|---|---|---|
| Admin | `admin@marketplace.com` | `admin1234` | `http://localhost:3000/admin/dashboard` |
| Productor | `productor@test.com` | `vendor1234` | `http://localhost:3000/vendor/dashboard` |
| Comprador | `cliente@test.com` | `cliente1234` | `http://localhost:3000/cuenta/pedidos` |

Para parar todo:

```bash
docker compose down
```

## Stack

- Next.js 16.2 con App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- Prisma 7.7 + PostgreSQL
- Auth.js / NextAuth v5
- Stripe
- Sendcloud
- Zustand para estado cliente

## Areas principales

- Publico: home, catalogo, buscador, fichas de producto y productor, paginas corporativas y legales.
- Comprador: carrito, checkout, pagos, pedidos, suscripciones, favoritos, direcciones e incidencias.
- Productor: dashboard, productos, promociones, planes de suscripcion, pedidos, liquidaciones y valoraciones.
- Admin: dashboard, informes, moderacion, comisiones, envios, liquidaciones, auditoria y escritura superadmin.

## Pagos y envios

- `PAYMENT_PROVIDER=mock` confirma el checkout sin Stripe real.
- `PAYMENT_PROVIDER=stripe` activa Stripe con tus claves de test y el webhook en `/api/webhooks/stripe`.
- `SHIPPING_PROVIDER=SENDCLOUD` activa etiquetas y tracking en `/api/webhooks/sendcloud`.
- `SHIPPING_PROVIDER=MOCK` deja el flujo listo para desarrollo sin credenciales externas.

## Idiomas

El storefront publica contenido en espanol e ingles, guarda la preferencia en la cookie `mp_locale` y puede auto-traducir copy de catalogo de forma heuristica. La guia completa esta en [`src/i18n/README.md`](./src/i18n/README.md) y en [`docs/wiki/Internationalization and Auto-translation.md`](./docs/wiki/International%20and%20Auto-translation.md).

## Configuracion manual

Si prefieres arrancar sin `dev.sh`:

1. `npm install`
2. `docker compose up -d db`
3. `npm run db:migrate`
4. `npm run db:seed`
5. `npm run dev`

El archivo `.env.local` ya trae valores de desarrollo por defecto, incluido `PAYMENT_PROVIDER=mock`.

## Comandos utiles

| Comando | Que hace |
|---|---|
| `npm run dev` | Arranca la app |
| `npm run build` | Build de produccion |
| `npm run typecheck` | TypeScript completo |
| `npm run lint` | ESLint sin warnings |
| `npm run test` | Tests rapidos |
| `npm run test:parallel` | Tests rapidos en paralelo |
| `npm run test:db` | Tests con base de datos |
| `npm run test:integration` | Tests de integracion |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Reset de BD + seed |

## Documentacion

- [`AGENTS.md`](./AGENTS.md) - reglas para agentes y humanos
- [`docs/conventions.md`](./docs/conventions.md) - stack, imports, Server Actions y campos Prisma
- [`docs/ai-guidelines.md`](./docs/ai-guidelines.md) - contratos y reglas de arquitectura para trabajo en paralelo
- [`docs/ai-workflows.md`](./docs/ai-workflows.md) - recetas operativas
- [`docs/git-workflow.md`](./docs/git-workflow.md) - flujo trunk-based y higiene de ramas
- [`docs/admin-host.md`](./docs/admin-host.md) - aislamiento opcional del panel admin
- [`docs/checkout-dedupe.md`](./docs/checkout-dedupe.md) - idempotencia del checkout
- [`docs/pwa.md`](./docs/pwa.md) - service worker, instalacion y push
- [`docs/wiki/`](./docs/wiki/) - wiki operativa del producto
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) - validacion local antes de abrir PR
- [`SECURITY.md`](./SECURITY.md) - politica de vulnerabilidades
