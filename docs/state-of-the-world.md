---
summary: Estado operativo en vivo (hostnames, deploys, kill switches, ramas raras). Lo que NO se deduce del código y caduca rápido.
audience: cualquier agente al arrancar
read_when: siempre (≤ 5 min); especialmente antes de tocar deploy, dominios, o flags
---

# Estado del mundo (operativo, no técnico)

Este fichero es **lectura obligatoria al arrancar una sesión**. Captura lo que es ambiental y no se deduce del código:
qué hay en producción ahora mismo, qué hostnames están vivos, qué kill switches están puestos a mano, qué deploys
existen y cuál es el último incidente en curso.

> **Regla de oro:** si cambias el estado del mundo (cutover de dominio, primer deploy de un servicio, kill switch
> activado a mano, secret rotado) **actualiza este fichero en el mismo PR**. Si no cabe en 100 líneas es porque hay
> cosas que ya no son "estado actual" — muévelas a `docs/runbooks/` o bórralas.

Última actualización: **2026-05-04** — cuando edites, pon la fecha y firma con tu agente.

---

## Infraestructura física

- **Todo corre en el mismo nodo Proxmox** (`whisper`), 24/7, **single-node**. Producción, dev preview, sesiones de agentes y bases de datos comparten host físico. No es alta disponibilidad: si el nodo cae, todo cae con él. Los runbooks de failover (`docs/runbooks/db-failover.md`) describen Phase 0 = restore desde backup, no failover automático — coherente con la realidad single-node.
- **El usuario se conecta por SSH desde Windows** (host alias `whisper` → `192.168.1.76`). El laptop del usuario NO es el servidor; es solo el cliente desde donde abre sesiones.
- **Las sesiones de agentes (Claude, Codex) corren EN el nodo de prod**, no en una máquina aparte. Cualquier comando destructivo (`docker compose down`, `rm -rf`, `git reset --hard` mal apuntado) puede tumbar prod en directo. Filtra siempre por compose project antes de operaciones destructivas.

## Hostnames vivos

| Host                  | Sirve                                  | Compose project    | Tunnel              | Notas |
|-----------------------|----------------------------------------|--------------------|---------------------|-------|
| `raizdirecta.es`      | **producción**                         | `marketplaceprod`  | `marketplace-prod`  | levantada 2026-05-03 |
| `dev.raizdirecta.es`  | dev preview (puerto 3001)              | (sin compose, `next dev` directo) | `marketplace-dev` | cutover desde `dev.feldescloud.com` el 2026-05-03 |
| `*.feldescloud.com`   | coexistencia legacy 30 días post-cutover | (igual que dev)  | `marketplace-dev`   | borrar tras T+30; ver `docs/runbooks/domain-migration.md` |

Si un hostname nuevo aparece, añádelo aquí **antes** de cerrar el PR que lo monta.

## Producción

- **Existe desde:** 2026-05-03.
- **Despliegue canónico:** `npm run deploy:prod` (= `scripts/deploy-local-env.sh production`). Ese script construye la imagen Docker con las vars `NEXT_PUBLIC_COMMIT_SHA / GIT_BRANCH / BUILD_TIME` inyectadas (sin ellas el `BuildBadge` mostraría "unknown" — fix en #1135 + #1138), corre `prisma migrate deploy`, recrea solo el contenedor `app` y verifica `https://raizdirecta.es/api/version`. Runbook completo: [`docs/runbooks/release-promotion.md`](runbooks/release-promotion.md).
- **CI de deploy:** no hay todavía. El deploy lo lanza un humano (o un agente con confirmación del usuario) en el servidor.
- **Bootstrap inicial (admin user, categorías, MarketplaceConfig):** `npm run prod:bootstrap` (idempotente, gated por `APP_ENV=production` y password ≥16 chars). Lo ejecutó el agente Codex la primera vez.
- **Backups:** Phase 0 del epic #1002 (pgBackRest a B2 + dump lógico). Sin standby todavía. "Failover" = restore desde backup.
  Runbooks: `docs/runbooks/db-backup.md`, `docs/runbooks/db-restore.md`, `docs/runbooks/db-failover.md`.
- **Rollback rápido:** redeploy del último SHA estable (cambia branch local en el servidor + `npm run deploy:prod`) + `kill-*` flags en PostHog para apagar features problemáticas sin redeploy.
- **Probes operativos (post-#1211):**
  - `/api/healthcheck` — **liveness**. Solo Postgres (queries por modelo). Lo que el contenedor expone para "sigo vivo".
  - `/api/ready` — **readiness**. DB + Stripe (`balance.retrieve`) + Upstash (`PING`) + pg-boss (queue size). Lo que el LB / monitor externo debería pollear. 503 cuando cualquier dependencia crítica falla; cache 5s de respuestas OK para no martillear Stripe.
  - `/api/version` — build SHA + branch + timestamp (BuildBadge / smoke deploy).

## Integraciones externas (estado)

- **PostHog reverse-proxy Worker — código en main, NO desplegado.** PR #1100 (2026-05-03) añadió `infra/cloudflare/posthog-proxy/` para que `raizdirecta.es/ingest/*` proxie a `eu.i.posthog.com` y los adblockers (Brave Shields default-on, uBlock, AdGuard) no tiren el ~10-25% de eventos. Verificado 2026-05-04: `curl https://raizdirecta.es/ingest/decide` devuelve `404` con `x-powered-by: Next.js` — la ruta de Cloudflare nunca se registró. **Mientras esto siga así, NO poner `NEXT_PUBLIC_POSTHOG_HOST=https://raizdirecta.es/ingest` en prod** (POSTearía todos los eventos al void; la SDK no reintenta 4xx). Para activar: `cd infra/cloudflare/posthog-proxy && npx wrangler login && npx wrangler deploy`, luego `scripts/verify-posthog-proxy.sh` (debe salir 0), luego setear la env var y rebuild. Verificación post-deploy: `npm run verify:posthog-proxy` (script) o `RUN_LIVE_PROXY_CHECK=1 npx tsx --test test/contracts/posthog-proxy-live.test.ts` (test). Tracking: PR #1236.
- **Vercel — pausada 2026-05-03.** La GitHub integration está desconectada (`Settings → Git → Disconnect` en el proyecto Vercel). Producción NO se despliega en Vercel; corre en Proxmox vía `npm run deploy:prod`.
  - **`Vercel: fail` en checks de PRs es ESPERADO** mientras quede algún check antiguo cacheado. NO bloquea merge — Vercel no está en branch protection.
  - **`vercel.json` se mantiene en el repo** (config inerte) por si en el futuro se reactiva. El cron `cleanup-idempotency` (`0 3 * * *` UTC) que ahí se declara está cubierto por systemd timers en whisper a partir de #1307 (units en `infra/systemd/`, runbook `docs/runbooks/host-crons.md`). **Verificar que el timer está instalado** (`systemctl list-timers raizdirecta-* --all`); si no, ejecutar `sudo bash infra/systemd/install-host-crons.sh` y anotar la fecha aquí.

## Kill switches y feature flags activos

(Solo los que estén en estado **no-default** o que importen para un incidente reciente. Para la lista completa
ver PostHog.)

- `kill-ingestion-telegram` = **true** (por defecto: ingestion off en prod hasta validar).
- `kill-ingestion-processing` = **true** (idem).
- `feat-ingestion-llm-extractor` = **false** (Phase 2.5 detrás de flag, ver `docs/ingestion/processing.md`).
- `kill-auth-social` = **false** (Google login activo en prod desde rollout social-login epic #848).

Si activas o desactivas un kill switch a mano en PostHog, **anótalo aquí** con fecha y motivo.

## Deploys / sesiones de agentes en curso

| Worktree                                   | Branch                          | Agente / propietario | Qué hace |
|--------------------------------------------|---------------------------------|----------------------|----------|
| `/home/whisper/worktrees/main-preview`     | (detached HEAD seguido de origin/main) | el laptop (dev preview) | sirve `dev.raizdirecta.es` |
| `/home/whisper/worktrees/branding-domains` | `feat/branding-domains`         | (sin sesión activa, 30 ficheros sucios) | revisar antes de tocar |

Esta tabla la rellena cada agente cuando arranca un worktree nuevo. `scripts/agents-status.sh` muestra el resto en
tiempo real (no lo dupliques aquí — solo lista trabajo "parado" o de larga duración).

## Incidentes / decisiones recientes (≤ 30 días)

- **2026-05-04** — Detectado que el Worker reverse-proxy de PostHog (#1100, mergeado 2026-05-03) nunca se desplegó: `raizdirecta.es/ingest/*` cae en Next.js. Sin impacto runtime hoy porque `NEXT_PUBLIC_POSTHOG_HOST` no apunta al proxy en prod. Añadido `scripts/verify-posthog-proxy.sh` + test live opt-in para que la siguiente vez se detecte en segundos (#1236).
- **2026-05-03 (noche)** — Sesión de coordinación inter-agentes. Cinco PRs:
  - **#1135** (mergeado + desplegado): fix `BuildBadge` "unknown" en prod inyectando `NEXT_PUBLIC_*` vars en el build de Docker.
  - **#1136** (auto-merge ON): `agents-status.sh` sección 5 detecta commits sin pushear en el repo compartido.
  - **#1137** (mergeado): este fichero.
  - **#1138** (mergeado + desplegado): promueve a `origin/main` los scripts de deploy del agente Codex (`scripts/deploy-local-env.sh`, `scripts/prod-bootstrap.ts`, runbook `release-promotion.md`) que solo existían en su commit local sin pushear `596ec124`.
  - **#1139** (mergeado): Stop hook end-of-turn + plantilla de notas de sesión `.claude/sessions/`.
- **2026-05-03 (noche)** — Vercel pausado a nivel GitHub integration (ver "Integraciones externas" arriba). Producción no estaba en Vercel, así que sin impacto runtime; el cambio elimina el ruido del check `Vercel: fail` en PRs.
- **2026-05-03 (mañana)** — Cutover dev `dev.feldescloud.com` → `dev.raizdirecta.es`.

Cuando algo aquí supera 30 días sin ser relevante, muévelo a su runbook o bórralo.

---

**¿Qué NO va aquí?** Convenciones de código, arquitectura, recetas de debugging — eso ya está en `CLAUDE.md`,
`docs/conventions.md`, `docs/runbooks/*`. Aquí solo lo que es **estado vivo** y caducaría si lo escondes en un doc largo.
