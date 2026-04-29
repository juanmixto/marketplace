---
summary: Pasos manuales una sola vez para activar el bot de Telegram. Dormido si TELEGRAM_BOT_TOKEN no está set (webhook 404, UI 'próximamente').
audience: agents,humans
read_when: activar bot de Telegram en un entorno
---

# Telegram bot setup runbook

One-time manual steps to bring a Telegram bot online for the marketplace. The feature is dormant until `TELEGRAM_BOT_TOKEN` is set — if the env var is unset, `/api/telegram/webhook` returns 404 and every piece of UI renders a "próximamente" fallback.

## 1. Create the bot

1. Chat with [@BotFather](https://t.me/BotFather).
2. `/newbot` → choose a display name and a `@username` ending in `bot`.
3. Store the token: `TELEGRAM_BOT_TOKEN=<token>`.
4. Store the handle (without `@`): `TELEGRAM_BOT_USERNAME=<handle>`.

## 2. Generate a webhook secret

```sh
openssl rand -base64 48 | tr -d '+/=' | head -c 64
```

Store the output as `TELEGRAM_WEBHOOK_SECRET`. Rotate by regenerating and re-running step 3.

## 3. Register the webhook with Telegram

```sh
SECRET="$TELEGRAM_WEBHOOK_SECRET"
APP_URL="https://your-domain.com"

curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg url "$APP_URL/api/telegram/webhook?secret=$SECRET" \
              --arg secret_token "$SECRET" \
              '{url:$url, secret_token:$secret_token, allowed_updates:["message","callback_query"]}')"
```

Verify:

```sh
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" | jq
```

`url` must match your app's public URL. `last_error_message` must be empty.

## 4. (Optional) Set bot commands

```sh
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setMyCommands" \
  -H 'content-type: application/json' \
  -d '{"commands":[
    {"command":"start","description":"Vincula tu cuenta"},
    {"command":"disconnect","description":"Desvincula tu cuenta"},
    {"command":"help","description":"Ayuda"}
  ]}'
```

## 5. Local development with ngrok

```sh
ngrok http 3000
# copy the https URL, set APP_URL above, run step 3
```

Restart `npm run dev` after changing env vars.

## 6. Rotating the webhook secret

1. Generate a new secret (step 2).
2. Update `TELEGRAM_WEBHOOK_SECRET` everywhere the app runs.
3. Re-run step 3 to push the new secret to Telegram.

Old-secret requests will keep arriving for up to a few minutes while Telegram retries; they are rejected server-side (constant-time compare) and never reach handlers.

## 7. Log scopes (stable contract)

These log scopes are part of the operational contract. **Do not rename**:

- `telegram.webhook.*` — inbound (secret mismatches, invalid updates, handler failures)
- `telegram.outbound.*` — outbound sendMessage attempts
- `telegram.action.*` — callback_query dispatch
- `telegram.link.*` — /start, /disconnect, token consumption
