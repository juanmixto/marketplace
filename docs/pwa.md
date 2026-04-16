# Progressive Web App

The marketplace ships as an installable PWA. This doc is the single source of
truth for anyone touching [`public/sw.js`](../public/sw.js),
[`src/app/manifest.ts`](../src/app/manifest.ts), or the
[`src/components/pwa/`](../src/components/pwa/) components.

If you change any of those files, **re-read this doc first** and keep it up
to date in the same PR.

## Architecture

```
src/app/manifest.ts                     → Next metadata API → /manifest.webmanifest
src/app/icons/icon-*.png/route.tsx      → ImageResponse PNG icons (192, 512, maskable 512)
src/lib/pwa/brand-icon.tsx              → shared icon renderer
public/sw.js                            → service worker (versioned: mp-sw-vN)
src/components/pwa/PwaRegister.tsx      → registers sw.js (production only)
src/components/pwa/InstallButton.tsx    → Android/desktop Chrome install CTA
src/components/pwa/IosInstallHint.tsx   → iOS Safari "Add to Home Screen" hint
src/app/offline/page.tsx                → offline fallback shell
```

The PWA was built in incremental phases (issues #425 → #429). Each phase
leaves the SW in a known-good state with a clear cache allow-list.

## Service worker caches

| Cache name       | Phase | Contents                                        | Strategy               |
|------------------|-------|-------------------------------------------------|------------------------|
| `mp-offline-v1`  | 2     | `/offline` only                                 | Precache on install    |
| `mp-static-v1`   | 3     | `/_next/static/*`, `/icons/icon-*.png`, favicons, OG/twitter images | Stale-while-revalidate, LRU 60 entries |

**On `activate`** the SW deletes any cache not in the current allow-list.
That's how old versions get pruned when we bump `SW_VERSION`.

## What the SW is allowed to cache

- Content-addressed build output: `/_next/static/*` (includes `next/font`
  `.woff2`)
- Manifest icons: `/icons/icon-*.png`
- Brand files: `/favicon.svg`, `/favicon.ico`, `/opengraph-image`,
  `/twitter-image`
- The precached `/offline` shell

Everything else is pass-through — the SW does not call `respondWith` for it.

## What the SW must NEVER cache

These prefixes are on an explicit denylist checked before the allow-list:

- `/api/*` — all server actions, REST endpoints, webhooks
- `/admin/*` — admin panel
- `/vendor/*` — vendor portal
- `/checkout/*` — buy flow
- `/auth/*` — NextAuth routes

Navigations to these prefixes also bypass the offline fallback. If the user
is offline on an auth or admin screen, they see the browser's native error,
not the `/offline` shell — that would be more confusing than helpful.

## Bumping the SW version

1. Edit `SW_VERSION` in `public/sw.js` (e.g. `mp-sw-v3` → `mp-sw-v4`).
2. If you add a new cache, add its name to the `allowed` Set in
   `activate` so it survives the prune.
3. If you remove a cache, leave the name out of `allowed` so it gets
   purged for all existing users on next activation.
4. Deploy. The new SW installs in the background, waits for old tabs to
   close, then takes over (we call `skipWaiting` + `clients.claim` so
   activation is immediate on first load).

## Debugging a stuck SW on a real device

1. Chrome DevTools › Application › Service Workers → "Unregister"
2. Application › Storage → "Clear site data" (checks all boxes)
3. Hard reload

On iOS Safari:

1. Settings › Safari › Advanced › Website Data → find the site → Delete
2. If installed as a PWA, long-press the home screen icon → Delete

## Install prompts

| Platform              | Mechanism                                        |
|-----------------------|--------------------------------------------------|
| Chrome desktop        | `<InstallButton />` via `beforeinstallprompt`    |
| Chrome/Edge Android   | `<InstallButton />` via `beforeinstallprompt`    |
| Safari iOS            | `<IosInstallHint />` points to Share → Add to Home Screen |
| Safari macOS          | Native "Install" in the share sheet (no UI needed) |

`InstallButton` is rendered in the public `Header`, hidden on `/admin`,
`/vendor`, `/checkout`. `IosInstallHint` is rendered in
`src/app/(public)/layout.tsx`, i.e. only on public pages — never during a
buy flow.

## Validation playbook (manual)

Run this after any change to the PWA surface.

### Chrome desktop
- [ ] `npm run build && npm start`
- [ ] DevTools › Application › Manifest: zero errors, 3 icons visible
- [ ] DevTools › Application › Service Workers: active, scope `/`, version matches `SW_VERSION`
- [ ] DevTools › Application › Cache Storage: only current caches listed, contents match the allow-list
- [ ] Lighthouse › PWA audit › "Installable": ✅
- [ ] Lighthouse › Performance on repeat visit: ≥ first-visit score
- [ ] Install via URL bar icon → app launches in its own window in `standalone` mode

### Chrome Android (real device, not emulator)
- [ ] "Add to Home Screen" offered in the browser menu
- [ ] Installed app launches in `standalone`
- [ ] Login via NextAuth works (cookies persist across launches)
- [ ] Checkout completes (mock + real Stripe)
- [ ] Offline mode: top-level navigations fall back to `/offline`, `/admin` and `/vendor` surface the native error
- [ ] `<InstallButton />` disappears after install; `<IosInstallHint />` never appears

### Safari iOS (real device)
- [ ] Visit the public site → `<IosInstallHint />` appears after 3s
- [ ] Dismiss → doesn't reappear for 14 days (check `mp.pwa.iosHint.dismissedAt` in localStorage)
- [ ] Share → Add to Home Screen → icon uses `siteAppearance.themeColor` background
- [ ] Launched from home screen: status bar matches `appleWebApp.statusBarStyle`
- [ ] Login via NextAuth works in the standalone window
- [ ] Checkout completes

### Regression checks
- [ ] `/api/*` requests never show `(ServiceWorker)` in the Network tab
- [ ] `/admin`, `/vendor`, `/checkout`, `/auth` navigations never show `(ServiceWorker)`
- [ ] Product prices and stock update on every load (no stale HTML served from cache)
- [ ] Hard refresh after editing a non-hashed public asset picks up the change within one navigation (SWR)

## Out of scope (for now)

- Push notifications (would need VAPID keys + backend; deferred)
- App shortcuts in the manifest (nice-to-have)
- Web Share Target API (nice-to-have)
- Background sync for pending cart actions (needs careful thought around auth)

Open an issue labeled `pwa` if you want to pick any of these up.
