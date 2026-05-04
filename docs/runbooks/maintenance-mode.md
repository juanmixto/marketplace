---
summary: Maintenance page como kill-switch infra-level (no depende de PostHog). Compose profile que gana priority en traefik.
audience: agents,humans
read_when: incidente activo y necesitas tumbar el sitio público; o PostHog está caído y `kill-checkout` no responde
---

# Maintenance mode

Kill-switch infra-level para producción. Sirve un 503 estático con `Retry-After: 300` desde un `nginx:alpine` que se levanta solo cuando lo activas. Issue #1253.

## Cuándo usar esto vs `kill-checkout`

| Situación | Mecanismo |
|---|---|
| Necesitas apagar SOLO el checkout pero el resto del sitio sigue OK, y PostHog responde | `kill-checkout=false` en PostHog |
| PostHog caído / dudoso / `isFeatureEnabled` no responde | **Maintenance mode** |
| Necesitas tumbar TODO el sitio (incidente DB, migración mala, ataque) | **Maintenance mode** |
| Deploy en curso y quieres congelar tráfico durante 2 min | **Maintenance mode** |
| Investigación de seguridad y necesitas que nadie escriba | **Maintenance mode** |

`kill-checkout` es fail-open por diseño documentado (ver `kill-switches.md`): durante un outage de PostHog, el flag deja de surtir efecto. Para incidentes serios, asume que `kill-checkout` no funciona y usa maintenance.

## Activar (60-90s)

```bash
cd /opt/marketplace

# Cargar las mismas env vars que el deploy de prod
set -a; . .env.production; set +a
export TRAEFIK_ROUTER_NAME="marketplaceprod-app"
export TRAEFIK_SERVICE_NAME="marketplaceprod-app"

docker compose -p marketplaceprod -f docker-compose.prod.yml \
  --profile maintenance up -d maintenance

# Verificar que traefik enruta al maintenance container (status 503)
curl -fsSI "https://$APP_HOST/" | head -3
# Esperado: HTTP/2 503 + Retry-After: 300
```

Cuando el contenedor `maintenance` está up, su router de traefik (priority=200) gana frente al de `app` (priority por defecto, ~longitud de la rule). El cambio es inmediato; traefik picks up la nueva config en segundos vía el provider Docker.

> No es necesario parar el contenedor `app`. Mantenerlo arriba significa que cuando desactives maintenance, el sitio vuelve sin cold-start.

## Desactivar

```bash
cd /opt/marketplace
docker compose -p marketplaceprod -f docker-compose.prod.yml \
  --profile maintenance stop maintenance
docker compose -p marketplaceprod -f docker-compose.prod.yml \
  --profile maintenance rm -f maintenance

# Verificar que vuelve `app`
curl -fsSI "https://$APP_HOST/api/version" | head -3
# Esperado: HTTP/2 200
```

## Verificación pre-incidente (recomendada en staging)

Antes de confiar en esto durante un incidente real, ejercitar en staging:

```bash
cd /opt/marketplace
set -a; . .env.staging; set +a
export TRAEFIK_ROUTER_NAME="marketplacestg-app"
export TRAEFIK_SERVICE_NAME="marketplacestg-app"

docker compose -p marketplacestg -f docker-compose.prod.yml \
  --profile maintenance up -d maintenance
curl -fsSI "https://staging.raizdirecta.es/" | head -3
docker compose -p marketplacestg -f docker-compose.prod.yml \
  --profile maintenance stop maintenance
docker compose -p marketplacestg -f docker-compose.prod.yml \
  --profile maintenance rm -f maintenance
```

Una maintenance page que no se ha activado nunca es una maintenance page que no funciona.

## Diseño

- **No scripts, no assets externos, no formularios.** El HTML completo cabe en un solo fichero. No depende de Vercel, PostHog, Stripe, ni Cloudflare Workers. Si el nodo Proxmox está vivo y traefik responde, esta página responde.
- **`Retry-After: 300` + `Cache-Control: no-store`.** Buscadores y clientes respetan el reintento; nada se queda cacheado.
- **`X-Robots-Tag: noindex`.** No queremos que Google indexe la página de mantenimiento.
- **`access_log off`.** Durante un incidente no queremos PII en logs (paths suelen llevar query strings con tokens).
- **Status 503** vía `error_page 503 /index.html`. Es el código correcto: temporal, no permanente.

## Limitaciones

- Si el problema es traefik o cloudflared, esto no salva. Plan B en ese caso: cambiar la ruta del tunnel directamente desde el dashboard de Cloudflare.
- Si el problema es DNS / Cloudflare, plan C: nada en este host puede arreglarlo, hay que esperar.
- La página es bilingüe estática; no comunica el motivo del incidente. Si quieres dar más info, el canal correcto es `@raizdirecta` en Telegram (o el que esté), enlazado en `state-of-the-world.md` cuando proceda.

## Cross-refs

- `docs/runbooks/kill-switches.md` — política de feature flags vs kill-switches
- `docs/runbooks/payment-incidents.md` — flujo completo de incidente de pagos
- `docs/runbooks/db-failover.md` — incidente de DB (entra aquí cuando se decide tumbar el sitio)
- `infra/maintenance/` — código fuente
