# Runtime performance & refresh audit

> Fecha: 2026-04-19 · Rama: `feat/address-ux-phase-2` · Next.js 16.2.3 · React 19.2.4 · App Router.
>
> Objetivo: explicar con evidencia por qué **(a)** la app se siente lenta y **(b)** a veces "no refresca" tras mutaciones, y priorizar correcciones con riesgo acotado. El audit se basa en inspección estática del repo (no mediciones runtime — ver `performance-baseline.md`, pendiente en Fase 3).

## TL;DR

El repo está arquitectónicamente sano: Server Components por defecto, Zustand solo donde tiene sentido, service worker con denylist correcta, observabilidad con Sentry+PostHog presente, y pipeline CI ya con smoke E2E + integration shards. Los síntomas "va lento / no refresca" se explican por **cinco clases de problema concretas**, ninguna arquitectónica:

1. **Server Actions sin `safeRevalidatePath` en paths críticos** (orders, incidents, push-notifications, impersonation, checkout).
2. **`useEffect`-fetch duplicando datos ya renderizados en server** en direcciones y checkout → hydration + segunda petición + "Loading…".
3. **Header cliente de 440 LOC con `usePathname()`** → re-render completo en cada navegación (con 6 heroicons de árbol completo).
4. **Cero `loading.tsx` fuera de 3 páginas**: la navegación espera layouts con 3 queries de DB antes de pintar nada.
5. **Recharts y otros módulos pesados importados a module scope** en componentes cliente de admin.

Con fixes de Fase A (abajo) se cubre el 70-80% del síntoma percibido, sin refactor arquitectónico y con PRs pequeños y reversibles.

---

## Stack verificado

| Pieza | Versión | Notas |
| --- | --- | --- |
| Next.js | 16.2.3 | App Router, Turbopack no activado |
| React | 19.2.4 | |
| TypeScript | 5 estricto + `noUncheckedIndexedAccess` | |
| Prisma | 7.7 (cliente en `@/generated/prisma/client`) | |
| NextAuth | v5 beta.30 (JWT) | |
| Zustand | 5.0.12 | `cart-store`, `favorites-store`, `analytics-filters` |
| Sentry | `@sentry/nextjs` 10.49 | server+client+edge configs en raíz |
| PostHog | `posthog-js` 1.369 | wrapper en `src/lib/posthog.ts` |
| Tests | `node --test` + Playwright 1.59 | 52 integration (6 shards) + 25 smoke E2E |
| CI | `.github/workflows/ci.yml` + `lighthouse.yml` (no bloqueante) + `nightly.yml` | Verify + Build+Migrate + Integration + E2E Smoke + Doctor + Security = requeridos |

Métricas estáticas del repo: 116/566 archivos son client components (20%). 81 páginas en app/. **3 tienen Suspense, 0 tienen `loading.tsx`**.

---

## Hallazgos por severidad

### P0 — Bloquean percepción de frescura o de velocidad

#### P0-1 · `createOrder` / `confirmOrder` no revalidan todas las vistas afectadas
**Archivo:** `src/domains/orders/actions.ts`
**Síntoma:** tras pagar, el carrito (`/carrito`) y la página de checkout (`/checkout/pago`) pueden seguir mostrando el estado previo si el usuario vuelve atrás o navega con `<Link>`; el stock en home/catálogo tarda hasta que caduca su cache.
**Evidencia:** el cuerpo de `createOrder()` no llama a `safeRevalidatePath`. `confirmOrder()` (línea ~1030-1067) revalida `/cuenta/pedidos*` y `/carrito` pero no `revalidateCatalogExperience()` para que desaparezcan productos sin stock del home/catálogo.
**Fix:**
```ts
// al final de createOrder, antes de devolver
safeRevalidatePath('/carrito')
safeRevalidatePath('/checkout')
revalidateCatalogExperience() // stock decrementado

// al final de confirmOrder
revalidateCatalogExperience()
```
**Riesgo:** bajo. `revalidateCatalogExperience` ya se usa en vendors. Nunca rompe render; solo marca tags caducos.

#### P0-2 · Mutaciones de incidencias no revalidan el hilo
**Archivo:** `src/domains/incidents/actions.ts`
**Funciones afectadas:** `openIncident()`, `addIncidentMessage()`.
**Síntoma:** "abro incidencia y no veo el mensaje que acabo de mandar hasta refrescar".
**Fix:** añadir tras el `db.X.create`:
```ts
safeRevalidatePath('/cuenta/incidencias')
safeRevalidatePath(`/cuenta/incidencias/${incident.id}`)
```
También en la superficie admin (`/admin/incidencias/[id]`).
**Riesgo:** bajo.

#### P0-3 · `subscribeToPush` / `unsubscribeFromPush` no revalidan ajustes
**Archivo:** `src/domains/push-notifications/actions.ts`
**Síntoma:** el usuario activa notificaciones, la página de ajustes sigue mostrando "desactivadas" hasta refresh manual.
**Fix:** `safeRevalidatePath('/cuenta/notificaciones')` y la superficie vendor equivalente si existe.

#### P0-4 · `startImpersonation` / `endImpersonation` no revalidan antes de `redirect`
**Archivo:** `src/domains/impersonation/actions.ts`
**Síntoma:** admin entra a vendor como otro usuario, primer render del dashboard vendor puede servirse desde router cache del admin previo.
**Fix:** antes del `redirect()`, `safeRevalidatePath('/vendor/dashboard')`, `/vendor/productos`, `/vendor/pedidos`, `/admin/dashboard` (para end).
**Riesgo:** medio — hay un test de contrato de impersonation; correr `npm run test -- test/integration/impersonation*` tras el cambio.

#### P0-5 · Duplicado de fetch en cliente tras SSR (hydration race)
**Archivos:**
- `src/app/(buyer)/cuenta/direcciones/DireccionesClient.tsx:77-91` → `useEffect` que `fetch('/api/direcciones')` al montar, aunque la página ya puede pasar las direcciones como prop.
- `src/components/buyer/CheckoutPageClient.tsx:212-219` → mismo patrón.

**Síntoma:** el usuario entra, ve el listado ya renderizado, parpadea a "Loading…" y vuelve. En el checkout es crítico: añade 100-300 ms antes de poder seleccionar dirección.
**Fix:** leer direcciones en el Server Component padre, pasarlas como `initialAddresses` y eliminar el `useEffect`. Mantener un handler separado solo para mutaciones (crear/borrar).
**Riesgo:** medio — hay que tocar la forma del Client Component y asegurar que las validaciones siguen funcionando. PR pequeño y revisable.

#### P0-6 · Header cliente de 440 LOC re-renderiza en cada navegación
**Archivo:** `src/components/layout/Header.tsx` (440 LOC, `'use client'`)
**Problema:** usa `usePathname()` → re-render completo en cada cambio de ruta. Importa 6 heroicons a module scope. 8 `useEffect`, 6 `useState`. Es el componente más visitado de la app.
**Fix (PR pequeño):** extraer la parte dependiente de pathname (activo/cerrado de menú móvil) a un subcomponente aislado y memoizar el resto con `React.memo`. No cambiar comportamiento.
**Fix (PR mayor, opcional):** dividir Header en `HeaderShell` (server) + `HeaderInteractive` (client minimal: menú, búsqueda, cart badge).
**Riesgo:** medio — afecta a todas las páginas. Requiere smoke E2E verde.

---

### P1 — Degradan UX pero el síntoma no es evidente siempre

#### P1-1 · 0 `loading.tsx` fuera de 3 páginas
Con Server Components + queries en layout, una navegación que toca p.ej. `(vendor)/layout.tsx` espera ~3 queries Prisma antes de que React pueda pintar nada. **Sin `loading.tsx`, el usuario ve la página previa "congelada"**. Esta es una de las causas más probables del "va lento".
**Fix:** crear esqueletos mínimos:
- `src/app/(buyer)/loading.tsx`
- `src/app/(vendor)/loading.tsx`
- `src/app/(admin)/loading.tsx`

Tres archivos de ~15 líneas cada uno (header skeleton + main skeleton). Riesgo = nulo.

#### P1-2 · Queries secuenciales en layouts vendor/admin
**Archivo:** `src/app/(vendor)/layout.tsx`
`requireVendor()` → `db.vendor.findUnique()` → `db.vendorFulfillment.count()` → `db.user.findUnique()` → `getAvailablePortals()`. 3-4 roundtrips antes del children.
**Fix:** paralelizar con `Promise.all([...])` donde no haya dependencia; envolver el children en Suspense y mover el badge count a un componente streamed.
**Riesgo:** bajo-medio.

#### P1-3 · Recharts importado a module scope en client components
**Archivos:** `src/components/admin/analytics/charts/RankedBarChart.tsx`, `CategoryPieChart.tsx`.
**Impacto:** ~150 KB gzipped añadidos a cualquier bundle que toque analytics aunque no se esté mirando la gráfica.
**Fix:** envolver el padre `AdminAnalyticsCharts` con `next/dynamic({ ssr: false })`.
**Riesgo:** nulo (admin-only).

#### P1-4 · `router.refresh()` con ventana de 30 s
`next.config.ts` fija `experimental.staleTimes.static: 30`. Esto es el **router cache del cliente**, no ISR. Explica que, tras una mutación en pestaña A, la pestaña B vea datos viejos durante hasta 30 s en navegaciones `<Link>` hasta que el router expira su prefetch.
**Fix:** ninguno global (30 s es el mínimo permitido; bajarlo más no es posible). En páginas con mutaciones de usuario propio (perfil, favoritos), invocar `router.refresh()` desde el cliente tras la mutación **ya revienta el cache del Link correspondiente**. Lo que falta es asegurar que las páginas recuperadas desde otra ruta también se revaliden — eso lo resuelven los `safeRevalidatePath` de P0.
**Acción:** validar que cada server action con `router.refresh()` del cliente también dispara `safeRevalidatePath` del lado servidor. Auditoría cruzada cuando abordemos P0-1..P0-4.

#### P1-5 · `fetch()` cliente sin `cache: 'no-store'` en datos de usuario
**Archivos:** `favorites-store.ts:32` (`fetch('/api/favoritos/ids')`), `DireccionesClient.tsx:80`, `CheckoutPageClient.tsx:215`.
**Impacto:** el navegador aplica heurística de cache HTTP; en Chrome y bajo algunas cabeceras puede cachear minutos. Datos "del usuario" no deben cachearse nunca por proxy/browser.
**Fix:** añadir `{ cache: 'no-store' }` a esos tres fetches (solo rutas `/api/*` que devuelven datos del usuario actual).
**Riesgo:** nulo.

#### P1-6 · `UpdateAvailableBanner` polling cada 60 s sin jitter
**Archivo:** `src/components/system/UpdateAvailableBanner.tsx:27-52`.
**Impacto:** cada cliente golpea `/api/version` exactamente cada minuto → thundering herd en despliegue. No es lento para el usuario individual pero añade carga de servidor constante.
**Fix:** añadir jitter ±10%, y plantear si 60 s es suficiente (2-5 min basta para un aviso de nueva build).

#### P1-7 · `LanguageProvider` lee localStorage post-hydration
Ya tiene `suppressHydrationWarning` en `<html>`, aceptable, pero conviene añadir un test E2E que verifique que al cambiar el locale, la navegación posterior lo mantiene.

---

### P2 — Deuda / monitorización

- **Imágenes sin `sizes`**: `HomePageClient.tsx` (Unsplash), vendor cards de `/productores`. Genera re-request en el responsive.
- **`AdminProducersClient.tsx:65`** recalcula `relativeFromNow()` en cada render sin memo → CLS leve en la tabla.
- **Heroicons a module scope en 32 client components**: impacto modesto por el tree-shaking de Heroicons (export por icono), pero igualmente revisar en componentes grandes (Header, Sidebars, forms top 5).
- **`audit:contracts`** corre en CI pero como warning; considerar promoverlo a bloqueante cuando esté verde de forma sostenida.
- **`force-dynamic` en admin edit pages**: `productores/[id]/edit`, `suscripciones/[id]/edit`, `promociones/[id]/edit`, `productos/[id]/edit`. Son formularios; `force-dynamic` es excesivo. `revalidate = 30` + `router.refresh()` al submit daría el mismo UX con caché intermedio. Cambio de bajo riesgo pero no prioritario.
- **Analytics sin Web Vitals**: PostHog no captura LCP/INP/CLS en producción. Sin datos reales, cualquier optimización va a ciegas (ver Fase 3+4).

---

## Afirmaciones que NO aplican al repo (descartadas tras verificación)

Para que nadie intente "arreglar" cosas que no están rotas:

- **"Páginas sin `export const revalidate` caducan cada 3600 s"** — Falso en este repo. Todas las páginas que usan `auth()` / `getActionSession()` / `cookies()` son automáticamente dinámicas en Next 16 App Router. No hay un default de 1 h. Lo que sí existe es el router-cache cliente (`staleTimes.static: 30`), que se mitiga con `safeRevalidatePath` + `router.refresh()`.
- **"Route handlers `POST /api/*` cachean 30 s"** — Falso. Los verbos mutantes son siempre dinámicos. Añadir `export const dynamic = 'force-dynamic'` no hace daño pero no resuelve ningún bug.
- **"Service worker cachea rutas protegidas"** — Verificado: `public/sw.js` aplica denylist correcta (`/api`, `/admin`, `/vendor`, `/checkout`, `/auth`). No es la causa de ningún síntoma actual.

---

## Plan de remediación (resumido; detalle en Fase 6 cuando ejecutemos)

### Fase A — Quick wins (PRs independientes, bajo riesgo)
1. `safeRevalidatePath` en `createOrder`, `confirmOrder`, incidents, push-notifications, impersonation. (P0-1..P0-4)
2. Tres `loading.tsx` mínimos en grupos `(buyer)`, `(vendor)`, `(admin)`. (P1-1)
3. `{ cache: 'no-store' }` en los 3 fetches de datos de usuario. (P1-5)
4. Jitter + espaciar `UpdateAvailableBanner` de 60 s → 5 min con jitter. (P1-6)

### Fase B — Correcciones estructurales
5. Direcciones + Checkout: mover fetch al server y pasar props. (P0-5)
6. Header: extraer subcomponente pathname-dependiente y memoizar el resto. (P0-6)
7. `AdminAnalyticsCharts` con `dynamic({ ssr: false })`. (P1-3)
8. Paralelizar queries de `(vendor)/layout.tsx`. (P1-2)

### Fase C — Blindaje
9. Web Vitals → PostHog (LCP/INP/CLS reales en prod).
10. Smoke E2E "mutation → UI refleja cambio" para las 4 rutas P0.
11. Lighthouse CI en `/checkout` y `/productos/[slug]` como bloqueante con budget.
12. Promover `audit:contracts` a bloqueante.

### Criterios de éxito
- En prod, tras pagar, el carrito está vacío sin recargar (P0-1 resuelto).
- En incidencias, un mensaje enviado aparece sin recargar (P0-2 resuelto).
- Tras una navegación dentro del mismo grupo (p.ej. `/vendor/productos` → `/vendor/pedidos`), el usuario ve skeleton < 100 ms en vez de pantalla congelada (P1-1 resuelto).
- p75 LCP en home y ficha de producto < 2.5 s, p75 INP < 200 ms (Fase 3).
- CI bloquea PRs que regresan cualquiera de las anteriores (Fase C).

---

## Referencias
- `docs/ci-testing-strategy.md` — fases y estrategia de testing.
- `docs/conventions.md` — imports y patrón de server actions.
- `docs/branch-protection.md` — checks requeridos actualmente.
- `docs/audits/performance-baseline.md` — (pendiente, Fase 3) baseline de rutas clave.
