# Auth / proxy deployment contract

Context for [`src/lib/auth.ts`](../src/lib/auth.ts), [`src/lib/auth-host.ts`](../src/lib/auth-host.ts), [`src/lib/auth-env.ts`](../src/lib/auth-env.ts), and [`src/proxy.ts`](../src/proxy.ts). Read before changing anything that touches `getToken`, cookie names, or the HTTPS posture of the app.

## Production topology

```
browser  ──HTTPS──▶  Cloudflare  ──HTTP──▶  Next.js origin
```

- Cloudflare terminates TLS. The origin always sees `http://` and only the Cloudflare-attached hostname.
- `cf-connecting-ip` / `x-forwarded-for` / `x-forwarded-proto` arrive on every request. Rate limiting (#540) and audit logging prefer `cf-connecting-ip`.
- NextAuth cookies on a production host:
  - Session: `__Secure-authjs.session-token` (HTTPS, `__Secure-` prefix)
  - CSRF: `__Host-authjs.csrf-token`

## Required environment (production)

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_URL` | preferred | Public HTTPS URL (e.g. `https://app.example`). Drives cookie prefix + callback URL. On Vercel we can fall back to the platform's production/deployment URL when this is absent. |
| `NEXTAUTH_URL` | fallback | Accepted as an alias for `AUTH_URL` (NextAuth v5 beta still reads it). If both are set they must match. |
| `NEXT_PUBLIC_APP_URL` | preferred | Must resolve to the same `origin` as `AUTH_URL`. A split-brain drops the session cookie on redirect. |
| `AUTH_SECRET` | yes | JWT signing secret. Accepted as `NEXTAUTH_SECRET` alias. |

`validateAuthDeploymentContract()` in [`src/lib/auth-env.ts`](../src/lib/auth-env.ts) enforces the invariants above and is wired into the boot path. Tests live at [`test/features/auth-env.test.ts`](../test/features/auth-env.test.ts).

## Proxy / `getToken` pitfall

`getToken()` auto-detects the cookie name from the request URL's protocol. At the origin the request is `http://`, so auto-detect would pick `authjs.session-token` — but NextAuth set `__Secure-authjs.session-token`. Every protected request would 302 to `/login`.

Fix: the edge proxy passes `secureCookie: isSecureAuthDeployment(process.env)`, which resolves from `AUTH_URL`, not the request. If you touch that call, keep the explicit `secureCookie` argument. A regression test is on the roadmap once we have a fixture harness for the Edge runtime.

## Dev mode

`auth-host.ts` has special handling so `next dev` on `localhost:3000` (or `0.0.0.0` / private-network hostnames) works without requiring a pinned `AUTH_URL`. The relevant helpers (`shouldUseDynamicAuthUrl`, `normalizeAuthHostEnv`, `applyNormalizedAuthHostEnv`) only activate when `NODE_ENV !== 'production'`.

## Changing this contract

1. Update `validateAuthDeploymentContract()` so the new invariant is enforced.
2. Update this doc.
3. Update [`test/features/auth-env.test.ts`](../test/features/auth-env.test.ts) with cases covering both the passing and failing shapes.
4. Coordinate with ops before shipping — a mis-set env var is downtime for every logged-in user.
