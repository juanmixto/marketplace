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

Última actualización: **2026-05-03** — cuando edites, pon la fecha y firma con tu agente.

---

## Hostnames vivos

| Host                  | Sirve                                  | Tunnel                | Notas |
|-----------------------|----------------------------------------|-----------------------|-------|
| `raizdirecta.es`      | **producción**                         | `marketplace-prod`    | levantada 2026-05-03 noche; primer deploy a mano por agente Codex |
| `dev.raizdirecta.es`  | dev en el laptop (puerto 3001)          | `marketplace-dev`     | cutover desde `dev.feldescloud.com` el 2026-05-03 |
| `*.feldescloud.com`   | coexistencia legacy 30 días post-cutover | `marketplace-dev`     | borrar tras T+30; ver `docs/runbooks/domain-migration.md` |

Si un hostname nuevo aparece, añádelo aquí **antes** de cerrar el PR que lo monta.

## Producción

- **Existe desde:** 2026-05-03.
- **Cómo se despliega hoy:** `docker compose -f docker-compose.prod.yml build app && up -d` a mano en el host (no hay
  CI de deploy todavía). Las vars `NEXT_PUBLIC_COMMIT_SHA / GIT_BRANCH / BUILD_TIME` se inyectan vía
  `scripts/build-prod.sh` (PR #1135) — sin ese wrapper el `BuildBadge` muestra "unknown".
- **Bootstrap inicial (admin user, semillas):** lo hizo el agente Codex con un `scripts/prod-bootstrap.ts` local que
  **no está en `origin/main`**. Si necesitas re-bootstrapear, pregunta al usuario antes de reescribirlo.
- **Backups:** Phase 0 del epic #1002 (pgBackRest a B2 + dump lógico). Sin standby todavía. "Failover" = restore.
  Runbooks: `docs/runbooks/db-backup.md`, `docs/runbooks/db-restore.md`, `docs/runbooks/db-failover.md`.
- **Rollback rápido:** redeploy del último tag estable + `kill-*` flags en PostHog.

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

- **2026-05-03** — Primer deploy de `raizdirecta.es`. Agente Codex commiteó `596ec124 chore: standardize local
  environment deployments` a `main` local sin pushear (`scripts/deploy-local-env.sh` + `scripts/prod-bootstrap.ts`
  no están en `origin/main`). PR #1136 añade detección al `agents-status.sh` para que no vuelva a pasar en silencio.
- **2026-05-03** — `BuildBadge` mostraba "unknown" en prod por falta de inyección de vars en el build de Docker.
  Fix en PR #1135.
- **2026-05-03** — Cutover dev `dev.feldescloud.com` → `dev.raizdirecta.es`.

Cuando algo aquí supera 30 días sin ser relevante, muévelo a su runbook o bórralo.

---

**¿Qué NO va aquí?** Convenciones de código, arquitectura, recetas de debugging — eso ya está en `CLAUDE.md`,
`docs/conventions.md`, `docs/runbooks/*`. Aquí solo lo que es **estado vivo** y caducaría si lo escondes en un doc largo.
