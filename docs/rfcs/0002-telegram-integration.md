---
title: RFC 0002 — Telegram Integration for Vendors
status: Draft
authors: planning-agent
created: 2026-04-17
target_release: TBD
related:
  - docs/conventions.md
  - docs/ai-guidelines.md
  - docs/ai-workflows.md
---

# RFC 0002 — Telegram Integration for Vendors

> Pasteable into GitHub. Each EPIC below is a parent issue; each Issue under it is a child issue. Headings are intentionally GitHub-flavored so copy/paste produces correct rendering.

## 0. Summary

Allow producers (`UserRole.VENDOR`) to **opt in** to a Telegram bot that:

1. Sends real-time notifications about events that already exist in the platform (new order, pending action, customer message).
2. Lets them perform a small, hardened set of actions from inline buttons (`confirmOrder`, `markAsShipped`).

The integration is:

- **Optional** — gated by `TELEGRAM_BOT_TOKEN` env + a per-user opt-in. If the env var is unset, the entire feature is dormant and zero existing code paths change behavior.
- **Decoupled** — existing domains (`orders`, `messaging`, etc.) emit semantic events; the new `notifications` domain is the only consumer that talks to Telegram. No `orders` → `telegram` import.
- **Channel-extensible** — the dispatcher abstracts channel. Email / push / WhatsApp slot in later as additional `NotificationChannel` enum values without re-plumbing event producers.

This RFC governs the multi-PR rollout. Every PR is small enough to revert in one click.

---

## 1. Architecture overview

```
┌───────────────────────┐        emit(event)         ┌────────────────────────────┐
│ existing domain code  │ ─────────────────────────► │ notifications/dispatcher   │
│ (orders, messaging…)  │                            │ (in-process pub/sub)       │
└───────────────────────┘                            └─────────────┬──────────────┘
                                                                   │ for each subscriber
                                                                   ▼
                                                ┌──────────────────────────────────┐
                                                │ notifications/telegram/handlers  │
                                                │  - load preferences              │
                                                │  - render template               │
                                                │  - call telegram service         │
                                                └─────────────┬────────────────────┘
                                                              ▼
                                              ┌────────────────────────────────┐
                                              │ Telegram Bot API (HTTPS)       │
                                              └────────────────────────────────┘

Inbound (user taps button):
Telegram ──► /api/telegram/webhook  ──► telegram/controller ──► telegram/actions/<name>
                                                                   │
                                                                   ▼ reuses existing domain action
                                                          @/domains/orders.confirmOrder()
```

### 1.1 Why an in-process event bus, not a queue

The marketplace today is a single Next.js process with a single Postgres. An in-process typed dispatcher (`mitt`-style or hand-rolled `Map<event, Set<handler>>`) is sufficient and adds zero infra. The dispatcher's contract is small enough that swapping it for BullMQ / Redis Streams later is mechanical. **Do not introduce Redis in the MVP.**

### 1.2 Why a new `notifications` domain (and not extending `messaging`)

`messaging` is customer-vendor chat (a business concept). `notifications` is *transport* for cross-cutting events to external channels. Mixing them couples chat schema changes to delivery infrastructure. They stay separate; `messaging` *emits* a `message.received` event, `notifications` consumes it.

### 1.3 What stays out of scope (MVP)

- Customer-facing Telegram (only vendors).
- Email / push / WhatsApp channels (designed-for, not implemented).
- Multi-bot / per-region bots.
- Inbound free-text commands beyond `/start <token>`, `/disconnect`, `/help`.
- Rich media (photos of products in messages).

---

## 2. Folder structure

```
src/
├── app/
│   ├── api/
│   │   └── telegram/
│   │       └── webhook/
│   │           └── route.ts                # POST handler — verifies secret, dispatches update
│   └── (vendor)/
│       └── ajustes/
│           └── telegram/
│               └── page.tsx                # Connect / Disconnect UI
├── domains/
│   └── notifications/
│       ├── index.ts                        # barrel — client-safe ONLY (types, schemas, 'use server' actions)
│       ├── types.ts                        # NotificationChannel, NotificationEventType, payload shape
│       ├── events.ts                       # event name constants + per-event payload Zod schemas
│       ├── dispatcher.ts                   # @internal — in-process pub/sub (server-only)
│       ├── preferences-actions.ts          # 'use server' — get/update preferences
│       ├── preferences-schema.ts
│       └── telegram/
│           ├── client.ts                   # @internal — HTTPS wrapper around Bot API
│           ├── service.ts                  # @internal — sendMessage / sendButtons / answerCallback
│           ├── controller.ts               # @internal — webhook dispatcher (message vs callback_query)
│           ├── link-actions.ts             # 'use server' — generateLinkToken / disconnectTelegram
│           ├── link-token.ts               # @internal — generate/verify/consume tokens
│           ├── handlers/                   # subscribed to dispatcher
│           │   ├── on-order-created.ts
│           │   ├── on-order-pending.ts
│           │   └── on-message-received.ts
│           ├── actions/                    # callback_query handlers
│           │   ├── registry.ts             # action name → handler
│           │   ├── confirm-order.ts
│           │   └── mark-shipped.ts
│           ├── templates.ts                # message copy + button factories
│           └── rate-limit.ts               # @internal — per-user throttle
```

**Barrel discipline (per [docs/ai-guidelines.md §1.1–1.3](../ai-guidelines.md)):**

`src/domains/notifications/index.ts` re-exports ONLY:

- `types.ts` (types, enums)
- `events.ts` (event name consts + payload types — types only, the dispatcher itself stays internal)
- `preferences-schema.ts`
- `preferences-actions.ts` (`'use server'`)
- `telegram/link-actions.ts` (`'use server'`)

Server-only modules (`dispatcher.ts`, `client.ts`, `service.ts`, `controller.ts`, handlers, actions) are deliberately excluded from the barrel. Server callers (route handlers, other server actions, handlers themselves) deep-import them with `// eslint-disable-next-line no-restricted-imports -- server-only telegram module`.

Add `notifications` to `DOMAINS` in `eslint.config.mjs`.

---

## 3. Database schema (Prisma)

All additions are **additive**; no existing table is altered. Generated client path: `@/generated/prisma/client`.

```prisma
// New enums

enum NotificationChannel {
  TELEGRAM
  // future: EMAIL, PUSH, WHATSAPP
}

enum NotificationEventType {
  ORDER_CREATED
  ORDER_PENDING
  MESSAGE_RECEIVED
}

enum NotificationDeliveryStatus {
  SENT
  FAILED
  SKIPPED  // user opted out / no link / rate-limited
}

// User ↔ Telegram link. One active link per user.
model TelegramLink {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  chatId     String   @unique          // Telegram chat id (string for safety; Telegram returns int64)
  username   String?                    // Telegram @handle, for display
  isActive   Boolean  @default(true)
  linkedAt   DateTime @default(now())
  lastSeenAt DateTime?

  @@index([isActive])
}

// Short-lived token used in /start <token> flow.
model TelegramLinkToken {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String    @unique          // 32-char URL-safe random
  expiresAt  DateTime                   // now() + 10 min
  consumedAt DateTime?                  // null = unused
  createdAt  DateTime  @default(now())

  @@index([userId])
  @@index([expiresAt])
}

// Per-user opt-in for each (channel, eventType) pair.
// Absence of a row = channel default (see §3.1).
model NotificationPreference {
  id         String                @id @default(cuid())
  userId     String
  user       User                  @relation(fields: [userId], references: [id], onDelete: Cascade)
  channel    NotificationChannel
  eventType  NotificationEventType
  enabled    Boolean               @default(true)
  updatedAt  DateTime              @updatedAt

  @@unique([userId, channel, eventType])
  @@index([userId])
}

// Audit log for outbound notifications. Helps debugging and rate-limiting.
model NotificationDelivery {
  id         String                     @id @default(cuid())
  userId     String
  channel    NotificationChannel
  eventType  NotificationEventType
  status     NotificationDeliveryStatus
  error      String?                    @db.Text
  payloadRef String?                    // e.g. "order:abc123"
  createdAt  DateTime                   @default(now())

  @@index([userId, createdAt])
  @@index([status, createdAt])
}

// Audit log for inbound actions (button taps).
model TelegramActionLog {
  id        String   @id @default(cuid())
  userId    String?                     // nullable: unknown chat
  chatId    String
  action    String                      // "confirmOrder", "markAsShipped", "unknown"
  payload   Json
  success   Boolean
  error     String?                     @db.Text
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@index([chatId, createdAt])
}
```

**Add relations** on `User`:
```prisma
telegramLink            TelegramLink?
telegramLinkTokens      TelegramLinkToken[]
notificationPreferences NotificationPreference[]
```

### 3.1 Default preferences

If no row exists for a `(userId, channel, eventType)`, the dispatcher treats it as `enabled = true` for the user **only if** they have an active `TelegramLink`. Rationale: a vendor who linked their Telegram clearly wants notifications by default; opting out is explicit. They can disable per-event in settings.

### 3.2 Migration safety

Per [ai-guidelines §5](../ai-guidelines.md#5-database-prisma):

- All new tables — no `ALTER COLUMN`.
- New columns on `User` are relations (no FK column on `User` itself).
- Migration is single-deploy safe: either old code (which never reads these tables) or new code can run against the new schema.

---

## 4. Event system

### 4.1 Event names and payloads

`src/domains/notifications/events.ts` (server-importable — defines names + payload types; the dispatcher itself is in `dispatcher.ts`):

```ts
export const NOTIFICATION_EVENTS = {
  ORDER_CREATED:   'order.created',
  ORDER_PENDING:   'order.pending',
  MESSAGE_RECEIVED: 'message.received',
} as const

export const orderCreatedPayloadSchema = z.object({
  orderId: z.string(),
  vendorId: z.string(),
  customerName: z.string(),
  totalCents: z.number().int(),
  currency: z.string().length(3),
})

export const orderPendingPayloadSchema = z.object({
  orderId: z.string(),
  vendorId: z.string(),
  reason: z.enum(['NEEDS_CONFIRMATION', 'NEEDS_SHIPMENT']),
})

export const messageReceivedPayloadSchema = z.object({
  conversationId: z.string(),
  vendorId: z.string(),
  fromUserName: z.string(),
  preview: z.string().max(120),
})
```

Each handler validates the payload with the schema before using it. **No `any` allowed** — the event registry is fully typed.

### 4.2 Dispatcher contract

`src/domains/notifications/dispatcher.ts` — `@internal`, server-only:

```ts
type EventMap = {
  'order.created':    z.infer<typeof orderCreatedPayloadSchema>
  'order.pending':    z.infer<typeof orderPendingPayloadSchema>
  'message.received': z.infer<typeof messageReceivedPayloadSchema>
}

type Handler<E extends keyof EventMap> = (payload: EventMap[E]) => Promise<void>

export function on<E extends keyof EventMap>(event: E, handler: Handler<E>): () => void
export function emit<E extends keyof EventMap>(event: E, payload: EventMap[E]): void
```

`emit()` is **fire-and-forget**: it runs handlers via `setImmediate` / `queueMicrotask` and never throws back into the producer. Handler failures log to `NotificationDelivery` with `status = FAILED` but never break the originating order/message flow. **This is the load-bearing contract** — the whole "won't break existing functionality" guarantee depends on it.

### 4.3 Where producers emit

Only three call sites need a one-line `emit()` injection in MVP:

- `@/domains/orders/actions.ts` → `createOrder` success → `emit('order.created', …)`
- `@/domains/orders/actions.ts` → state machine transition into a "pending vendor" status → `emit('order.pending', …)`
- `@/domains/messaging/...` (whatever the receive handler is named) → `emit('message.received', …)`

Producers import `emit` and the relevant payload schema from `@/domains/notifications` (barrel). They do NOT import anything from `@/domains/notifications/telegram/*`.

### 4.4 Handler registration

Handlers self-register at module load. A single file `src/domains/notifications/telegram/handlers/index.ts` imports each handler module for its side effect; the webhook route or app startup imports that index. No DI framework, no decorators.

---

## 5. Telegram protocol details

### 5.1 Bot setup (one-time, manual)

1. Talk to `@BotFather` → `/newbot` → store token in `TELEGRAM_BOT_TOKEN`.
2. `setWebhook` to `https://<APP_URL>/api/telegram/webhook?secret=$TELEGRAM_WEBHOOK_SECRET`.
3. Optional `setMyCommands` for `/start`, `/disconnect`, `/help`.

These steps are documented in the EPIC 1 issue and **not** automated in MVP.

### 5.2 Webhook auth

Two layers (both required):

1. **URL secret**: `?secret=<TELEGRAM_WEBHOOK_SECRET>` — Telegram doesn't sign webhooks, so a long random secret in the URL is the canonical pattern. Reject if mismatch.
2. **Header secret**: `X-Telegram-Bot-Api-Secret-Token` — set via `setWebhook(secret_token=…)`. Compare in constant time.

Reject (200 OK with empty body — never 401, Telegram retries on non-2xx) if either fails.

### 5.3 Update shape (relevant subset)

```json
// Inbound message (e.g. /start <token>)
{
  "update_id": 123,
  "message": {
    "message_id": 456,
    "from": { "id": 789, "username": "juan" },
    "chat": { "id": 789, "type": "private" },
    "date": 1700000000,
    "text": "/start abc123token"
  }
}

// Inbound callback_query (button tap)
{
  "update_id": 124,
  "callback_query": {
    "id": "cb-1",
    "from": { "id": 789, "username": "juan" },
    "message": { "chat": { "id": 789 }, "message_id": 457 },
    "data": "confirmOrder:ord_abc123"
  }
}
```

### 5.4 Outbound payload

```json
POST https://api.telegram.org/bot<TOKEN>/sendMessage
{
  "chat_id": "789",
  "text": "📦 New order #abc123\nCustomer: Juan\nTotal: €45,00",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "Confirm", "callback_data": "confirmOrder:ord_abc123" },
      { "text": "View",    "url": "https://app.example.com/vendor/pedidos/ord_abc123" }
    ]]
  }
}
```

### 5.5 Callback data budget

`callback_data` is **64 bytes max**. Encode as `action:id` (no JSON). Validate with a Zod tuple in `actions/registry.ts`.

---

## 6. Security

| Surface | Threat | Mitigation |
|---|---|---|
| `/api/telegram/webhook` | Forged updates | URL secret + header secret, constant-time compare |
| `/start <token>` | Token replay | `consumedAt` flag, single-use, 10 min TTL |
| `/start <token>` | Token brute force | 32-char URL-safe random (≥190 bits entropy) + per-IP rate limit (in-memory in MVP) |
| `callback_query` | Forged ownership | Look up `TelegramLink` by `chatId`, then verify the linked `userId` owns the order/message |
| `callback_query` | State machine abuse | Reuse the existing domain action, which already enforces transitions; never bypass |
| Outbound | Spam if event bus loops | Per-user, per-event sliding window in `rate-limit.ts` (e.g. max 30 messages / 5 min) |
| All inbound | DoS | Webhook returns 200 quickly; heavy work is queued via `setImmediate` |
| All inbound | Logging PII | `TelegramActionLog.payload` excludes free text; truncate to action + ids |

**Hard rule**: a callback handler MUST NOT accept the user's claim of identity from `callback_query.from.id` alone. It MUST look up `TelegramLink.chatId === message.chat.id` and use `TelegramLink.userId`. The `from` field is informational only.

---

## 7. UX & messaging

- **Templates** centralized in `telegram/templates.ts`, exported as pure functions returning `{ text, reply_markup }`.
- **i18n**: hard-code Spanish for MVP (matches the rest of the vendor area). Wrap strings in `t()` from the existing i18n layer if a key already exists; otherwise inline. Do NOT spawn a parallel i18n system.
- **Tone**: short, action-oriented. Max 2 inline buttons per message. CTA verbs first.
- **Emoji**: one per message header (📦 ⏳ 💬 ✅), no decoration in body.
- **Time**: always show in the vendor's locale using `Intl.DateTimeFormat`.

Example templates:

```
📦 Nuevo pedido #ABC123
Juan García — €45,00
[ Confirmar ] [ Ver ]
```

```
⏳ Pedido pendiente #ABC123
Esperando confirmación desde hace 2 h.
[ Confirmar ] [ Ver ]
```

```
💬 Mensaje de Juan García
"Hola, ¿cuándo enviáis…"
[ Responder ]
```

---

## 8. Feature flag / opt-in matrix

| Layer | Mechanism | Default |
|---|---|---|
| Deployment | `TELEGRAM_BOT_TOKEN` env unset → entire feature disabled, route returns 404 | OFF until env set |
| User | `TelegramLink.isActive` | unset until user runs flow |
| Per-event | `NotificationPreference.enabled` row | implicit `true` if linked (see §3.1) |

No `process.env.NEXT_PUBLIC_TELEGRAM_*` flag is needed — the UI checks `TELEGRAM_BOT_TOKEN` server-side and renders "coming soon" if absent.

---

## 9. Roadmap (execution order)

The order is load-bearing — each EPIC depends on the previous landing first.

1. **EPIC 1** — Telegram Infrastructure (env, webhook skeleton, outbound client). No DB, no UX. Mergeable with no user-visible change.
2. **EPIC 2** — Linking flow (DB schema, link token, `/start` handler, settings page). Mergeable; the only user-visible change is one settings tab.
3. **EPIC 3** — Event-driven dispatcher + preferences (no producers wired yet). Mergeable; pure infra.
4. **EPIC 6** — Templates & copy. Can land in parallel with 4 since it's pure functions.
5. **EPIC 4** — MVP notifications: wire `emit()` calls in producers, register handlers. **First user-visible feature.**
6. **EPIC 5** — Interactive actions (`confirmOrder`, `markAsShipped`).
7. **EPIC 7** — Hardening: rate limits, audit dashboards, anti-abuse.

EPIC 6 and 7 are *cross-cutting* and partially land alongside earlier epics; the issues below note the touchpoints.

---

## 10. Out-of-scope / future improvements

- **WhatsApp**: same dispatcher contract, new channel module under `domains/notifications/whatsapp/`. Requires Meta Business approval — months of lead time.
- **Web push**: `web-push` package + service worker integration; reuse the existing PWA service worker (see [docs/pwa.md](../pwa.md) — coordinate with the strict denylist).
- **Email**: lowest-risk add; reuse `RESEND_API_KEY`.
- **Customer-side Telegram** (order tracking notifications to buyers): reuses the same infra with a different bot or shared bot + role check.
- **Two-way conversation**: relaying chat messages between Telegram and the in-app messaging UI. Significant abuse surface; out of scope.
- **Admin notifications**: critical errors / payouts. Single channel, single recipient list — easy add post-MVP.

---

# EPIC 1 — Telegram Infrastructure

> **Parent issue.** Goal: stand up the bot wiring (env, webhook endpoint, outbound HTTP client) with no user-visible change. Foundation for every other EPIC.

## Issue 1.1 — Add Telegram env vars and config helper

**Description**
Add the env vars the bot needs and a single import-anywhere helper that returns the config or `null` if disabled.

**Tasks**
- [ ] Add to `.env.example`:
  - `TELEGRAM_BOT_TOKEN=`
  - `TELEGRAM_WEBHOOK_SECRET=`
  - `TELEGRAM_BOT_USERNAME=` (used to build the `t.me/<bot>?start=<token>` deep link)
- [ ] Document each in `docs/conventions.md` under "Environment variables".
- [ ] Add `src/domains/notifications/telegram/config.ts` exporting `getTelegramConfig(): { token, webhookSecret, botUsername } | null`.
- [ ] Unit test: returns `null` when token missing; returns full config when set.

**Acceptance criteria**
- `npm run typecheck` clean.
- `getTelegramConfig()` returns `null` if `TELEGRAM_BOT_TOKEN` is empty / undefined.
- No file outside `src/domains/notifications/` reads these env vars directly.

**Risks / edge cases**
- Don't expose the token to client bundles — `config.ts` must NOT have `'use client'` and must NOT be re-exported from the barrel.

**Dependencies**
None.

---

## Issue 1.2 — Telegram Bot API HTTP client

**Description**
Thin, typed wrapper around `https://api.telegram.org/bot<TOKEN>/<method>`. No third-party SDK (avoid version drift).

**Tasks**
- [ ] Create `src/domains/notifications/telegram/client.ts`.
- [ ] Implement `callBotApi<T>(method: string, body: unknown): Promise<T>` using `fetch`.
- [ ] Throw a typed `TelegramApiError` on non-`ok` responses; include `error_code` and `description`.
- [ ] No retries here — caller's responsibility (avoid silent retry of side-effecting `sendMessage`).
- [ ] Unit test with a `fetch` mock: success path + error path + network error.

**Acceptance criteria**
- Throws `TelegramApiError` with structured fields on `{ ok: false }`.
- 5s timeout via `AbortController`.
- Module is `@internal`, not in barrel.

**Risks**
- Telegram API rate limits (429). Out of scope for MVP — log and continue.

**Dependencies**
1.1.

---

## Issue 1.3 — Webhook route skeleton with secret verification

**Description**
Stand up `POST /api/telegram/webhook` that verifies both URL and header secrets, parses the update with Zod, and logs unknown updates. Always returns `200 OK` (Telegram retries on non-2xx).

**Tasks**
- [ ] Create `src/app/api/telegram/webhook/route.ts`.
- [ ] Read URL `?secret=` and `X-Telegram-Bot-Api-Secret-Token` header.
- [ ] Constant-time compare (`crypto.timingSafeEqual`) against `getTelegramConfig().webhookSecret`.
- [ ] If config is `null` → return `404` (feature disabled).
- [ ] If secret mismatch → return `200` with empty body; log a warning.
- [ ] Parse body with a Zod schema covering `message` and `callback_query` variants.
- [ ] On unknown update type → return `200`, log info.
- [ ] No business logic yet — controller is wired in EPIC 2 / 5.

**Acceptance criteria**
- Manual `curl` with wrong secret → 200, no log of payload contents.
- Manual `curl` with correct secret + valid update → 200, controller invoked (stub).
- `TELEGRAM_BOT_TOKEN` unset → 404 (feature dormant).
- Unit test for each branch.

**Risks**
- **Do not** add this route to the public sitemap or `robots.txt` rules — it must remain unindexed.
- Coordinate with [docs/pwa.md](../pwa.md): `/api/*` is already on the SW denylist; verify `/api/telegram/webhook` isn't accidentally cached.

**Dependencies**
1.1.

---

## Issue 1.4 — Setup runbook for the bot itself

**Description**
Document the manual one-time steps for ops.

**Tasks**
- [ ] Create `docs/runbooks/telegram-setup.md`.
- [ ] Cover: `@BotFather` flow, `setWebhook` `curl` snippet (with `secret_token`), `setMyCommands` payload, how to rotate `TELEGRAM_WEBHOOK_SECRET`.
- [ ] Cross-link from this RFC and from `docs/runbooks/` index if one exists.

**Acceptance criteria**
- A new dev can set up a working bot end-to-end following the runbook in under 15 minutes.

**Dependencies**
1.1, 1.3.

---

# EPIC 2 — User ↔ Telegram Linking

> **Parent issue.** Goal: a vendor can connect and disconnect their Telegram account through a secure deep-link flow.

## Issue 2.1 — Prisma schema: `TelegramLink` and `TelegramLinkToken`

**Description**
Add the two link-related tables. Additive migration only.

**Tasks**
- [ ] Add models per RFC §3.
- [ ] Add the `telegramLink` and `telegramLinkTokens` relations on `User`.
- [ ] Generate migration: `npm run db:migrate -- --name add_telegram_link`.
- [ ] Run `npm run audit:contracts`.

**Acceptance criteria**
- Migration is reversible (no `DROP COLUMN` on existing tables).
- `npm run db:migrate deploy` works against an empty DB and against a DB with prior data.
- Unique indexes on `userId` and `chatId` of `TelegramLink`.

**Risks**
- `chatId` MUST be `String`. Telegram `int64` may overflow JS number.

**Dependencies**
None.

---

## Issue 2.2 — Link token generator + validator

**Description**
Create / consume short-lived link tokens.

**Tasks**
- [ ] `src/domains/notifications/telegram/link-token.ts`.
- [ ] `generateLinkToken(userId: string): Promise<string>` — `crypto.randomBytes(24).toString('base64url')`, persist with `expiresAt = now + 10min`.
- [ ] `consumeLinkToken(token: string): Promise<{ userId: string } | null>` — atomic update setting `consumedAt` if and only if it's null and not expired (use `updateMany` with composite where + check rowsAffected).
- [ ] Reject reuse (returns `null` if `consumedAt` not null).
- [ ] Unit tests: happy path, expired, reused, unknown.

**Acceptance criteria**
- Token entropy ≥ 190 bits.
- Race: two simultaneous `consumeLinkToken` calls — only one succeeds.

**Dependencies**
2.1.

---

## Issue 2.3 — Server actions: `generateMyLinkUrl`, `disconnectTelegram`

**Description**
Vendor-facing server actions for the connect/disconnect UI.

**Tasks**
- [ ] `src/domains/notifications/telegram/link-actions.ts` (`'use server'`).
- [ ] `generateMyLinkUrl()`: requires VENDOR session via `getActionSession()` + `isVendor()`; calls `generateLinkToken()`; returns `https://t.me/<TELEGRAM_BOT_USERNAME>?start=<token>`.
- [ ] `disconnectTelegram()`: requires VENDOR session; sets `TelegramLink.isActive = false` for that user.
- [ ] Re-export both from `src/domains/notifications/index.ts` (barrel).
- [ ] Schema-validate any input; both are no-arg in MVP.

**Acceptance criteria**
- Customer (non-vendor) calling either → redirected to `/login`.
- `disconnectTelegram` called when no link exists → no-op, no throw.
- Follows the [server action pattern](../conventions.md#server-action-pattern-domain-logic) from conventions exactly.

**Dependencies**
2.2.

---

## Issue 2.4 — Webhook handler: `/start <token>` command

**Description**
When the bot receives `/start <token>`, validate the token, create or reactivate the `TelegramLink`, and reply.

**Tasks**
- [ ] In `telegram/controller.ts`, route `message.text` starting with `/start ` to a `handleStartCommand` function.
- [ ] Call `consumeLinkToken(token)`; on null reply "Token inválido o caducado. Genera uno nuevo en Ajustes."
- [ ] On success: `upsert` `TelegramLink` by `userId` with `chatId`, `username`, `isActive = true`, `lastSeenAt = now`. If a *different* user previously linked the same `chatId`, deactivate the old link (one chat = one user).
- [ ] Reply "✅ Conectado. Recibirás avisos de pedidos aquí."
- [ ] Also handle `/disconnect` (deactivate by chatId) and `/help` (static text).

**Acceptance criteria**
- Same token cannot link twice.
- Re-linking after disconnect works.
- Linking from a Telegram chat already used by another user deactivates the prior link.
- Unit test for each branch using mocked `client.callBotApi`.

**Risks**
- Two users sharing one Telegram account is an unusual but possible support case. Document the "one chat = one user" rule in the runbook.

**Dependencies**
2.2, 1.3.

---

## Issue 2.5 — Vendor settings page: connect / disconnect UI

**Description**
A small page under `(vendor)/ajustes/telegram` that shows current state and the connect / disconnect button.

**Tasks**
- [ ] Server Component `src/app/(vendor)/ajustes/telegram/page.tsx`.
- [ ] Server-side: `getTelegramConfig()` — if null, render "Próximamente" and stop.
- [ ] Otherwise: load current `TelegramLink` via a server query in this domain.
- [ ] Client child `TelegramConnectButton.tsx` ('use client'): calls `generateMyLinkUrl` server action and `window.open()`s the resulting `t.me` URL.
- [ ] If linked, show username + "Desconectar" calling `disconnectTelegram`.
- [ ] Add an entry to `src/lib/navigation.ts` under vendor settings; flip `available` correctly.
- [ ] Use Tailwind emerald palette per conventions.

**Acceptance criteria**
- Linked / unlinked / disabled states all render correctly.
- E2E (Playwright): a logged-in vendor sees the page and the button generates a `t.me/...?start=...` URL.

**Dependencies**
2.3.

---

# EPIC 3 — Event-Driven Notification System

> **Parent issue.** Goal: in-process event bus + per-user preferences. No producers wired yet — that's EPIC 4.

## Issue 3.1 — Event registry and payload schemas

**Description**
Define event names and Zod payload schemas in a single source-of-truth file.

**Tasks**
- [ ] `src/domains/notifications/events.ts` per RFC §4.1.
- [ ] Re-export from the barrel.
- [ ] Unit test: each schema rejects malformed payloads.

**Acceptance criteria**
- 100% type-safe `EventMap` derivable from the schemas.
- No `any`.

**Dependencies**
None.

---

## Issue 3.2 — Dispatcher implementation

**Description**
In-process pub/sub with strong typing and fire-and-forget semantics.

**Tasks**
- [ ] `src/domains/notifications/dispatcher.ts` — `@internal`, server-only.
- [ ] Implement `on(event, handler)` returning an unsubscribe fn.
- [ ] Implement `emit(event, payload)` that:
  - Validates payload with the matching schema (throws *only* in dev; in prod, logs and skips so producers can't be broken by a bad payload).
  - Iterates handlers via `queueMicrotask`.
  - Wraps each handler in try/catch; logs failures to console + `NotificationDelivery` with `status = FAILED`.
- [ ] Tests: typed handler subscription, emit invokes all handlers, handler throw doesn't break emitter, payload validation.

**Acceptance criteria**
- `emit` never throws into the caller in any environment.
- Subscribed handler receives correctly-typed payload (verified by `tsc`).
- Module excluded from barrel.

**Risks**
- **Hot-reload duplication** in dev: every HMR reload re-registers handlers. Use a `globalThis.__telegramDispatcher` singleton guard or register on a startup hook only. Document the chosen pattern in a code comment (this is exactly the kind of non-obvious WHY that warrants a comment per project conventions).

**Dependencies**
3.1.

---

## Issue 3.3 — Preference schema + server actions

**Description**
Add the `NotificationPreference` model and the server actions for reading/updating user preferences.

**Tasks**
- [ ] Add `NotificationChannel`, `NotificationEventType`, `NotificationPreference` to Prisma; migration `add_notification_preferences`.
- [ ] `preferences-schema.ts` with Zod schemas for inputs.
- [ ] `preferences-actions.ts` (`'use server'`):
  - `getMyPreferences()` → returns `Array<{ channel, eventType, enabled }>` with implicit defaults filled in (per RFC §3.1).
  - `setPreference({ channel, eventType, enabled })` → upsert.
- [ ] Re-export from barrel.

**Acceptance criteria**
- Implicit defaults: a vendor with `TelegramLink.isActive = true` and zero rows in `NotificationPreference` returns `enabled = true` for every event.
- Implicit defaults: a vendor without an active `TelegramLink` returns `enabled = false`.
- Per-event opt-out persists.

**Dependencies**
3.2, 2.1.

---

## Issue 3.4 — Preferences UI in vendor settings

**Description**
Add a "Notificaciones" section to the same settings page (or a sibling page) with one toggle per event type.

**Tasks**
- [ ] `src/app/(vendor)/ajustes/notificaciones/page.tsx` (Server Component) — load via `getMyPreferences`.
- [ ] `NotificationPreferencesForm.tsx` ('use client') — toggle row per event, calls `setPreference` on change.
- [ ] Disable toggles + show banner if `TelegramLink` is not active ("Conecta Telegram para activar avisos").
- [ ] Add `available: true` entry in `navigation.ts`.

**Acceptance criteria**
- Toggling an event persists.
- Page renders correctly when bot is disabled (env unset) — show the same "Próximamente" copy.

**Dependencies**
3.3.

---

# EPIC 4 — Telegram Notifications (MVP)

> **Parent issue.** First user-visible feature. Wires the dispatcher to producers and to the Telegram service.

## Issue 4.1 — Outbound Telegram service

**Description**
Service layer above `client.ts` that knows about `TelegramLink`, preferences, and rate-limiting.

**Tasks**
- [ ] `src/domains/notifications/telegram/service.ts` — `@internal`.
- [ ] `sendToUser(userId, eventType, { text, reply_markup })`:
  - Look up active `TelegramLink`; if none → log `SKIPPED`.
  - Look up preference for `(userId, TELEGRAM, eventType)`; if disabled → log `SKIPPED`.
  - Check rate limit (issue 7.1); if exceeded → log `SKIPPED`.
  - Call `client.callBotApi('sendMessage', …)`.
  - Log `SENT` or `FAILED` to `NotificationDelivery`.
- [ ] Tests for each branch with mocked client.

**Acceptance criteria**
- Never throws — failures only log.
- A `FAILED` row is written with the Telegram error description.

**Dependencies**
1.2, 2.1, 3.3.

---

## Issue 4.2 — Templates module

**Description**
Pure functions returning `{ text, reply_markup }` for each event type. Extracted so EPIC 6 can iterate copy without touching wiring.

**Tasks**
- [ ] `src/domains/notifications/telegram/templates.ts`.
- [ ] One exported function per event: `orderCreatedTemplate(payload)`, `orderPendingTemplate(payload)`, `messageReceivedTemplate(payload)`.
- [ ] Use HTML parse mode; escape user-controlled fields (`customerName`, `preview`) to prevent injection.
- [ ] Snapshot tests — render a fixture payload, snapshot the output JSON.

**Acceptance criteria**
- HTML in `customerName` is escaped (`<script>` → `&lt;script&gt;`).
- Buttons obey the 64-byte `callback_data` limit (asserted in tests).

**Dependencies**
3.1.

---

## Issue 4.3 — Handlers: subscribe to events, render, send

**Description**
The "glue" between dispatcher and service.

**Tasks**
- [ ] One file per handler under `telegram/handlers/`:
  - `on-order-created.ts` — derives `vendorId` from payload, calls `vendor.userId` lookup, `service.sendToUser(userId, 'ORDER_CREATED', orderCreatedTemplate(payload))`.
  - `on-order-pending.ts`
  - `on-message-received.ts`
- [ ] `handlers/index.ts` registers all three on `dispatcher`.
- [ ] Importing `handlers/index.ts` is what activates them — done from the webhook route module top-level (and from any other server entry point that needs them; for MVP the webhook route is sufficient since it's loaded on first webhook hit, but to be safe also import it from `app/layout.tsx` or a dedicated `instrumentation.ts`).
- [ ] Decide between `instrumentation.ts` and `layout.tsx` import based on whether the handlers must run before the first event — favor `instrumentation.ts` (Next.js officially supported startup hook) and document.

**Acceptance criteria**
- Emitting `order.created` results in one `sendMessage` call to the right chat.
- A handler that throws does not break `emit`.

**Risks**
- Handler registration **must not** double-register on hot-reload (covered by 3.2's singleton guard).

**Dependencies**
3.2, 4.1, 4.2.

---

## Issue 4.4 — Wire `emit()` calls in producer domains

**Description**
Add a single `emit()` call at three existing call sites. Each in its own commit for easy revert.

**Tasks**
- [ ] In `@/domains/orders/actions.ts` (`createOrder` success branch): `emit('order.created', { orderId, vendorId, customerName, totalCents, currency })`.
- [ ] In the order-state-machine transition that moves to "needs vendor confirmation": `emit('order.pending', …)`.
- [ ] In the messaging receive handler: `emit('message.received', …)`.
- [ ] Each producer imports from `@/domains/notifications` (barrel only).
- [ ] **No try/catch around `emit`** — by contract it never throws.
- [ ] Add a comment on each emit only if the *why* isn't obvious from context (per repo conventions, prefer no comment).

**Acceptance criteria**
- Existing tests for `createOrder` and friends still pass unchanged.
- New integration test: place an order in a test where a vendor has an active link and a stubbed Telegram client → asserts `sendMessage` was called.
- Disabling the bot (`TELEGRAM_BOT_TOKEN` unset) → all flows still pass.

**Risks**
- **Highest blast-radius issue in the whole RFC.** Reviewer must verify each producer call site touches *only* the new `emit` line — no surrounding refactor.

**Dependencies**
4.3.

---

# EPIC 5 — Telegram Actions (Interactive)

> **Parent issue.** Two actions: `confirmOrder`, `markAsShipped`. Reuse existing domain logic.

## Issue 5.1 — Action registry + dispatch

**Description**
Map `callback_data` action names to handlers; centralize parsing and ownership checks.

**Tasks**
- [ ] `telegram/actions/registry.ts`:
  - `callbackDataSchema = z.tuple([z.string(), z.string()])` parsing `"name:id"`.
  - `Map<string, (ctx) => Promise<void>>` registry.
  - `dispatch(callbackQuery)`: parse, look up handler, look up `TelegramLink` by `chat.id`, derive `userId`, call handler with `{ userId, targetId, callbackQueryId }`.
  - On unknown action: `answerCallbackQuery` with text "Acción no soportada".
- [ ] Wire into `controller.ts` for `callback_query` updates.
- [ ] Log every dispatch to `TelegramActionLog`.

**Acceptance criteria**
- Unknown actions don't crash; logged with `success = false`.
- Callback from a `chatId` with no `TelegramLink` → log + reply "Cuenta no vinculada".
- All success cases call `answerCallbackQuery` (Telegram requirement to dismiss spinner).

**Dependencies**
2.4.

---

## Issue 5.2 — Action: `confirmOrder`

**Description**
Reuse the existing `confirmOrder` domain action.

**Tasks**
- [ ] `telegram/actions/confirm-order.ts`.
- [ ] Verify ownership: load order, check `order.vendor.userId === ctx.userId`.
- [ ] Call the existing `@/domains/orders.confirmOrder` action (via barrel) — **do not duplicate logic**.
- [ ] On success: `answerCallbackQuery` "✅ Pedido confirmado", edit the original message to remove buttons.
- [ ] On state-transition failure: `answerCallbackQuery` "No se pudo confirmar (estado actual: …)".

**Acceptance criteria**
- A vendor cannot confirm another vendor's order (returns "Acción no autorizada", logged).
- A vendor cannot confirm an order in a non-confirmable state (existing FSM rejects, message reflects it).
- Idempotency: double-tap confirms once.

**Dependencies**
5.1, existing `confirmOrder` action.

---

## Issue 5.3 — Action: `markAsShipped`

**Description**
Same shape as 5.2, calling the existing shipping/order action that flips state to "shipped".

**Tasks**
- [ ] `telegram/actions/mark-shipped.ts`.
- [ ] Identify the right domain action (`@/domains/orders` or `@/domains/shipping` — confirm by reading current code; do NOT duplicate). If a "mark shipped" action doesn't exist as a single-call entry point, **stop** and open a separate issue to add one in the owning domain — do NOT inline logic in the Telegram layer.
- [ ] Same ownership + FSM checks as 5.2.

**Acceptance criteria**
- Reuses an existing shipping action; no business logic in the Telegram file.
- Failures from the shipping provider surface as a friendly Telegram message ("Reintenta en unos minutos") and a `TelegramActionLog` entry with the underlying error.

**Risks**
- Sendcloud failures shouldn't loop the user. After 1 failed attempt, the message stays as-is and we rely on the in-app dashboard for retry.

**Dependencies**
5.1.

---

## Issue 5.4 — Buttons appended to MVP notification templates

**Description**
Update templates from EPIC 4 to include the relevant inline buttons now that handlers exist.

**Tasks**
- [ ] `orderCreatedTemplate`: add `[ Confirmar ] [ Ver ]` (Confirm = callback, View = URL).
- [ ] `orderPendingTemplate`: add `[ Confirmar ] [ Ver ]` (or `[ Marcar enviado ]` depending on the `reason` field).
- [ ] Update snapshot tests.

**Acceptance criteria**
- Tapping "Confirmar" from a real Telegram chat in dev confirms the order.

**Dependencies**
5.2, 5.3, 4.2.

---

# EPIC 6 — UX & Messaging Design

> **Parent issue.** Cross-cutting. Most issues land alongside earlier epics; this one captures the explicit copy/UX deliverables.

## Issue 6.1 — Message copy review and i18n keys

**Description**
Audit every Telegram-facing string. Move to i18n keys per `src/i18n/README.md` if a flat-key bucket exists; otherwise centralize in `templates.ts`.

**Tasks**
- [ ] List every user-facing string in the Telegram code path.
- [ ] Decide flat-key vs `*-copy.ts` per i18n README.
- [ ] PR review by a Spanish-native (or whoever owns vendor copy).

**Acceptance criteria**
- Zero hard-coded strings outside `templates.ts` (or the equivalent copy module).

**Dependencies**
4.2.

---

## Issue 6.2 — Button labels and CTA standards

**Description**
Document the conventions in this RFC's §7 and enforce in code review.

**Tasks**
- [ ] Add a "Telegram copy style" section to `docs/conventions.md` or a sibling.
- [ ] Examples: verb-first, ≤ 14 chars per button label, max 2 buttons.

**Acceptance criteria**
- Style doc exists and is linked from the RFC.

**Dependencies**
None.

---

# EPIC 7 — Security & Validation

> **Parent issue.** Hardening. Some items (webhook secret, ownership checks) are already in earlier issues; this EPIC tracks anti-abuse and observability.

## Issue 7.1 — Per-user outbound rate limit

**Description**
Sliding-window throttle for `service.sendToUser`.

**Tasks**
- [ ] `telegram/rate-limit.ts` — in-memory `Map<userId, number[]>` of recent timestamps.
- [ ] Default: 30 messages / 5 min per user. Constants exported.
- [ ] When exceeded: `service.sendToUser` skips and logs `NotificationDelivery` `SKIPPED` with `error = "RATE_LIMITED"`.
- [ ] Tests with fake timers.

**Acceptance criteria**
- 31st message in a 5-minute window is dropped.
- After the window slides, sending resumes.

**Risks**
- In-memory state doesn't survive restarts — acceptable for MVP. Document this and note Redis as the upgrade path.

**Dependencies**
4.1.

---

## Issue 7.2 — Inbound webhook rate limit (per-IP)

**Description**
Defend against floods on `/api/telegram/webhook` (URL secret leak scenario).

**Tasks**
- [ ] In-memory token bucket keyed by `request.ip` (X-Forwarded-For at the edge if behind a proxy — pull from Next.js request headers).
- [ ] Default: 60 req / min per IP. On exceed → 200 with empty body, log warning.

**Acceptance criteria**
- Exceeding the limit doesn't crash the route or fill logs at line rate.

**Dependencies**
1.3.

---

## Issue 7.3 — Audit dashboard (admin)

**Description**
Tiny admin page listing recent `NotificationDelivery` and `TelegramActionLog` rows for support.

**Tasks**
- [ ] `src/app/(admin)/notificaciones/telegram/page.tsx` behind `requireAdmin`.
- [ ] Two paginated tables; filter by `userId`, `status`.
- [ ] Server Component, no client state.

**Acceptance criteria**
- An admin can confirm "did vendor X receive the order email" by reading the page.
- Non-admin sees 404 (per existing admin gating).

**Dependencies**
3.3, 4.1, 5.1.

---

## Issue 7.4 — Disconnect on repeated failures

**Description**
If `sendToUser` to a given user has failed `N` consecutive times with `403 Forbidden: bot was blocked by the user`, deactivate their `TelegramLink` and stop trying.

**Tasks**
- [ ] In `service.ts`, on `TelegramApiError` with `error_code === 403`, increment a counter; at threshold (e.g. 1, since 403 means definitive block), set `TelegramLink.isActive = false`.
- [ ] Test for the 403 branch.

**Acceptance criteria**
- A blocked user's link goes inactive on the first 403.
- They can reconnect via the normal flow (a fresh link consumes a new token, reactivates).

**Dependencies**
4.1.

---

## Issue 7.5 — Observability: structured logs

**Description**
Use a consistent log scope so payment-style runbooks (see [docs/runbooks/payment-incidents.md](../runbooks/payment-incidents.md)) are easy to write later.

**Tasks**
- [ ] All Telegram-domain logs use scope prefixes: `telegram.webhook.*`, `telegram.outbound.*`, `telegram.action.*`, `telegram.link.*`.
- [ ] Update `docs/runbooks/telegram-setup.md` (from 1.4) with example log queries.
- [ ] **Do not rename** these scopes once shipped — document them as a stable contract (mirrors the `checkout.*` / `stripe.webhook.*` rule in AGENTS.md).

**Acceptance criteria**
- A grep for `telegram.outbound.failed` returns the expected lines from a synthetic failure.

**Dependencies**
1.3, 4.1, 5.1.

---

# Appendices

## A. Example Telegram payloads

### A.1 Connect via deep link

User opens `https://t.me/marketplace_bot?start=VgY7n0xR9pK_Q3...` → Telegram opens chat → user taps **Start** → bot receives:

```json
{
  "update_id": 1001,
  "message": {
    "message_id": 1,
    "from": { "id": 12345, "username": "juan" },
    "chat": { "id": 12345, "type": "private" },
    "date": 1712345678,
    "text": "/start VgY7n0xR9pK_Q3..."
  }
}
```

Bot replies (via `sendMessage`):
```json
{
  "chat_id": 12345,
  "text": "✅ Conectado. Recibirás avisos de pedidos aquí."
}
```

### A.2 Order-created notification

```json
{
  "chat_id": 12345,
  "text": "📦 Nuevo pedido <b>#ABC123</b>\nJuan García — €45,00",
  "parse_mode": "HTML",
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "Confirmar", "callback_data": "confirmOrder:ord_ABC123" },
      { "text": "Ver",       "url": "https://app.example.com/vendor/pedidos/ord_ABC123" }
    ]]
  }
}
```

### A.3 User taps "Confirmar"

```json
{
  "update_id": 1002,
  "callback_query": {
    "id": "cb-xyz",
    "from": { "id": 12345, "username": "juan" },
    "message": { "chat": { "id": 12345 }, "message_id": 7 },
    "data": "confirmOrder:ord_ABC123"
  }
}
```

Bot must reply within ~15s:
```json
{ "callback_query_id": "cb-xyz", "text": "✅ Pedido confirmado" }
```
…and edits the original message to remove the inline keyboard.

## B. Local dev with the bot

1. `ngrok http 3000` → grab `https://abc.ngrok.app`.
2. `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://abc.ngrok.app/api/telegram/webhook?secret=<SECRET>&secret_token=<SECRET>"`.
3. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_USERNAME` in `.env.local`.
4. Restart `npm run dev`.

## C. Future channels — what stays, what changes

| Component | Reused for Email/Push/WhatsApp? |
|---|---|
| `events.ts` | Yes — channel-agnostic |
| `dispatcher.ts` | Yes |
| `NotificationPreference` (with new `channel` enum value) | Yes |
| `NotificationDelivery` audit | Yes |
| `templates.ts` | New per-channel module |
| `service.ts` (Telegram) | New per-channel `service.ts` |
| `actions/*` | Telegram-specific; no equivalent in email / push (one-way channels) |
| Webhook route | Replaced per channel (e.g. `/api/email/inbound` for replies) |

## D. PR checklist (per [ai-guidelines §8](../ai-guidelines.md#8-checklist-before-opening-a-pr))

For every PR in this rollout:

- [ ] Domain barrel only re-exports client-safe modules.
- [ ] No cross-domain deep import outside the documented allowlist.
- [ ] Prisma migration is single-deploy safe.
- [ ] No `any` introduced.
- [ ] `npm run lint`, `npm run typecheck`, `npm run audit:contracts` clean.
- [ ] If feature toggled: verified that `TELEGRAM_BOT_TOKEN` unset leaves all existing flows unchanged.
