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

Última actualización: **2026-05-03 (noche)** — cuando edites, pon la fecha y firma con tu agente.

---

## Infraestructura física

- **Producción** corre en un **servidor 24/7 con Proxmox**, **un solo nodo** a día de hoy. No es alta disponibilidad: si el nodo cae, prod cae con él. Los runbooks de failover (`docs/runbooks/db-failover.md`) describen Phase 0 = restore desde backup, no failover automático — coherente con la realidad single-node.
- **Dev** (`dev.raizdirecta.es`) corre en el **laptop del usuario**, no en el servidor. `next dev -p 3001` desde `/home/whisper/worktrees/main-preview` detrás de un Cloudflare Tunnel. Si el laptop se duerme, dev cae; prod NO se ve afectada.
- **Sesiones de agentes** corren en el laptop (incluido este). Cuando un agente lance `npm run deploy:prod`, está empujando un build local al servidor — confirma con el usuario antes de tocar prod desde una sesión de agente.

## Hostnames vivos

| Host                  | Sirve                                  | Dónde corre        | Tunnel              | Notas |
|-----------------------|----------------------------------------|--------------------|---------------------|-------|
| `raizdirecta.es`      | **producción**                         | servidor Proxmox   | `marketplace-prod`  | levantada 2026-05-03 |
| `dev.raizdirecta.es`  | dev preview (puerto 3001)              | laptop del usuario | `marketplace-dev`   | cutover desde `dev.feldescloud.com` el 2026-05-03 |
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

- **2026-05-03 (noche)** — Sesión de coordinación inter-agentes. Cinco PRs:
  - **#1135** (mergeado + desplegado): fix `BuildBadge` "unknown" en prod inyectando `NEXT_PUBLIC_*` vars en el build de Docker.
  - **#1136** (auto-merge ON): `agents-status.sh` sección 5 detecta commits sin pushear en el repo compartido.
  - **#1137** (mergeado): este fichero.
  - **#1138** (mergeado + desplegado): promueve a `origin/main` los scripts de deploy del agente Codex (`scripts/deploy-local-env.sh`, `scripts/prod-bootstrap.ts`, runbook `release-promotion.md`) que solo existían en su commit local sin pushear `596ec124`.
  - **#1139** (mergeado): Stop hook end-of-turn + plantilla de notas de sesión `.claude/sessions/`.
- **2026-05-03 (mañana)** — Cutover dev `dev.feldescloud.com` → `dev.raizdirecta.es`.

Cuando algo aquí supera 30 días sin ser relevante, muévelo a su runbook o bórralo.

---

**¿Qué NO va aquí?** Convenciones de código, arquitectura, recetas de debugging — eso ya está en `CLAUDE.md`,
`docs/conventions.md`, `docs/runbooks/*`. Aquí solo lo que es **estado vivo** y caducaría si lo escondes en un doc largo.
