---
summary: External structured-log sink (#1220) — vendor-agnostic NDJSON POST. How to wire Axiom / Better Stack / Logtail / Loki, and how to search by correlationId.
audience: ops + on-call
read_when: incident investigation, provisioning a new log sink, or troubleshooting "logs are not arriving"
---

# External log sink — log search & correlation

## What ships and where

`src/lib/logger.ts` writes JSON-per-line to **stdout** (Docker captures this; `journalctl -u raizdirecta-app` reads it). When `LOGGER_SINK_URL` is set, every same line is **also** posted to the configured external sink as NDJSON.

The sink is **vendor-agnostic**. Anything that accepts `POST` of `application/x-ndjson` works:

| Service | URL shape | Token |
|---------|-----------|-------|
| Axiom | `https://api.axiom.co/v1/datasets/<dataset>/ingest` | API token |
| Better Stack (Logtail) | `https://in.logs.betterstack.com` | Source token |
| Grafana Loki push | `https://<loki>/loki/api/v1/push` | bearer (optional) |
| Self-hosted Loki on whisper | `http://loki:3100/loki/api/v1/push` | none |

## Provision

```bash
# /etc/raizdirecta/app.env on whisper
LOGGER_SINK_URL=https://api.axiom.co/v1/datasets/raizdirecta-prod/ingest
LOGGER_SINK_TOKEN=xaat-…
```

After restart, every log line emitted by `src/lib/logger.ts` ships in batches of up to 100 lines or 1 second linger, whichever fires first. The sink is **fire-and-forget**: a slow / down sink never blocks the request path.

## Failure mode

By design, sink failures **degrade observability, not requests**:

- 4xx (config error: bad token / wrong dataset) → batch dropped (replay would fail every time).
- 5xx (transient sink outage) → batch dropped (holding state means unbounded growth on a sustained outage).
- Network error / abort / timeout (5 s) → batch dropped.

The `loggerSinkStats()` helper exposes a running drop counter for ops introspection:

```ts
import { loggerSinkStats } from '@/lib/logger-sink'
// { drops: number, shipped: number, bufferSize: number }
```

`/api/ready` could surface this in a follow-up so a steady drop signal pages oncall — for now, look at it from a debug endpoint or grep stdout for the drop pattern.

## How to search by `correlationId`

Every log entry carries a `correlationId` injected by the proxy middleware (#1210). The Sentry event for the same request carries the same id under `tags.correlationId`. To pivot from a Sentry issue to the log timeline:

1. Sentry issue page → **Tags** sidebar → click `correlationId`.
2. Copy the value (looks like `[A-Za-z0-9._-]{6,128}`).
3. In your log sink:

   - **Axiom**: query language is APL —
     ```kusto
     ['raizdirecta-prod']
     | where context.correlationId == "<the id>"
     | order by _time asc
     ```
   - **Better Stack**: search bar `correlationId:"<the id>"`.
   - **Loki**: `{job="raizdirecta-app"} |= "<the id>"`.

The chronological order of those rows IS the request flow — auth check → cart hydration → checkout intent → Stripe call → webhook arrival, etc.

## Self-hosted Loki on whisper (alternative)

If the cost / privacy story of a third-party SaaS is a no-go, the same sink works against a Loki instance on the same Proxmox node:

1. Add a `loki` and `promtail` service to `docker-compose.prod.yml` (single binaries, ~50 MB RAM).
2. Set `LOGGER_SINK_URL=http://loki:3100/loki/api/v1/push` (no token).
3. Front Loki with the existing `traefik` for an internal-only dashboard route.

Trade-off: a node failure takes down logs and production at the same time (single blast radius). Acceptable for pre-tracción; revisit when traffic justifies the second node.

## Out of scope

- **Client-side logger sink.** Browser code that goes through `logger.*` emits to `console.log` (no `process.stdout`); the sink call applies to server-side logs only. A browser → sink path needs CORS on the ingest endpoint and a dedicated `NEXT_PUBLIC_LOGGER_SINK_URL`. Defer until the analytics surface justifies it.
- **Replay-on-drop.** `loggerSinkStats().drops` reports loss; it does not recover the dropped lines. The stdout copy is the canonical archive; the sink is the convenient query surface.
