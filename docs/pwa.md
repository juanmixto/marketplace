# Progressive Web App

The marketplace ships as a full-featured installable PWA. This doc is the
single source of truth for anyone touching [`public/sw.js`](../public/sw.js),
[`src/app/manifest.ts`](../src/app/manifest.ts), or anything under
[`src/components/pwa/`](../src/components/pwa/),
[`src/lib/pwa/`](../src/lib/pwa/), or
[`src/app/icons/`](../src/app/icons/).

If you change any of those files, **re-read this doc first** and keep it up
to date in the same PR.

## Architecture

```
src/app/manifest.ts                     → Next metadata API → /manifest.webmanifest
src/app/icons/icon-*.png/route.tsx      → ImageResponse icons (192, 512, maskable 512)
src/app/icons/shortcut-*.png/route.tsx  → Manifest shortcut icons (search/cart/orders)
src/app/screenshots/home-*.png/route.tsx → Deterministic install screenshots
src/app/offline/page.tsx                → Offline fallback shell
src/app/share-target/page.tsx           → Web Share Target receiver
src/app/api/catalog/featured/route.ts   → Lightweight catalog endpoint for periodic sync

src/lib/pwa/brand-icon.tsx              → Shared icon renderer
src/lib/pwa/brand-screenshot.tsx        → Shared screenshot renderer
src/lib/pwa/track.ts                    → pwa_* analytics events helper
src/lib/pwa/share-target.ts             → URL/text → redirect resolution
src/lib/pwa/push-config.ts              → VAPID env loader (null when unset)
src/lib/pwa/push-send.ts                → Server-side push dispatch (web-push)
src/lib/pwa/push-client.ts              → Client push subscribe/unsubscribe
src/lib/pwa/use-app-badge.ts            → Badging API hook
src/lib/pwa/prefetch-cache.ts           → Read the periodic-sync cache
src/lib/pwa/sync-queue.ts               → IndexedDB queue for bg sync replay

src/components/pwa/PwaRegister.tsx      → Registers SW, captures install prompt, periodic sync, update flow
src/components/pwa/InstallButton.tsx    → Android/desktop Chrome install CTA
src/components/pwa/IosInstallHint.tsx   → iOS Safari "Add to Home Screen" hint
src/components/pwa/UpdateToast.tsx      → "New version available" skip-waiting UI
src/components/pwa/OfflineIndicator.tsx → Fixed offline banner
src/components/pwa/AppBadgeSync.tsx     → Feeds numeric counts to the OS icon badge
src/components/pwa/PushOptIn.tsx        → Opt-in/out button for push notifications

prisma/schema.prisma:PushSubscription   → Endpoint / keys / userAgent
public/sw.js                            → Versioned: mp-sw-vN
```

## Feature matrix

| Feature                        | Issue | Browsers             | Status       |
|--------------------------------|-------|----------------------|--------------|
| Installability + manifest      | #425  | Chrome/Edge/Safari   | ✅ shipped   |
| Install CTA                    | #426  | Chrome Android/desktop | ✅ shipped |
| Offline fallback               | #427  | all                  | ✅ shipped   |
| Runtime static asset cache     | #428  | all                  | ✅ shipped   |
| iOS install hint + playbook    | #429  | Safari iOS           | ✅ shipped   |
| Manifest shortcuts + screenshots | #444 | Chrome Android       | ✅ shipped   |
| SW update toast                | #445  | all                  | ✅ shipped   |
| Lighthouse CI gate             | #446  | CI                   | ✅ shipped   |
| App badge                      | #447  | Chrome desktop/Android | ✅ shipped |
| Install funnel analytics       | #448  | all                  | ✅ shipped   |
| Web Share Target               | #465  | Chrome Android       | ✅ shipped   |
| Push notifications             | #463  | Chrome/Edge/Firefox/Safari 16.4+ | ✅ shipped (gated by VAPID env) |
| Periodic background sync       | #466  | Chrome Android/desktop | ✅ shipped |
| Background sync queue          | #464  | Chrome/Edge          | ✅ shipped   |

## Service worker

The SW is versioned via `SW_VERSION` in `public/sw.js`. Current: **`mp-sw-v4`**.

### Caches

| Cache name         | Phase | Contents                                   | Strategy                |
|--------------------|-------|--------------------------------------------|-------------------------|
| `mp-offline-v1`    | 2     | `/offline` only                            | Precache on install     |
| `mp-static-v1`     | 3     | `/_next/static/*`, icons, favicons, OG     | Stale-while-revalidate, LRU 60 |
| `mp-prefetch-v1`   | Fase3 | `/api/catalog/featured?limit=12` JSON      | Replaced on periodic sync |

On `activate` the SW deletes any cache not in the current allow-list. That's
how old versions get pruned when we bump `SW_VERSION`.

### Event handlers in `sw.js`

| Event              | Purpose                                                   |
|--------------------|-----------------------------------------------------------|
| `install`          | Precache `/offline`, call `skipWaiting`                   |
| `activate`         | Prune caches outside allow-list, call `clients.claim`     |
| `fetch`            | Navigation fallback + static asset SWR (denylist enforced)|
| `message`          | Handle `SKIP_WAITING` from UpdateToast                    |
| `push`             | Show OS notification with icon/badge/vibrate              |
| `notificationclick`| Focus existing tab or open new one at target URL          |
| `periodicsync`     | Tag `mp-catalog-prefetch` — refresh catalog JSON (respects save-data) |
| `sync`             | Tag `mp-cart-sync` — replay queued IDB mutations (denylist enforced) |

### Allow-list: what the SW CAN cache

- Content-addressed build output: `/_next/static/*` (incl. `next/font` `.woff2`)
- Manifest icons: `/icons/icon-*.png`
- Brand files: `/favicon.svg`, `/favicon.ico`, `/opengraph-image`, `/twitter-image`
- The precached `/offline` shell
- Catalog prefetch: `/api/catalog/featured?limit=12` (only from periodic sync, read-only cache)

Everything else is pass-through — the SW does not call `respondWith` for it.

### Denylist: what the SW must NEVER cache or replay

Checked before the allow-list, enforced on every fetch and on every sync replay:

- `/api/*` — server actions, REST endpoints, webhooks
- `/admin/*` — admin panel
- `/vendor/*` — vendor portal
- `/checkout/*` — buy flow
- `/auth/*` — NextAuth routes

Additionally, the background sync `sync` handler has a **second-layer**
payment denylist (`/api/checkout`, `/api/orders`, `/api/stripe`) that
discards any entry matching those prefixes — defense in depth against
accidental payment replays.

Navigations to denylisted prefixes also bypass the offline fallback. The
user sees the browser's native error, not a misleading offline shell.

## Install prompts

| Platform              | Mechanism                                                |
|-----------------------|----------------------------------------------------------|
| Chrome desktop        | `<InstallButton />` via `beforeinstallprompt`            |
| Chrome/Edge Android   | `<InstallButton />` via `beforeinstallprompt` + rich card with screenshots |
| Safari iOS            | `<IosInstallHint />` points to Share → Add to Home Screen |
| Safari macOS          | Native "Install" in the share sheet (no UI needed)       |

`InstallButton` is rendered in the public `Header`, hidden on `/admin`,
`/vendor`, `/checkout`. `IosInstallHint` is rendered in
`src/app/(public)/layout.tsx`, i.e. only on public pages — never during
a buy flow.

## Manifest shortcuts

Long-press the installed icon on Android shows three quick actions:

- **Buscar productos** → `/buscar?source=pwa-shortcut`
- **Mi carrito** → `/carrito?source=pwa-shortcut`
- **Mis pedidos** → `/cuenta/pedidos?source=pwa-shortcut`

Each has a dedicated emoji icon rendered via `ImageResponse` at 96×96.

## Push notifications (#463)

### Env setup

```bash
# Generate:
npx web-push generate-vapid-keys

# .env:
NEXT_PUBLIC_VAPID_PUBLIC_KEY="B..."
VAPID_PRIVATE_KEY="..."
```

Without these env vars, the entire push layer degrades silently:
- `<PushOptIn />` hides itself
- `subscribeToPush` server action throws "not configured"
- `sendPushToUser()` returns 0

### Data flow

1. User clicks `<PushOptIn />` → `Notification.requestPermission()`
2. If granted → `registration.pushManager.subscribe({ applicationServerKey })`
3. Client sends `{endpoint, p256dh, auth, userAgent}` to `subscribeToPush` server action
4. Server upserts to `PushSubscription` by endpoint
5. Backend code calls `sendPushToUser(userId, { title, body, url })` at will
6. `web-push` encrypts + delivers; 404/410 responses auto-clean stale rows
7. SW `push` handler shows notification; `notificationclick` focuses or opens target

### Triggering a push from backend code

```ts
import { sendPushToUser } from '@/lib/pwa/push-send'

await sendPushToUser(userId, {
  title: 'Pedido enviado',
  body: 'Tu pedido #1234 ya está en camino.',
  url: '/cuenta/pedidos/1234',
  tag: 'order-1234',
})
```

## Web Share Target (#465)

When the PWA is installed, the OS share sheet lists "Mercado Productor".
Shared content is routed via `GET /share-target?title=&text=&url=` and
resolved in `src/lib/pwa/share-target.ts`:

| Shared content                    | Lands on                                    |
|-----------------------------------|---------------------------------------------|
| Own-domain product URL            | `/productos/<slug>?source=share-target`     |
| Own-domain vendor URL             | `/productores/<slug>?source=share-target`   |
| Plain text (URLs stripped)        | `/buscar?q=<text>&source=share-target`      |
| Empty / only-whitespace           | `/?source=share-target`                     |

Text is capped at 100 characters. External URLs are stripped before the
search fallback so we never search `"https://..."`.

## Periodic background sync (#466)

Chrome-only. At 12h intervals (gated by site engagement score), the SW
fires `periodicsync` with tag `mp-catalog-prefetch`:

1. Checks `navigator.connection.saveData` — aborts if true
2. Checks `effectiveType` — aborts on `slow-2g`/`2g`
3. Fetches `/api/catalog/featured?limit=12` (public JSON, no auth, `s-maxage=300`)
4. Stores in `mp-prefetch-v1` cache
5. Posts `{type: 'catalog-prefetched'}` to open clients

Clients can use `readPrefetchedCatalog()` to grab the cached payload as
initial state on open; then revalidate with a fresh fetch. Safari/Firefox
skip the entire feature — the app simply loads fresh on open.

## Background sync queue (#464)

For safe-to-retry non-payment mutations (favorites, etc.) that fail due to
network. IndexedDB-backed at `mp-sync-queue` → store `pending`.

```ts
import { enqueueForSync, requestBackgroundSync } from '@/lib/pwa/sync-queue'

try {
  await fetch('/api/favoritos/prod123', { method: 'POST' })
} catch {
  await enqueueForSync('/api/favoritos/prod123', 'POST', null)
  await requestBackgroundSync()
}
```

On reconnect, the SW `sync` handler replays each entry. Rules:

- Expired entries (`now - createdAt > maxAge`, default 1h) → discarded
- Payment prefixes (`/api/checkout`, `/api/orders`, `/api/stripe`) → discarded unreplayed
- Success (2xx) or 409 Conflict → entry removed
- Other 4xx/5xx or network error → entry stays for next sync attempt

**Caller responsibility**: call `clearSyncQueue()` on sign-out to prevent
stale mutations replaying under a different session.

Safari/Firefox fallback: watch `window.online` and retry from the queue
in the main thread.

## App badge (#447)

`useAppBadge(count)` hook wraps `navigator.setAppBadge`/`clearAppBadge`.
Currently wired:

- Buyer layout → pending review count (via `getPendingReviewsCount`)
- Vendor layout → active fulfillment count (`PENDING | CONFIRMED | PREPARING | READY`)

Degrades silently on unsupported browsers (Safari iOS, Firefox, Linux Chrome).

## Analytics events (#448)

All emitted via `trackPwaEvent()` in `src/lib/pwa/track.ts`. Each event is
tagged with `{ua: 'android'|'ios'|'desktop'|'unknown', source_url: <path>}`.

| Event                         | Where emitted                    |
|-------------------------------|----------------------------------|
| `pwa_installable`             | PwaRegister (`beforeinstallprompt`) |
| `pwa_install_prompted`        | InstallButton click              |
| `pwa_install_accepted`        | InstallButton (`userChoice.accepted`) |
| `pwa_install_dismissed`       | InstallButton (`userChoice.dismissed`) |
| `pwa_installed`               | PwaRegister (`appinstalled`)     |
| `pwa_launched_standalone`     | PwaRegister on first render      |
| `pwa_ios_hint_shown`          | IosInstallHint reveal            |
| `pwa_ios_hint_dismissed`      | IosInstallHint dismiss           |
| `pwa_share_target_received`   | ShareTargetPage (reserved, not wired in route) |

## Bumping the SW version

1. Edit `SW_VERSION` in `public/sw.js`.
2. If you add a new cache, add its name to the `allowed` Set in `activate`.
3. If you remove a cache, leave the name out of `allowed` so it gets purged.
4. Deploy. `UpdateToast` offers "Update now" to active users; users on
   closed tabs pick up the new SW on next visit.

## Debugging a stuck SW on a real device

1. Chrome DevTools › Application › Service Workers → "Unregister"
2. Application › Storage → "Clear site data" (check all boxes)
3. Hard reload

iOS Safari:

1. Settings › Safari › Advanced › Website Data → find the site → Delete
2. If installed as a PWA, long-press the home screen icon → Delete

## Validation playbook (manual)

Run this after any change to the PWA surface.

### Chrome desktop
- [ ] `npm run build && npm start`
- [ ] DevTools › Application › Manifest: zero errors, 3 icons + 3 shortcuts + 2 screenshots
- [ ] Service Workers: active, scope `/`, version matches `SW_VERSION`
- [ ] Cache Storage: `mp-offline-v1`, `mp-static-v1` present; `mp-prefetch-v1` appears after periodic sync
- [ ] Lighthouse › PWA audit › "Installable": ✅
- [ ] Lighthouse › Performance on repeat visit: ≥ first-visit score
- [ ] Install via URL bar icon → app launches in its own window in `standalone` mode
- [ ] App badge: installed app icon shows pending review count (buyer) or pending fulfillments (vendor)

### Chrome Android (real device, not emulator)
- [ ] "Add to Home Screen" offered in the browser menu **with rich card** (narrow screenshot visible)
- [ ] Installed app launches in `standalone`
- [ ] Long-press installed icon shows 3 shortcuts (Buscar, Carrito, Pedidos)
- [ ] Login via NextAuth works (cookies persist across launches)
- [ ] Checkout completes (mock + real Stripe)
- [ ] Offline mode: top-level navigations fall back to `/offline`; `/admin`, `/vendor`, `/checkout` show browser error
- [ ] `<InstallButton />` disappears after install; `<IosInstallHint />` never appears
- [ ] Share a product URL from Chrome to the installed app → deep-links correctly

### Safari iOS (real device)
- [ ] Visit the public site → `<IosInstallHint />` appears after 3s
- [ ] Dismiss → doesn't reappear for 14 days
- [ ] Share → Add to Home Screen → icon uses `siteAppearance.themeColor` background
- [ ] Launched from home screen: status bar matches `appleWebApp.statusBarStyle`
- [ ] Login via NextAuth works in the standalone window
- [ ] Checkout completes

### Push notifications (Chrome / Edge / Firefox / Safari 16.4+)
- [ ] With VAPID env set: `<PushOptIn />` visible in account settings
- [ ] Click → OS permission prompt → subscription row created in DB
- [ ] `await sendPushToUser(userId, {title, body, url})` from a server action → notification appears
- [ ] Click notification → opens target URL in existing tab or new window
- [ ] Click `<PushOptIn />` again → unsubscribes + removes DB row
- [ ] Without VAPID env: `<PushOptIn />` hidden, no errors in console

### Update flow
- [ ] Bump `SW_VERSION`, redeploy → open tab shows `<UpdateToast />` within seconds
- [ ] Click "Update now" → single reload → new SW active
- [ ] First-time visitors don't see the toast

### Regression checks
- [ ] `/api/*` requests never show `(ServiceWorker)` in the Network tab
- [ ] `/admin`, `/vendor`, `/checkout`, `/auth` navigations never show `(ServiceWorker)`
- [ ] Product prices and stock update on every load (no stale HTML served from cache)
- [ ] Hard refresh after editing a non-hashed public asset picks up the change within one navigation (SWR)
- [ ] Offline indicator appears immediately when network drops, disappears on reconnect

## Out of scope (for now)

- In-app notification center (push exists; persistent inbox UI is a separate product decision)
- User preferences UI for push event types (send-all vs per-event toggle — Phase B)
- Background sync for checkout recovery (needs Stripe idempotency infra — blocked)
- Web Share Target with `POST`/image upload (needs support ticket integration)

Open an issue labeled `pwa` if you want to pick any of these up.
