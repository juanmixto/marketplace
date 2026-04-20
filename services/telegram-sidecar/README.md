# Telegram ingestion sidecar

FastAPI service wrapping [Telethon](https://docs.telethon.dev/). The worker
process ([`src/workers/`](../../src/workers/)) talks to this sidecar over
HTTP to read public Telegram groups; Telethon's MTProto session lives here
and only here.

## ⚠️ Deployment invariant — private network only

The sidecar holds a real user session. It MUST NOT be reachable from the
public internet, the browser, or the main marketplace web app. The only
permitted caller is the worker container on the same private network.

Enforcement checklist for any environment that runs this service:

1. Bind address defaults to `127.0.0.1`. In Kubernetes / ECS, bind to the
   pod/container IP and expose only within the private network.
2. No public Ingress / Load Balancer rule must route to this service.
3. Requests without a valid `X-Sidecar-Token` header return `401` before
   any Telethon call.
4. The shared secret is long (≥32 bytes), rotated on any suspected leak,
   and NEVER logged.

## Endpoints

All endpoints require `X-Sidecar-Token: <shared-secret>`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/health` | Liveness probe. No auth. Returns `{ "ok": true }`. |
| `POST` | `/auth/start` | Start the Telethon login flow for a connection. |
| `POST` | `/auth/verify` | Complete the Telethon login with the SMS code. |
| `POST` | `/chats` | List chats reachable by a connection. |
| `POST` | `/messages` | Fetch messages for one chat, cursor-based. |
| `GET`  | `/media/{file_unique_id}` | Stream media bytes. |

Error responses use JSON with `error` (human string) and, when applicable,
`retry_after_seconds`, `connection_id`, or `tg_chat_id` fields. The Node
bridge in [`src/domains/ingestion/telegram/providers/telethon-http.ts`](../../src/domains/ingestion/telegram/providers/telethon-http.ts)
maps status codes to typed errors:

- `401` / `403` → `TelegramAuthRequiredError`
- `404` → `TelegramChatGoneError`
- `429` → `TelegramFloodWaitError` (reads `retry_after_seconds`)
- `5xx` → `TelegramTransportError` (retryable)

## Environment

```env
SIDECAR_BIND_HOST=127.0.0.1
SIDECAR_BIND_PORT=8088
SIDECAR_SHARED_SECRET=<long-random-token>
SIDECAR_SESSION_DIR=/var/lib/telegram-sidecar/sessions
# Telethon API credentials (https://my.telegram.org/apps)
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
```

See `.env.example` for the canonical list.

## Running locally

```bash
cd services/telegram-sidecar
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in the values
uvicorn app.main:app --host 127.0.0.1 --port 8088
```

## Docker

```bash
docker build -t marketplace-telegram-sidecar .
docker run --rm -p 127.0.0.1:8088:8088 \
  --env-file .env \
  -v sidecar-sessions:/var/lib/telegram-sidecar/sessions \
  marketplace-telegram-sidecar
```

The container image does not expose the port to all interfaces; the
`-p 127.0.0.1:8088:8088` form binds to the loopback of the host.

## Phase 1 status

The sidecar is NOT deployed in any environment yet. Only the Node bridge
and the provider registry are wired in Phase 1 PR-B. The actual Telethon
calls ship in PR-C together with the first sync handler. Auth endpoints
return `501 Not Implemented` until then — intentional, so the surface
is documented but non-functional.
