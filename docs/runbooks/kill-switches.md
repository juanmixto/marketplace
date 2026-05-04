---
summary: Cuándo usar feature flag (PostHog) vs kill-switch infra-level (maintenance page). Política fail-open de PostHog y su caveat.
audience: agents,humans
read_when: incidente activo y dudas qué mecanismo usar; añades un nuevo `kill-*` flag
---

# Kill switches: feature flags vs infra

Hay dos clases de "apagador" en este proyecto. Saber cuál usar en qué momento es la diferencia entre un incidente de 5 minutos y uno de 30. Issue #1256.

## Las dos clases

### 1. Feature flags `kill-*` (PostHog)

- Vivos en PostHog, evaluados via `isFeatureEnabled` (`src/lib/flags.ts`) en server / `useFeatureFlag` en cliente.
- Naming: `kill-<area>` (default `true` en UI = "alive").
- Granularidad: pueden segmentarse por user / role / email / cohort.
- Cambio sin redeploy.
- Wired hoy en checkout (`src/domains/orders/use-cases/create-checkout-order.ts:57`). Otros flags en PostHog UI.

### 2. Maintenance page (infra)

- `docker-compose.prod.yml` profile `maintenance`. Ver `docs/runbooks/maintenance-mode.md`.
- Granularidad: todo o nada en el host completo.
- Cambio sin redeploy del app, pero requiere SSH al host.
- No depende de PostHog, Vercel, Stripe, ni de la app de Next.

## La política fail-open de PostHog (importante)

`isFeatureEnabled` es **fail-open** por diseño explícito (ver comment en `src/lib/flags.ts` líneas 5-21):

> Fail-open policy (deliberate): if PostHog is unreachable, the SDK throws,
> or the flag is unknown, isFeatureEnabled resolves `true`. Features stay
> on when the flag service goes down — we do not want a PostHog outage to
> tumble checkout.

Para flags `feat-*` (WIP gating, default `false` en UI), fail-open significa "feature off por defecto incluso si PostHog responde true" — coherente.

Para flags `kill-*` (default `true` = alive), fail-open significa **el kill-switch deja de funcionar durante un outage de PostHog**. Si has bajado `kill-checkout` a `false` para apagar checkout y PostHog se cae (o el SDK throws, o el TLS tira, o el rate-limit bloquea), `isFeatureEnabled` resuelve `true` → checkout vuelve a estar abierto.

Esto es coherente con la política, pero contraintuitivo. **Asume que durante un outage de PostHog tus kill-switches no responden.** Para esos casos, maintenance page.

## Tabla decisional (la única que importa en plena alarma)

| Síntoma | Mecanismo correcto |
|---|---|
| Bug en checkout, queremos pausarlo, todo lo demás OK, PostHog responde | `kill-checkout=false` en PostHog |
| Bug en una sola feature `feat-*`, PostHog responde | bajar el flag en PostHog |
| Bug en checkout pero **PostHog también está raro** (latencia, errores) | maintenance page (no confíes en el flag) |
| Migración mala, DB en estado inconsistente | maintenance page + ir a `db-data-corruption.md` |
| Ataque / abuso de tráfico | Cloudflare under-attack mode (ver `under-attack.md`); maintenance solo si lo otro no basta |
| Deploy en curso y quieres congelar 2 min | maintenance page |
| Cualquier incidente con dinero por medio donde dudes | maintenance page primero, decidir luego |

Regla rápida: **si dudas, maintenance**. El coste de 30s con la web caída es menor que el coste de un kill-switch que no funciona porque PostHog cayó al mismo tiempo que tu incidente (pasa más de lo que parece — los outages no son independientes).

## Escape-hatch sin maintenance page

Existe un tercer mecanismo, menos limpio: la env var `FEATURE_FLAGS_OVERRIDE` (parseada en `src/lib/env.ts:66`). Permite forzar un flag a `false` con un JSON en `.env.production`:

```env
FEATURE_FLAGS_OVERRIDE={"kill-checkout":false}
```

Edicion + redeploy del contenedor app aplica el override. NO depende de PostHog. Pero requiere redeploy (~2-5 min build) → es más lento que maintenance.

Úsalo cuando:
- El incidente lo justifica que dure horas/días, no minutos.
- Quieres dejar el resto del sitio funcionando, solo apagar una surface concreta.
- PostHog está caído y necesitas algo más fino que "todo down".

Para incidentes de minutos, maintenance es siempre más rápido.

## Naming y convención

- `kill-<area>` — emergency off-switch. Default `true` en UI.
- `feat-<name>` — WIP feature gate. Default `false` en UI. Cada `feat-*` debe tener un ticket de cleanup a 30 días.
- Nunca: `disable-X`, `enable-Y`, `flag-Z`. Solo los dos prefijos arriba.

Cuando añades un nuevo `kill-*`:

- [ ] Documentarlo en `state-of-the-world.md` § Kill switches solo si su valor por defecto va a estar en estado no-default.
- [ ] Añadirlo a la tabla de PostHog UI con descripción explícita ("kill-X. true = X enabled. false = kill switch active.")
- [ ] Asegurarte de que el code path bajo el flag no pasa de "503 honesto" → cualquier usuario que llegue mientras esté bajado debe ver una respuesta clara, no un crash.
- [ ] Probarlo en staging: bajar el flag, comprobar que el 503 sale, subirlo, comprobar que vuelve.

## Cross-refs

- `src/lib/flags.ts` — implementación server, política fail-open
- `src/lib/flags.client.ts` — implementación cliente
- `src/lib/env.ts` — `FEATURE_FLAGS_OVERRIDE` parser
- `docs/runbooks/maintenance-mode.md` — la otra mitad de este runbook
- `docs/conventions.md` § Feature flags — convención de naming
