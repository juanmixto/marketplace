# Migración a `raizdirecta.es` y separación dev / staging / producción

> **Estado:** ejecución en curso. Fase 1 (DNS) y Fase 3.1 (Google OAuth) en progreso; Fase 4 PRs 1-3 abiertos / mergeándose. Cutover (Fase 6) sigue pendiente. Última revisión: 2026-05-02.
>
> **Tracking en GitHub:** ver épica del repo (etiqueta `epic` + `domain-migration`) y los 7 issues hijos enlazados desde ella. Progreso detallado al final de este documento.

## Contexto

Hemos comprado **`raizdirecta.es`** y queremos reemplazar el dominio actual `feldescloud.com`. La marca interna ya es `Raíz Directa` ([src/lib/constants.ts:1](../../src/lib/constants.ts#L1)), así que el dominio nuevo es coherente con el branding y no hay que reescribir copy. Aprovechando la migración, también formalizamos la separación **dev / staging / producción**, que hoy no existe (sólo dev tunnel + prod monolítica).

El objetivo es minimizar el riesgo de cutover (servicios externos que dependen del dominio: Google OAuth, Resend, Stripe, PostHog, Cloudflare Tunnel) y aprovechar que el código ya tiene `NEXT_PUBLIC_APP_URL` como fuente de verdad para SEO/og/sitemap. Casi todo el trabajo es **eliminar hardcodes residuales** y **configurar proveedores externos**, no reescribir lógica.

**Estado relevante hoy:**

- Self-hosted con Docker + Traefik + Cloudflare Tunnel (no Vercel). Prod en host del usuario, dev tunnel `dev.feldescloud.com` → laptop puerto 3001.
- Staging **no existe** como app/BD; solo URI registrada en Google OAuth. Tampoco hay deploy CI/CD — el deploy es manual (`git pull && docker compose up -d --build`).
- Hardcodes residuales de `feldescloud.com` en 5 ficheros de `src/`+`public/` y en docs/tests. La metadata SEO ([src/lib/seo.ts:4](../../src/lib/seo.ts#L4), robots, sitemap) ya es dinámica vía env.
- El script [scripts/build-sw.mjs](../../scripts/build-sw.mjs) genera `public/sw.js` desde `public/sw.template.js` — es el sitio correcto para inyectar la lista de hosts dev sin duplicarla.

## Decisiones tomadas (Fase 0)

| # | Decisión | Resolución |
|---|---|---|
| 0.1 | Coexistencia | **30 días con redirect 301** desde `feldescloud.com` → `raizdirecta.es`. Cleanup PR a los 60 días. |
| 0.2 | Subdominios | apex `raizdirecta.es` (prod) + `www` redirect 301 + `dev.raizdirecta.es` + `staging.raizdirecta.es` reservado. |
| 0.3 | Branding `mercadoproductor.es` | **Eliminar** del repo (sólo aparece en 4 emails de [src/app/(public)/contacto/page.tsx:40-71](../../src/app/(public)/contacto/page.tsx#L40-L71)). |
| 0.4 | Staging | **"Minimal staging"**: DNS reservado + Google OAuth + tunnel listo, pero sin app/BD desplegada hasta que haga falta. |
| 0.5 | Resend | Dominio nuevo verificado, mantener `feldescloud.com` verificado durante coexistencia. |
| 0.6 | Google OAuth | **Misma client ID**, sólo añadir nuevas redirect URIs (evita re-consentimiento de usuarios actuales). |
| 0.7 | Estado del dominio | Sin registrar todavía a fecha de hoy — Fase 1 lo registra en Cloudflare. |

---

## Fase 1 — DNS y dominio (Cloudflare dashboard, ~30 min)

Sin código. Resultado al final: `https://raizdirecta.es` y `https://dev.raizdirecta.es` resuelven con TLS válido.

1. Registrar `raizdirecta.es` (Cloudflare Registrar, ~10 €/año)
2. En Cloudflare → **Add Site** → `raizdirecta.es`. SSL/TLS mode: **Full (strict)**
3. Crear registros DNS (todos `proxied=ON` salvo notas):
   - `raizdirecta.es` (apex) → CNAME al UUID del tunnel prod (`<uuid>.cfargotunnel.com`)
   - `www.raizdirecta.es` → CNAME a `raizdirecta.es`. **Page Rule** "Forwarding URL 301" → `https://raizdirecta.es/$1`
   - `dev.raizdirecta.es` → CNAME al UUID del tunnel dev (`<uuid>.cfargotunnel.com`)
   - `staging.raizdirecta.es` → CNAME a `raizdirecta.es` por ahora (basta con devolver 200 para validar Google OAuth)
4. SPF/DKIM/DMARC se añaden en **Fase 3.2** (Resend genera los TXT exactos)
5. Verificación: `dig raizdirecta.es +short` resuelve a Cloudflare; `curl -I https://raizdirecta.es` da TLS válido (502 esperado mientras el tunnel no enrute)

---

## Fase 2 — Cloudflare Tunnels (~15 min)

Estrategia: **reutilizar tunnels existentes**, sólo añadir hostnames nuevos. Así no se rotan tokens (`CLOUDFLARE_TUNNEL_TOKEN` en [.env.production.example:29](../../.env.production.example#L29) no cambia).

**2.1 Tunnel dev (laptop, `marketplace-dev`)**: Cloudflare Zero Trust → Networks → Tunnels → `marketplace-dev` → Public Hostnames:
- **Añadir** `dev.raizdirecta.es` → `http://localhost:3001`
- **Mantener** `dev.feldescloud.com` → `http://localhost:3001` durante coexistencia

**2.2 Tunnel prod**: Mismo patrón — añadir `raizdirecta.es` apuntando al backend interno, mantener `feldescloud.com`.

**2.3 Tunnel staging**: NO crear todavía. Cuando se materialice: tunnel nuevo `marketplace-staging` con su propio token.

**Coste:** 0 €. Cloudflare Tunnels son gratis.

---

## Fase 3 — Proveedores externos (~1 h, paralelo)

### 3.1 Google OAuth (Cloud Console)

Runbook: [docs/auth/google-setup.md](../auth/google-setup.md). Pasos:

- OAuth consent screen → **Authorized domains**: añadir `raizdirecta.es` (mantener `feldescloud.com`)
- Credentials → OAuth 2.0 Client ID → **Authorized redirect URIs**: añadir SIN borrar las viejas:
  - `https://raizdirecta.es/api/auth/callback/google`
  - `https://staging.raizdirecta.es/api/auth/callback/google`
  - `https://dev.raizdirecta.es/api/auth/callback/google`
- Verificar: `curl -sI https://raizdirecta.es/api/auth/callback/google` → 405 (esperado)

### 3.2 Resend

- Domains → Add Domain → `raizdirecta.es`
- Crear los TXT (SPF, DKIM x2, DMARC) en Cloudflare DNS con los valores que da Resend
- Crear identidades: `no-reply@`, `soporte@`, `hola@`, `productores@`, `legal@` (alias hacia bandeja real)
- Mantener `feldescloud.com` verificado durante coexistencia

### 3.3 Stripe

- Webhooks → Endpoint → editar URL → `https://raizdirecta.es/api/webhooks/stripe` (verificar el path real)
- **No rota `whsec_…`** al cambiar la URL — secret existente sigue valiendo
- Si hay payment links con redirect URLs cableadas en Stripe Dashboard: actualizarlas

### 3.4 PostHog

- Project Settings → **Authorized URLs**: añadir `https://raizdirecta.es`, `https://dev.raizdirecta.es`, `https://staging.raizdirecta.es`. Mantener feldescloud durante coexistencia.

### 3.5 Sentry

Sin cambios — DSN no depende del dominio. Cuando se introduzca `APP_ENV` (Fase 5), Sentry empieza a separar entornos automáticamente.

### 3.6 Telegram + Sendcloud

- Telegram: nada (token + sidecar son independientes del dominio)
- Sendcloud: comprobar webhook URL en panel; si es absoluta, repuntar a `raizdirecta.es`

---

## Fase 4 — Cambios en el repo (≤4 PRs pequeños)

Patrón guía: `NEXT_PUBLIC_APP_URL` ya cubre el 90% (SEO, og, sitemap, robots). El plan elimina los hardcodes residuales y los promueve a env vars o constantes — **no introduce nuevos hardcodes**.

### PR 1 — Refactor: hardcodes residuales → env vars

Sin cambio de comportamiento. Tests pasan apuntando todavía a feldescloud (sólo cambia la fuente: literal → env con default = literal viejo).

**Cambios:**

1. [src/lib/env.ts](../../src/lib/env.ts) — añadir:
   ```ts
   APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
   SUPPORT_EMAIL: z.string().email().default('soporte@example.com'),
   ```
   Exportar `appEnv` y `supportEmail` en `getServerEnv()`.

2. [src/app/(auth)/login/link/actions.ts:202](../../src/app/(auth)/login/link/actions.ts#L202) — `supportEmail: 'soporte@feldescloud.com'` → `getServerEnv().supportEmail`.

3. [next.config.ts:114](../../next.config.ts#L114) — extraer la lista de tunnel hosts:
   ```ts
   const devTunnelHosts = (process.env.DEV_TUNNEL_HOSTS ?? '*.raizdirecta.es,*.feldescloud.com').split(',')
   // ...
   allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local', '*.trycloudflare.com', ...devTunnelHosts]
   ```

4. **Service Worker** — la lista `DEV_HOSTNAMES` está hardcodeada en [public/sw.template.js:63-67](../../public/sw.template.js#L63-L67) y se renderiza por [scripts/build-sw.mjs](../../scripts/build-sw.mjs). Añadir un placeholder `__DEV_HOSTNAMES__` en el template y hacer que `build-sw.mjs` lo sustituya con `process.env.DEV_TUNNEL_HOSTS` (o el default), de forma análoga a como ya inyecta `SW_VERSION`. Mantener default = `'localhost,127.0.0.1,dev.raizdirecta.es,dev.feldescloud.com'` durante coexistencia.

5. Comentarios sin valor runtime: [src/proxy.ts](../../src/proxy.ts), [next.config.ts:112](../../next.config.ts#L112), grep `feldescloud` en `src/` para limpiar.

**Tests a actualizar (data fixtures, no aserciones):**
- [test/contracts/mobile-ux.test.ts:574,579](../../test/contracts/mobile-ux.test.ts#L574) — assert ahora valida que el SW mencione `dev.raizdirecta.es` (o ambos durante coexistencia)
- [test/features/email-account-linked.test.ts:25-26](../../test/features/email-account-linked.test.ts#L25)
- [test/features/auth-config.test.ts:14](../../test/features/auth-config.test.ts#L14)
- [test/features/proxy.test.ts](../../test/features/proxy.test.ts) — varios sites

### PR 2 — Branding `mercadoproductor.es` → `raizdirecta.es`

[src/app/(public)/contacto/page.tsx:40-71](../../src/app/(public)/contacto/page.tsx#L40-L71) — sustituir los 4 emails:
- `hola@mercadoproductor.es` → `hola@raizdirecta.es`
- `soporte@mercadoproductor.es` → `soporte@raizdirecta.es`
- `productores@mercadoproductor.es` → `productores@raizdirecta.es`
- `legal@mercadoproductor.es` → `legal@raizdirecta.es`

Verificar con `grep -rn mercadoproductor src/ docs/` que no queda nada más.

### PR 3 — Docs

Sin riesgo runtime, review trivial:

- [docs/auth/google-setup.md](../auth/google-setup.md) líneas 13, 21-23, 61: 3 redirect URIs + curl
- [docs/runbooks/dev-tunnel.md](dev-tunnel.md): todo el archivo, renombrar host
- [docs/pwa.md](../pwa.md): URL ejemplo
- [.env.example](../../.env.example), [.env.production.example](../../.env.production.example) líneas 2-4: defaults
- Este mismo `domain-migration.md`

### PR 4 — `APP_ENV` y consumidores (Fase 5 implementación)

Aplica `APP_ENV` introducido en PR 1:

- [src/lib/sentry/config.ts](../../src/lib/sentry/config.ts) — `environment` deducido pasa a leer `getServerEnv().appEnv` con fallback a `SENTRY_ENVIRONMENT`
- [src/lib/posthog.ts](../../src/lib/posthog.ts) (cliente y server): añadir `app_env` como property en cada `capture()`
- [src/app/robots.ts](../../src/app/robots.ts): si `appEnv === 'staging'` devolver `Disallow: /` (no indexar staging si llega a existir)
- (Opcional) Banner visual amarillo en staging — 1 componente condicionado a `appEnv === 'staging'`
- `.env.example` y `.env.production.example`: documentar `APP_ENV`, `SUPPORT_EMAIL`, `DEV_TUNNEL_HOSTS`
- (Opcional) Crear `.env.staging.example` con valores plantilla

**Si PR 4 es demasiado grande**, partirlo en 4a (introducir APP_ENV en env.ts + Sentry) y 4b (PostHog + robots + banner).

---

## Fase 5 — Modelo dev / staging / producción

### 5.1 Archivos `.env.*`

| Archivo | Tracked | Propósito |
|---|---|---|
| `.env` | sí | Casi vacío, defaults seguros |
| `.env.example` | sí | Documentación + defaults dev local |
| `.env.local` | **no** | Overrides del laptop. Apunta a `dev.raizdirecta.es` |
| `.env.production.example` | sí | Plantilla del `.env.production` que vive en el host (NO comiteado) |
| `.env.staging.example` | sí | Plantilla análoga para staging |
| `.env.test` | sí | Tal cual |

### 5.2 La variable `APP_ENV`

`NODE_ENV` sólo distingue `development`/`production`/`test`. Staging y prod son ambos `production` desde Next.js. `APP_ENV` es el eje ortogonal:

| Entorno | `NODE_ENV` | `APP_ENV` |
|---|---|---|
| Laptop dev | `development` | `development` |
| Host prod | `production` | `production` |
| Staging futuro | `production` | `staging` |

### 5.3 BD por entorno

- Producción: `marketplace` — sin cambios.
- Staging real (cuando exista): BD nueva `marketplace_staging` en el mismo cluster Postgres. Pros: backups pgBackRest cubren el cluster entero. Contras: peso de B2. Mitigación: pre-tracción la BD será pequeña.
- Seed de staging: empezar vacía + script de seeds. Cuando haya datos prod sensibles, snapshot → scrub → restore semanal.

### 5.4 CI/CD

**Pre-tracción no se automatiza deploy.** [AGENTS.md](../../AGENTS.md) exige justificación de negocio para cada nuevo proveedor o pipeline. El deploy manual (`git pull && docker compose up -d --build`) es suficiente. Si más adelante duele, se monta GitHub Actions.

### 5.5 Coste mensual incremental

| Item | €/mes |
|---|---|
| Cloudflare Registrar `.es` | ~0,8 |
| Cloudflare DNS + Tunnels | 0 |
| Resend (segundo dominio mismo plan) | 0 |
| Sentry/PostHog environment dimension | 0 |
| Postgres staging (BD extra mismo cluster) | 0 |
| **Total** | **~1 €/mes** |

---

## Fase 6 — Cutover (ventana ~30-60 min)

**Pre-requisitos:** Fases 1-3 completas. PRs 1-3 (mínimo) mergeados a main.

**Pre-cutover (T-1 día):**
- [ ] `dig raizdirecta.es` y `curl -I https://raizdirecta.es` desde 2 redes — TLS válido
- [ ] Resend dashboard: dominio en estado **Verified**
- [ ] Google OAuth: las 3 redirect URIs nuevas listadas
- [ ] PR 1, 2, 3 mergeados; build prod local ok
- [ ] Backup BD reciente (`scripts/db/backup.sh`) verificado
- [ ] Bandeja `soporte@raizdirecta.es` recibe correo de prueba real

**Cutover (T0):**
1. SSH al host prod
2. `git pull origin main`
3. Editar `/etc/marketplace/.env.production`:
   ```
   APP_HOST=raizdirecta.es
   AUTH_URL=https://raizdirecta.es
   NEXT_PUBLIC_APP_URL=https://raizdirecta.es
   EMAIL_FROM=no-reply@raizdirecta.es
   SUPPORT_EMAIL=soporte@raizdirecta.es
   APP_ENV=production
   ```
4. `docker compose -f docker-compose.prod.yml up -d --build` — Traefik recoge el `APP_HOST` nuevo en el label
5. Verificar: `docker compose ps`, `docker compose logs --tail 100 marketplace`

**Smoke checklist post-cutover (T+10 min):**
- [ ] `https://raizdirecta.es` 200, og:url y canonical apuntan a `raizdirecta.es`
- [ ] `/sitemap.xml` lista URLs en `raizdirecta.es`
- [ ] `/robots.txt` correcto
- [ ] Login mágico email → llega y autentica (verifica Resend con dominio nuevo)
- [ ] Login Google → redirect URI nueva funciona (verifica Google OAuth)
- [ ] PWA install desde móvil
- [ ] Stripe checkout test (`4242 4242 4242 4242`) → webhook llega → `PAYMENT_CONFIRMED`
- [ ] Sentry recibe error con `environment=production`
- [ ] PostHog evento con `app_env=production`

**Plan de rollback (si falla T+30 min):**
- Revertir `.env.production` a `feldescloud.com` (mantener copia)
- `docker compose up -d --build` → Traefik recarga
- Cloudflare DNS no se revierte (los tunnels conservan ambos hostnames durante coexistencia)

---

## Fase 7 — Post-migración

**T+1 día:** Activar redirect 301 desde `feldescloud.com` → `raizdirecta.es`. Cloudflare Bulk Redirects o Page Rule (`feldescloud.com/*` → `https://raizdirecta.es/$1` 301). Mantener tunnel + cert de feldescloud activos.

**T+30 días:** Revisar PostHog (¿cuánto tráfico residual entra por feldescloud?), Sentry (¿errores con host viejo?). Si <1% y bots, programar T+60.

**T+60 días — cleanup PR:**
- Quitar `*.feldescloud.com` del default de `DEV_TUNNEL_HOSTS` ([next.config.ts](../../next.config.ts) y [scripts/build-sw.mjs](../../scripts/build-sw.mjs))
- Borrar redirect URIs viejas de Google OAuth + Authorized domains
- Borrar dominio `feldescloud.com` de PostHog Authorized URLs y de Resend
- Borrar las rutas `feldescloud.com` y `dev.feldescloud.com` de los Cloudflare Tunnels
- Decidir: renovar 1 año más `feldescloud.com` (manteniendo redirect) o soltar
- Test de contrato: añadir uno que falle si aparece `feldescloud` en `src/`

**Métricas a vigilar durante coexistencia:**
- 404s entrantes (Cloudflare Analytics)
- `OAuthCallbackError` en Sentry
- Bounce rate en Resend
- Distribución de `$host` en PostHog

---

## Verificación end-to-end

Después de **PR 1** (refactor): `npm run typecheck && npm run lint && npm run test` deben pasar sin cambios funcionales.

Después de **Fase 1-3** (DNS + tunnels + proveedores): manualmente desde el laptop, abrir `https://dev.raizdirecta.es` cuando `next dev -p 3001` esté corriendo → debe servir la app idéntica a `dev.feldescloud.com`.

Después del **cutover**: ejecutar el smoke checklist de Fase 6 paso a paso. Cada checkbox es un test manual concreto.

Después del **cleanup T+60**: `grep -rn feldescloud src/ public/ docs/ test/` debe dar 0 resultados (o sólo en archivos históricos como CHANGELOG si los hay).

---

## Resumen ejecutivo: línea de tiempo

| Día | Acción |
|---|---|
| D-7 | Decisiones Fase 0 confirmadas. Cloudflare Registrar. Resend domain submitted. |
| D-5 | DNS propagado. Resend verified. Google OAuth con redirect URIs nuevas. PR 1 en review. |
| D-3 | PR 1 mergeado. PR 2 + PR 3 en review. |
| D-1 | PR 2, 3 mergeados. Backup BD. Smoke local. |
| **D0** | **Cutover** — `.env.production`, rebuild, smoke checklist. |
| D+1 | Activar redirect 301 desde feldescloud. |
| D+7 | PR 4 (APP_ENV consumidores) mergeado y desplegado. |
| D+30 | Revisar tráfico residual. |
| D+60 | Cleanup PR — eliminar referencias a feldescloud. |

---

## Critical Files

- [next.config.ts](../../next.config.ts) — `allowedDevOrigins`, `images.remotePatterns`
- [src/lib/env.ts](../../src/lib/env.ts) — añadir `APP_ENV`, `SUPPORT_EMAIL`
- [src/app/(auth)/login/link/actions.ts](../../src/app/(auth)/login/link/actions.ts) — línea 202 hardcode soporte
- [public/sw.template.js](../../public/sw.template.js) + [scripts/build-sw.mjs](../../scripts/build-sw.mjs) — DEV_HOSTNAMES inyectado en build
- [src/app/(public)/contacto/page.tsx](../../src/app/(public)/contacto/page.tsx) — emails mercadoproductor.es
- [.env.production.example](../../.env.production.example) — defaults
- [src/lib/sentry/config.ts](../../src/lib/sentry/config.ts) — environment dedution
- [docs/auth/google-setup.md](../auth/google-setup.md), [docs/runbooks/dev-tunnel.md](dev-tunnel.md) — runbooks que mencionan el dominio

---

## Progress log

Snapshot del estado de ejecución. Mantener al día cuando se cierre cada issue.

| Fase | Issue | Estado | Notas |
|---|---|---|---|
| Fase 1 — DNS y dominio | [#1062](https://github.com/juanmixto/marketplace/issues/1062) | en progreso | Cloudflare Registrar + zona + tunnels apuntando a `raizdirecta.es` y `dev.raizdirecta.es` (operación manual, sin código). |
| Fase 3.1 — Google OAuth redirect URIs | [#1064](https://github.com/juanmixto/marketplace/issues/1064) | en progreso | Añadir las 3 redirect URIs `*.raizdirecta.es` sin borrar las viejas (misma client ID — evita re-consentimiento). |
| Fase 4 — PR 1 (refactor hardcodes → env) | [#1065](https://github.com/juanmixto/marketplace/issues/1065) / [#1087](https://github.com/juanmixto/marketplace/pull/1087) | PR abierta | Introduce `APP_ENV`, `SUPPORT_EMAIL`, `DEV_TUNNEL_HOSTS` en `src/lib/env.ts`. Sin cambio de comportamiento (defaults = literales viejos durante coexistencia). |
| Fase 4 — PR 3 (docs + env templates) | [#1067](https://github.com/juanmixto/marketplace/issues/1067) | PR abierta | Este PR. Renombra `dev.feldescloud.com` → `dev.raizdirecta.es` en runbooks y plantillas; documenta los nuevos env vars introducidos por #1087. |
| Fase 4 — PR 2 (branding `mercadoproductor.es` → `raizdirecta.es`) | [#1071](https://github.com/juanmixto/marketplace/issues/1071) | abierta sin PR | Sustituir los 4 emails en `src/app/(public)/contacto/page.tsx`. |
| Fase 4 — PR 4 (`APP_ENV` consumidores) | (pendiente) | abierta sin PR | Sentry/PostHog/robots.ts. Bloqueada por #1087. |
| Fase 6 — Cutover | (pendiente) | abierta sin PR | Editar `.env.production` en el host + rebuild. Bloqueada por todo lo anterior. |

