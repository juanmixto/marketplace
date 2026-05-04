---
summary: Calendario y procedimiento de rotación de cada secreto productivo. Cada entrada lleva un comando de verificación tras la rotación; sin verificación la rotación no se da por cerrada.
audience: agents,humans
read_when: ejecutar rotación trimestral, responder a incidente con sospecha de fuga, onboardear un host nuevo, o tras la auditoría #1192
---

# Runbook — Rotación de secretos

Pareja de [`docs/audits/README.md`](../audits/README.md) (auditoría) y de la épica [#1192](https://github.com/juanmixto/marketplace/issues/1192) (hardening pre-launch). Este runbook documenta **cómo** rotar cada secreto y **cómo verificarlo** — la épica documenta **qué** rotar.

## Cuándo rotar

- **Programado**: trimestral por defecto. Programado en Healthchecks (`hc.rotation.quarterly`) con un ping manual al cerrar la rotación.
- **Reactivo**: tras cualquiera de:
  - Auditoría que detecta el secreto en disco con permisos > 600
  - Sospecha de exfiltración (acceso no autorizado a `whisper`, leak en log, captura de sesión Claude)
  - Salida de un colaborador con acceso al host
  - Cambio de proveedor o de cuenta

## Tabla maestra

| Secreto | Proveedor | Proceso | Verificación | Frecuencia |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys | Crear nueva live key, actualizar `/etc/marketplace/app.env`, recargar app, smoke checkout, **revocar la antigua tras 24 h** | `curl https://api.stripe.com/v1/charges -u sk_live_NEW: -G -d limit=1` → 200 | Anual o tras incidente |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → endpoint → Signing secret | Stripe permite **dos secrets activos** durante 24 h. Crear el nuevo, actualizar app.env, esperar a que ambos hayan recibido eventos, revocar el viejo | Forzar test event firmado desde el dashboard → 200 en `stripe.webhook.received` | Anual |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Zero Trust → Networks → Tunnels | Recrear tunnel (`cloudflared tunnel create marketplace-prod-N+1`), actualizar `app.env` con el nuevo token, recargar contenedor `cloudflared`, **borrar tunnel antiguo en CF Dashboard** | `dig raizdirecta.es CNAME` apunta al nuevo tunnel UUID; `curl -I https://raizdirecta.es` → 200 con `cf-ray` nuevo | Anual o tras incidente |
| `AUTH_GOOGLE_SECRET` | Google Cloud Console → APIs & Services → Credentials → OAuth client | Generar new client secret en el mismo OAuth client, actualizar `app.env`, recargar app, **revocar el antiguo desde la lista de secrets del cliente** | Login Google end-to-end en https://raizdirecta.es/login → cookie `__Secure-authjs.session-token` recibido | Anual |
| `AUTH_GOOGLE_ID` | Google Cloud Console → OAuth client | NO se rota habitualmente (es el client ID, no es secreto). Solo se rota si se reemplaza el OAuth client completo | Mismo smoke que el secret | Solo en migraciones |
| `TELEGRAM_BOT_TOKEN` | @BotFather en Telegram | `/revoke` ⇒ Telegram emite token nuevo, actualizar `app.env`, **re-registrar el webhook** (`curl -F "url=https://raizdirecta.es/api/webhooks/telegram" -F "secret_token=<TELEGRAM_WEBHOOK_SECRET>" https://api.telegram.org/bot<NEW_TOKEN>/setWebhook`) | Mensaje `/start` al bot debe responder; logs `telegram.webhook.received` | Anual |
| `TELEGRAM_WEBHOOK_SECRET` | Generado localmente: `openssl rand -base64 48` | Generar nuevo, actualizar `app.env`, re-registrar webhook con `setWebhook` añadiendo `secret_token=NEW`, recargar app | Telegram debe enviar el header `X-Telegram-Bot-Api-Secret-Token` con el nuevo valor — verificar en `telegram.webhook.received` | Anual |
| `SIDECAR_SHARED_SECRET` (Telethon) | Generado localmente: `openssl rand -base64 48` | Generar nuevo, actualizar **ambos** `/etc/marketplace/sidecar.env` y la entrada `TELEGRAM_SIDECAR_TOKEN` en `/etc/marketplace/app.env`, recargar `telegram-sidecar.service` y la app Next | `curl -H "X-Sidecar-Token: NEW" http://127.0.0.1:8088/_health` → 200; con token viejo → 401 | Anual |
| `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` | https://my.telegram.org → Apps | **NO se pueden rotar** — Telegram no permite regenerar el `api_hash`. Si está comprometido: dar de alta una **nueva app**, archivar la vieja, regenerar las `.session` de Telethon, dejar la antigua dormante | `python -m telethon test` con el sidecar contra los nuevos creds | Solo si comprometido |
| `AUTH_SECRET` (NextAuth) | Generado localmente: `openssl rand -base64 32` | Generar nuevo, actualizar `app.env`, **invalidará todas las sesiones activas** — comunicar a usuarios si pasan de 5; recargar app | Login limpio + verificación de cookie `__Secure-authjs.session-token` con nuevo `iat` | Anual o tras incidente |
| `POSTGRES_PASSWORD` | Generado localmente: `openssl rand -base64 32` | `ALTER USER mp_user WITH PASSWORD 'NEW'` dentro del contenedor `db`, actualizar `POSTGRES_PASSWORD` y `DATABASE_URL` en `app.env` (también `pgBackRest`/`backup.env` si los usa), recargar app + worker | `psql $DATABASE_URL -c 'select 1'` desde el contenedor app → 1 fila; logs sin `password authentication failed` | Anual o tras incidente |
| `BLOB_READ_WRITE_TOKEN` | Vercel → Storage → Blob | Generar nuevo, revocar antiguo en el mismo panel, actualizar `app.env`, recargar app | Subir foto de prueba en `/admin/productos/<id>/editar` → 200 + URL `*.public.blob.vercel-storage.com` | Anual |
| `RESEND_API_KEY` | Resend Dashboard → API Keys | Crear nueva, revocar antigua, actualizar `app.env`, recargar app | Forzar magic-link en `/login/link` → email recibido en buzón de prueba | Anual |
| `VAPID_PRIVATE_KEY` + `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Localmente: `npx web-push generate-vapid-keys` | Solo si push web vuelve a habilitarse (retirado del UI en #859). Rotación obliga a invalidar TODAS las suscripciones push existentes | N/A actualmente | No aplica (feature retirada) |
| `CRON_SECRET` | Generado localmente: `openssl rand -base64 32` | Generar nuevo, actualizar `app.env`, actualizar el crontab/Cloudflare Cron Trigger que llama a `/api/cron/*` con el header `Authorization: Bearer <NEW>` | Llamar manualmente al endpoint con el secret viejo → 401; con el nuevo → 200 | Anual |
| `B2_KEY_ID` + `B2_APP_KEY` | Backblaze B2 → App Keys | Crear nuevo application key con scope al bucket de backups, revocar el antiguo, actualizar `/etc/marketplace/backup.env` (mode 600), reiniciar cron de pgBackRest/dump | Forzar `pgbackrest --stanza=marketplace check` → OK; ver `db.backup.b2_upload_ok` en Healthchecks | Anual |
| `PGBACKREST_CIPHER_PASS` | Generado localmente: `openssl rand -base64 64` | **Rotación destructiva**: cifra los WAL existentes. Plan: nuevo full backup con la nueva passphrase, mantener ambas durante el ciclo de retención, retirar la antigua tras expirar todos los backups que la usaban | Restore de prueba en host disposable con la nueva passphrase | Cada 2 años o si fuga |
| `MP_DUMP_PASSPHRASE` | Generado localmente: `openssl rand -base64 64` | Mismo enfoque que pgBackRest pero más simple (los dumps son nightly snapshots independientes); a partir de la rotación los nuevos dumps usan el nuevo, los viejos siguen siendo legibles con el antiguo durante el período de retención | `gpg --decrypt dump-YYYY-MM-DD.sql.gpg | head` → SQL en cleartext | Anual |
| `HC_PING_*` (Healthchecks) | Healthchecks.io → Each check → URL | Crear check nuevo con el mismo nombre + período, actualizar URL en `backup.env`, eliminar check antiguo | Forzar `curl <new-url>` → ping registrado en Healthchecks UI | Anual |

## Procedimiento estándar (rotación trimestral programada)

1. **Pre-flight**: `scripts/agents-status.sh` (no debe haber WIP en worktrees), `git status` en `marketplace` debe estar limpio, ningún deploy en marcha.
2. **Snapshot**: `pg_dump` puntual y backup `app.env` actual a `/root/rotations/YYYY-MM-DD/app.env.pre` (mode 600). Servirá si hay que rollback rápido.
3. **Rotar uno a uno**: ir por orden de la tabla. Tras cada secreto, ejecutar SU comando de verificación antes de pasar al siguiente. Si falla la verificación → **rollback solo ese secreto** desde el snapshot, abrir issue, no seguir.
4. **Recarga**: cuando todos los secretos están rotados, `docker compose -f docker-compose.prod.yml up -d --force-recreate app worker telegram-sidecar` (o el equivalente systemd).
5. **Smoke end-to-end** (5 min):
   - Home `https://raizdirecta.es` → 200
   - Login Google → cookie de sesión nueva
   - Checkout test (importe €1, tarjeta `4242 4242 4242 4242`) → `payment_intent.succeeded` recibido y orden `PAYMENT_CONFIRMED`
   - Mensaje `/start` al bot Telegram → respuesta
   - Subida de foto en admin → URL Blob nueva
6. **Cierre**:
   - Ping Healthcheck `hc.rotation.quarterly`
   - Crear PR sumario a `docs/state-of-the-world.md` con la fecha y la lista de IDs rotados (sin valores)
   - Borrar el snapshot `/root/rotations/YYYY-MM-DD/` tras 7 días sin incidencias

## Reactivo: rotación bajo presión

Si hay sospecha activa de exfiltración:

1. **Aislar**: bajar el sidecar Telegram (`systemctl stop telegram-sidecar`) y poner el kill switch correspondiente en PostHog (`kill-stripe-webhook=false`, `kill-auth-social=false`).
2. **Rotar SOLO el subset comprometido**, en este orden de criticidad:
   1. Stripe `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` (riesgo financiero)
   2. Cloudflare Tunnel (atacante puede recibir todo el tráfico)
   3. Postgres password (acceso a datos)
   4. Resto en orden de la tabla
3. **No esperar** los 24 h del periodo de gracia de Stripe — revocar el antiguo inmediatamente; perder algunos eventos en flight es preferible a dejar la ventana abierta. Stripe reintenta hasta 3 días, así que no hay pérdida real si el pipeline reabre rápido.
4. **Quitar kill switches** una vez verificado que la nueva config funciona.
5. **Postmortem** en `docs/runbooks/incidents/<fecha>-rotation-emergency.md` con scope, vector sospechado y acción correctiva.

## Anti-patrones (no hacer)

- **No** rotar todo a la vez sin smoke entre cada uno: un fallo se vuelve imposible de bisectar.
- **No** rotar Stripe webhook secret sin usar el doble-secret window: cortas el flujo de webhooks durante el cambio.
- **No** dejar el snapshot pre-rotación más de 7 días — contiene los valores antiguos en cleartext.
- **No** reusar valores antiguos como nuevos ("añadiré un sufijo"): los detectores de breach por reuso fallan en silencio.
- **No** comitear los nuevos valores al repo, ni siquiera temporalmente. La rotación se hace en `/etc/marketplace/*.env` (mode 600) — ver épica [#1192](https://github.com/juanmixto/marketplace/issues/1192).

## Referencias

- Auditoría que motiva esta runbook: [#1192](https://github.com/juanmixto/marketplace/issues/1192)
- Hijos de la épica relevantes: [#1178](https://github.com/juanmixto/marketplace/issues/1178) (rotación pre-launch) y [#1188](https://github.com/juanmixto/marketplace/issues/1188) (SOPS/age para reducir el blast radius futuro)
- Operaciones complementarias: [`db-backup.md`](db-backup.md), [`under-attack.md`](under-attack.md), [`payment-incidents.md`](payment-incidents.md)
