---
summary: Cómo conectar un monitor externo de uptime a `/api/ready` y a quién avisa.
audience: ops / dueño de incidentes / agente que toque rate-limits o probes
read_when: configurar el monitor por primera vez, o cuando un alert nuevo dispare y haya que entender la cadena
---

# Monitor externo de uptime

Single-node prod (whisper, Proxmox) significa que si el nodo cae, todo cae con él. La probe
`/api/ready` ya valida DB + Stripe + Upstash + pg-boss en cada hit (#1211/#1227), pero
**nadie la pollea desde fuera**. Sin un monitor externo, una caída a las 03:00 se descubre
por la mañana. Issue: #1308.

## Decisión de proveedor

**Recomendado: Healthchecks.io self-hosted O BetterStack — uno de los dos, no ambos.**

| Provider | Tier gratuito | Push vs pull | Latencia | Notas |
|---|---|---|---|---|
| **BetterStack** | 10 monitors gratis, 30s interval | Pull (HTTP probe) | 30s | Heartbeat + status page público gratis. |
| **UptimeRobot** | 50 monitors gratis, 5min interval | Pull | 5min | Demasiado lenta para detectar incidentes financieros antes de la prensa de Twitter. |
| **Healthchecks.io** | Free tier ilimitado | Push (heartbeat) | depende del cron | Útil para crons, no para HTTP. NO sustituye un monitor de pull. |
| **Cronitor** | 5 monitors gratis | Push o pull | 1min | Mezcla; OK pero menos integrado que los dos primeros. |

**Default propuesto: BetterStack.** Razones:
- Pull HTTP a `/api/ready` cada 30s detecta downtime en <1min de promedio.
- Status page público (status.raizdirecta.es) cuesta 0 € y es útil para productores.
- Integración nativa con Telegram via webhooks; sin glue code.

Healthchecks.io complementa: lo usamos para los **crons de host** (#1307, ver
`docs/runbooks/host-crons.md`), no para HTTP uptime.

## Setup BetterStack (acción manual)

1. **Sign up** en https://betterstack.com/uptime con la cuenta `juan.ortega.saceda@gmail.com`.
   - Verifica con un correo distinto al que usas para Resend (no queremos el mismo dominio
     enviando y recibiendo alertas si cae).
2. **Crear monitor** "raizdirecta-prod-ready":
   - URL: `https://raizdirecta.es/api/ready`
   - Method: GET
   - Expected status: `200`
   - Request timeout: 10s
   - Check frequency: 30s
   - Confirmation period: **1 minute** (2 fallos consecutivos antes de alertar — evita
     falsos positivos por hipo de Cloudflare).
   - Regions: pick **3** (Frankfurt, Madrid si está, Londres). Más regiones = más
     ruido de red + sin detección extra de un fallo real.
3. **Crear escalation policy** "raizdirecta-prod":
   - Step 1: Telegram → canal del usuario (NO el bot de ingestion; usa uno separado para
     blast-radius).
   - Step 2: tras 5 min sin ack → email a `juan.ortega.saceda@gmail.com`.
4. **Crear status page** público en `status.raizdirecta.es`:
   - DNS CNAME → `statuspage.betteruptime.com` (apuntará al subdomain que BetterStack te dé).
   - Añadir el monitor "raizdirecta-prod-ready" a la página.
   - Branding: logo de raizdirecta + texto "Estado del servicio".
5. **Crear monitor secundario** "raizdirecta-dev-ready":
   - URL: `https://dev.raizdirecta.es/api/ready`
   - Mismo setup pero alerta en step 1 a Telegram bot del usuario, sin email step 2 (es dev).

## Setup alternativo (UptimeRobot)

Si BetterStack se vuelve de pago o cambian su tier:

```
URL: https://raizdirecta.es/api/ready
Type: HTTP(s)
Interval: 5 min
Alert contacts: Telegram webhook (canal del usuario)
```

Renunciamos a la latencia (5min vs 30s) pero el resto sigue funcionando.

## Verificación local del probe

Antes de pegar la URL al monitor, valida en local que `/api/ready` responde como esperamos:

```bash
scripts/check-prod-health.sh
# OK: https://raizdirecta.es/api/ready green
# {"database":12,"stripe":143,"upstash":89,"queue":17}
```

Exit codes:
- `0` todo verde
- `1` 503 con uno o más checks degradados
- `2` sin respuesta (red/DNS/TLS)
- `3` código HTTP inesperado (e.g. 502 de Cloudflare)

## Qué hacer cuando suena la alerta

1. **No entres en pánico.** Mira el body del último probe en BetterStack — el JSON
   dice exactamente qué dependencia falló.
2. **Mira `/api/ready` con browser**, también `/api/healthcheck` y `/api/version`. Si los
   tres devuelven 200 y BetterStack sigue rojo, es falso positivo (probable network blip).
3. **Si `database` falló:** `docker logs marketplaceprod_db_1 --tail 100`, `docker exec
   marketplaceprod_app_1 npx prisma db pull` para validar conectividad. Runbook DB:
   `docs/runbooks/db-failover.md`.
4. **Si `stripe` falló:** abre https://status.stripe.com primero. 90% de las veces es
   ellos. Si Stripe está OK, revisa si `STRIPE_SECRET_KEY` se rotó/revocó.
5. **Si `upstash` falló:** rate-limiter está roto → checkout puede estar 429-eando a
   compradores legítimos. Considera flip de `kill-checkout=true` mientras se resuelve.
6. **Si `queue` falló:** pg-boss no puede hablar con su esquema. Emails y refunds están
   stalled. NO redeploy ciegamente — primero `npm run worker` logs.

Para todos los anteriores, runbook detallado: `docs/runbooks/payment-incidents.md` (si
afecta pagos) o `docs/runbooks/db-failover.md` (si es DB).

## Por qué `/api/ready` y no `/api/healthcheck`

`/api/healthcheck` es **liveness** — "el proceso responde a Postgres". Útil para Docker.
`/api/ready` es **readiness** — "puedo aceptar dinero ahora mismo". Lo que importa al
monitor externo es lo segundo: una probe healthcheck-only diría OK con Stripe revocado y
checkout silenciosamente roto durante horas.

## Cuándo este runbook caduca

- Si migramos a multi-node, `/api/ready` deberá contemplar leadership/quorum y este
  monitor seguirá apuntando al endpoint canónico (no a un nodo concreto).
- Si BetterStack deja de tener tier gratuito, evaluar UptimeRobot (sección alternativa).

Última actualización: 2026-05-04 — al activar el monitor, anota la fecha en
`docs/state-of-the-world.md` § Integraciones externas.
