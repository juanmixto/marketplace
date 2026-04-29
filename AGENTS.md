<!-- BEGIN:nextjs-agent-rules -->
# Agente: lee esto antes de tocar nada

Este repo es un **marketplace digital curado** de productores artesanales. La infraestructura técnica está descrita más abajo (Next.js, multi-agente, etc.). Pero antes del código, el contexto **de negocio y producto** es obligatorio:

## Contexto obligatorio antes de trabajar

Lee **siempre** la sección "Hacer / No hacer" inmediatamente abajo (parte de este `AGENTS.md`).

**Solo si tu tarea toca producto, negocio, UX, copy, catálogo, productores, checkout u onboarding** lee también:

- [`docs/AGENT-CONTEXT.md`](docs/AGENT-CONTEXT.md) — destilado denso de decisiones (ADR-001..009), prioridades, flujos críticos, anti-patrones. Sustituye al "abre 3 índices + un fichero".

**Si tu tarea es técnica pura (refactor, bugfix, infra, CI, tests, dependencias) NO lo abras** — `AGENTS.md` + las convenciones técnicas listadas más abajo bastan. Cargarlo te cuesta ~2.5k tokens sin aportarte nada (medido, no estimado).

Para cualquier tarea con scope concreto, el reading list mínimo:

```bash
scripts/agent-context.sh <task-type>      # imprime la lista mínima de archivos a leer
scripts/agent-context.sh                  # lista de task types disponibles
```

Cada doc largo en `docs/business/`, `docs/product/` y `docs/runbooks/` empieza con frontmatter `summary:` / `audience:` / `read_when:`. Lee con `Read limit: 10` para ver el resumen sin cargar todo el archivo; abre completo solo si tu tarea encaja con `read_when:`.

## Estado actual del marketplace (resumen para agentes)

- **Etapa**: pre-tracción. Catálogo pequeño y curado. La prioridad es **validar demanda real**, no escalar.
- **Productores**: artesanales, pocos, seleccionados a mano. Cada uno se contacta de forma personal.
- **Usuarios objetivo**: compradores que valoran origen, calidad y confianza por encima de precio.
- **Plataforma dominante**: móvil. La conversión móvil manda sobre la desktop.
- **Lo que NO somos**: Amazon, ni un agregador, ni un dropshipper. No competimos en surtido ni en precio.

## Hacer / No hacer (regla de decisión rápida)

**Hacer:**
- Priorizar **confianza** (fichas claras, fotos reales, origen verificable, copy honesto).
- Priorizar **conversión móvil** (latencia, tap targets, formularios cortos, checkout sin fricciones).
- Priorizar **validación de demanda** (medir, no construir): un experimento manual antes que una abstracción.
- Cerrar el bucle: cada cambio en el catálogo o en checkout debe poder medirse (PostHog).
- Documentar la decisión de negocio detrás de cada feature no trivial en `docs/business/09-decisiones-estrategicas.md`.

**No hacer:**
- No añadir features que asumen tracción que aún no existe (recomendadores, programas de fidelización, multi-currency, multi-país, marketplace B2B, etc.).
- No construir abstracciones para "futuros productores" hipotéticos. Tres productores parecidos NO justifican un framework.
- No tocar copy de productor / fichas / checkout sin leer `docs/product/02-flujos-criticos.md` y `docs/business/07-copy-contacto-productores.md`.
- No introducir nuevos proveedores externos (pagos, email, push, analytics) sin justificación en `docs/business/09-decisiones-estrategicas.md`.
- No crear tablas / campos / endpoints "por si acaso". Cada nuevo modelo Prisma necesita una pregunta de negocio que responda.

## Criterios para decidir si una feature tiene sentido

Una feature solo entra al backlog si responde **sí** a las cuatro:

1. **¿Mueve una métrica que importa hoy?** (conversión móvil, productor activado, pedido completado, repetición). Si la métrica es "engagement genérico" o "DAU", no.
2. **¿Existe el problema con el catálogo y los pedidos actuales?** Si solo aparece "cuando tengamos 10× productores", aplázala.
3. **¿El coste de NO hacerla es real?** (pérdida medible de pedidos, abandono observado, queja repetida de productor). Si es teórico, aplázala.
4. **¿La versión más barata posible cabe en ≤ 1 PR?** Si necesita epic multi-PR antes de validar, parte primero la versión manual / wizard-of-oz.

Si una de las cuatro es "no", la feature **no se construye**: se documenta en `docs/business/08-roadmap-negocio.md` como hipótesis pendiente de validar.

## Prioridades actuales (orden, no lista)

1. **Confianza visible**: ficha de producto y de productor que un comprador frío entendería en 10 s.
2. **Checkout móvil sin fricciones**: cada paso eliminado vale más que cualquier feature nueva.
3. **Onboarding de productor**: que un productor real pueda publicar sin intervención manual del equipo.
4. **Medición de demanda**: PostHog en los flujos críticos antes de optimizar nada.
5. **Operaciones (logística, atención)**: manuales hasta que duela; automatizar solo cuando duele.

Todo lo demás (recomendadores, búsqueda avanzada, reviews, programas de afiliados, app nativa) está **fuera** hasta que estas cinco estén verdes.

---

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Before your first tool call (multi-agent contract)

This repo is shared by several Claude Code agents at the same time. Skip this checklist and you will silently overwrite somebody else's WIP. The 2026-04-12 hygiene incident lost real work because of exactly this.

1. **`pwd`** — confirm you are NOT in `/home/whisper/marketplace`. That repo is shared infrastructure; agents work in worktrees, not in main.
2. **If you ARE in `/home/whisper/marketplace`:** create a worktree from `origin/main` (`git fetch origin main && git worktree add /home/whisper/worktrees/<task-slug> -b <prefix>/<slug> origin/main`) and `cd` into it. Do not `git checkout` here — another agent's branch is probably checked out.
3. **`git status` in your worktree** — must be clean. If it shows uncommitted changes you didn't make, **stop and tell the user**; another agent left WIP and you must not stomp on it. Never `git stash` somebody else's working tree to "make room".
4. **`scripts/agents-status.sh`** — single command that surveys all active worktrees, dirty WIP, stashes (flagging anything >24h per workflow rules), and listening dev servers. Read it once at session start to know what other agents have open before forking work that will conflict at merge time.

### Structural enforcement (active 2026-04-26)

A guard wrapper at `~/.local/bin/git` (installed on the laptop) actively blocks HEAD-moving and working-tree-mutating subcommands inside `/home/whisper/marketplace` when invoked by an agent (detected via `CLAUDE_CODE_SESSION_ID` env var):

- **Blocked:** `checkout`, `switch`, `reset`, `restore`, `stash`, `merge`, `rebase`, `pull`, `cherry-pick`, `revert`, `am`
- **Allowed:** `fetch`, `worktree add/remove/list`, `log`, `status`, `diff`, `show`, `branch -l`, `remote`, etc.
- **Scope:** only the main repo path. Worktrees under `/home/whisper/worktrees/*` and any other repo are unaffected.
- **Bypass:** if you genuinely need to override (emergency recovery, after explicit user confirmation), prefix one command with `CLAUDE_AGENT_BYPASS=1`.
- **Humans:** never affected. The guard only fires when `CLAUDE_CODE_SESSION_ID` is in the environment.

Wrapper source: `~/.local/bin/git`. The wrapper is part of the laptop setup, not committed to the repo.

For the full policy and rationale see [`docs/git-workflow.md`](docs/git-workflow.md). For branch naming see the same doc § "Allowed branch prefixes". For deeper hygiene signals (gone branches, stale worktrees) run `scripts/git-hygiene.sh`.

## Conventions

- **Project conventions (stack, imports, Prisma fields, server-action pattern)** — see [`docs/conventions.md`](docs/conventions.md). Read this before implementing any ticket.
- **Database conventions (FK `onDelete`, paginated `findMany`, Decimal vs Int money, webhook idempotency, `$transaction` timeouts, indexes, Json snapshots, account-erase contract)** — see [`docs/db-conventions.md`](docs/db-conventions.md). Required reading before adding a Prisma model, a relation into User/Order/Vendor, a server-side `findMany`, a webhook handler, or a money column. Two rules are CI-enforced via [`scripts/audit-fk-onDelete.mjs`](scripts/audit-fk-onDelete.mjs) and [`scripts/audit-unbounded-findMany.mjs`](scripts/audit-unbounded-findMany.mjs); both ratchet against a baseline so net-new violations fail the build without forcing a sweep.
- **AI guidelines (contract rules, domain boundaries, enforcement)** — see [`docs/ai-guidelines.md`](docs/ai-guidelines.md). Rules for parallel agents. Enforced by [`scripts/audit-domain-contracts.mjs`](scripts/audit-domain-contracts.mjs).
- **AI workflows (recipes)** — see [`docs/ai-workflows.md`](docs/ai-workflows.md) for how to add a feature, refactor safely, or change a contract.
- **i18n** — see [`src/i18n/README.md`](src/i18n/README.md) for when to use flat keys vs `*-copy.ts` modules and the `labelKey` server pattern.
- **Git workflow (trunk-based, branch prefixes, hygiene)** — see [`docs/git-workflow.md`](docs/git-workflow.md). `main` is the only long-lived branch; no `integration/*`, `develop`, `next`. Run `scripts/git-hygiene.sh` periodically.
- **PWA (service worker, manifest, install prompts, offline fallback, cache allow-list)** — see [`docs/pwa.md`](docs/pwa.md). Required reading before touching `public/sw.js`, `src/app/manifest.ts`, or anything under `src/components/pwa/`. The SW has a strict denylist (`/api`, `/admin`, `/vendor`, `/checkout`, `/auth`) that must never be weakened.
- **CI incident runbook (main red, branch-protection bypass shapes, page-snapshot recipe)** — see [`docs/runbooks/ci-incident.md`](docs/runbooks/ci-incident.md). Read when `gh run list --workflow=ci.yml --branch=main` shows a recent failure. Covers the aggregator-SKIPPED-as-neutral bypass that shipped #1037 + #1040 + #1043 with red shards on 2026-04-29, the doc-only PR passthrough contract, and the "page snapshot beats log grep" diagnostic shortcut. Pairs with [`docs/branch-protection.md`](docs/branch-protection.md) § Aggregator gate pattern.
- **Payment incidents runbook (checkout + webhook log events, investigation recipes)** — see [`docs/runbooks/payment-incidents.md`](docs/runbooks/payment-incidents.md). Read before renaming any `checkout.*` or `stripe.webhook.*` log scope; oncall queries depend on them.
- **DB backup + restore (pgBackRest + logical dump on B2, Healthchecks)** — see [`docs/runbooks/db-backup.md`](docs/runbooks/db-backup.md) and [`docs/runbooks/db-restore.md`](docs/runbooks/db-restore.md). Read before touching `infra/pgbackrest/`, `infra/postgres/`, `scripts/db/`, or the `db` service in `docker-compose.prod.yml`. Phase 0 of epic #1002. Templates render to live secrets via Bitwarden — never commit a rendered config.
- **DB failover + data corruption (incident playbooks)** — see [`docs/runbooks/db-failover.md`](docs/runbooks/db-failover.md) and [`docs/runbooks/db-data-corruption.md`](docs/runbooks/db-data-corruption.md). Phase 0 = no standby; "failover" today means *restore* (placeholder for Phase 1). The corruption checklist is 12 steps; never `pg_resetwal` / `REINDEX` / `VACUUM FULL` before snapshotting.
- **Checkout idempotency (`checkoutAttemptId`, double-submit dedupe, replay UX)** — see [`docs/checkout-dedupe.md`](docs/checkout-dedupe.md). Required reading before changing `createOrder` / `createCheckoutOrder` signatures or the `Order.checkoutAttemptId` UNIQUE constraint.
- **Generic idempotency tokens (admin/vendor forms, `IdempotencyKey` table, `withIdempotency` wrapper)** — see [`docs/idempotency.md`](docs/idempotency.md). Generalizes the checkout pattern to any mutation form. Pages that issue tokens MUST be `force-dynamic`. Wrapped actions still need their own role/ownership checks (see `docs/authz-audit.md`); idempotency does not replace authz. Foundation shipped in #788 PR-A; rollout to remaining forms in PR-B.
- **OrderEvent vs WebhookDelivery (post-#308 separation of concerns)** — see [`docs/orderevent-vs-webhookdelivery.md`](docs/orderevent-vs-webhookdelivery.md). Read before adding a webhook source or reusing `OrderEvent.payload` for dedupe; the UNIQUE lives on `WebhookDelivery`, not on `OrderEvent`.
- **State machines (Order / Payment / Fulfillment / Shipment transitions and their guards)** — see [`docs/state-machines.md`](docs/state-machines.md). Read before adding or renaming a status value, wiring a new webhook handler, or changing any `isValidTransition` / `shouldApply*` predicate; the guards and the doc must move together.
- **Sentry error tracking (DSN, scrubber, correlation)** — see [`src/lib/sentry/`](src/lib/sentry/) + [`sentry.server.config.ts`](sentry.server.config.ts). Every new pattern added to `src/lib/sentry/scrubber.ts` MUST come with a test in `test/features/sentry-scrubber.test.ts` proving the PII class is caught. PII leak via Sentry is a GDPR exposure.
- **Resource-level authorization (role + ownership checklist, guard helpers, cross-tenant negative-test registry)** — see [`docs/authz-audit.md`](docs/authz-audit.md). Read before adding any server action or route handler. Route-level gating is not enough; every sensitive mutation must scope its Prisma query by caller id and ship at least one cross-tenant negative test.
- **Branch protection & required checks (canonical list, rules, audit command)** — see [`docs/branch-protection.md`](docs/branch-protection.md). Update alongside the GitHub ruleset when adding/renaming a blocking workflow job; a renamed job with no ruleset update silently disables the gate.
- **Under-attack / WAF runbook (Cloudflare config, rate-limit rules, edge playbook)** — see [`docs/runbooks/under-attack.md`](docs/runbooks/under-attack.md). Read before touching `src/lib/ratelimit.ts` or `src/lib/audit.ts` client-IP resolution; both prefer `cf-connecting-ip` under the Cloudflare topology (#540) and getting that precedence wrong collapses per-IP buckets.
- **Feature flags (PostHog — kill switches + WIP gating)** — see [`docs/conventions.md`](docs/conventions.md) § Feature flags. Use `isFeatureEnabled` / `useFeatureFlag` from [`src/lib/flags.ts`](src/lib/flags.ts) and [`src/lib/flags.client.ts`](src/lib/flags.client.ts). Flags are **fail-open** by design: a PostHog outage must not tumble checkout. Naming: `kill-*` for emergency switches (default `true`), `feat-*` for WIP gates (default `false`). Every `feat-*` flag needs a 30-day cleanup ticket.
- **Telegram ingestion (raw pipeline, worker, Telethon sidecar)** — see [`docs/ingestion/telegram.md`](docs/ingestion/telegram.md). Read before touching `src/domains/ingestion/`, `src/workers/`, `src/lib/queue.ts`, or the `TelegramIngestion*` Prisma models. The subsystem is gated by `kill-ingestion-telegram` (default `true` = killed) and `feat-ingestion-admin` (default `false`); heavy work runs only in the worker process (`npm run worker`), never in Next.js request lifecycle.
- **Telegram ingestion processing (drafts, classifier, extractor, dedupe)** — see [`docs/ingestion/processing.md`](docs/ingestion/processing.md). Read before touching `src/domains/ingestion/processing/` or the `Ingestion{ExtractionResult,ProductDraft,VendorDraft,ReviewQueueItem,DedupeCandidate}` Prisma models. Rules-only in Phase 2 (LLM deferred to Phase 2.5). Gated by `kill-ingestion-processing` (default killed) + stage flags `feat-ingestion-{classifier,rules-extractor,dedupe}`. Locked contracts: confidence bands `HIGH ≥ 0.80 / MEDIUM ≥ 0.50 / LOW < 0.50`, draft idempotency key `(sourceMessageId, extractorVersion, productOrdinal)`, LOW-risk only auto-merge, review queue states limited to `ENQUEUED` + `AUTO_RESOLVED`.
- **Auth audit (Phase 0 of social login epic #848)** — see [`docs/auth/audit.md`](docs/auth/audit.md). Inventory of auth surfaces, Prisma models that depend on `User`, signed email-collision policy (matrix §4), and the list of `auth.*` PostHog events expected per phase. Read before touching `src/lib/auth*`, `src/domains/auth/`, or adding any OAuth provider. The matrix is the contract enforced by the `signIn` callback in #850.
- **Audit hygiene (verify before flagging, re-verify before fixing)** — see [`docs/audits/README.md`](docs/audits/README.md). Required reading before producing OR consuming a codebase audit. Every finding must cite a current `file:line`; before opening a PR for an audit issue, re-`Read` the cited path to confirm the finding still applies. Audits older than ~2 weeks are likely partially stale, especially in form attributes, Tailwind utilities, SW logic, and `loading.tsx` coverage. The 2026-04-25 mobile audit (#779) shipped 3 false positives out of 16 findings — that's the bar this rule exists to prevent.

<!-- END:nextjs-agent-rules -->
