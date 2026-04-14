# Admin host isolation

Ticket: [#348](https://github.com/juanmixto/marketplace/issues/348)

## What this is

The admin panel (`/admin/**`) can be served on a dedicated host (e.g.
`admin.marketplace.example`) separate from the public storefront
(`marketplace.example`). When enabled:

- `/admin/**` requests on the public host get redirected to the admin host.
- Non-admin paths on the admin host return 404 (no public pages, no product listings, no checkout).
- The NextAuth session cookie is **host-only** (no `Domain` attribute), so the cookie set on `marketplace.example` is **not** sent to `admin.marketplace.example`, and vice versa. Compromising one host's session cookie does not grant access to the other.

This is enforced in one place: [`src/proxy.ts`](../src/proxy.ts). The host comparison lives in [`src/lib/admin-host.ts`](../src/lib/admin-host.ts) and is unit-tested in [`test/features/proxy.test.ts`](../test/features/proxy.test.ts).

## How to enable (ops checklist)

1. **DNS**: create a `CNAME` or `A` record for `admin.<your-domain>` pointing at the same deployment as the public host.
2. **TLS**: provision a certificate that covers `admin.<your-domain>`. On Vercel/Netlify this happens automatically once the domain is added to the project.
3. **Environment**: set `ADMIN_HOST=admin.<your-domain>` in the deployment environment. No prefix (`https://`), no path, no port. Example: `ADMIN_HOST=admin.marketplace.example`.
4. **Deploy**: once the env var is set, the next deploy will start enforcing host isolation.
5. **Verify**:
   - `curl -I https://<public-host>/admin/dashboard` → `307` redirect to `https://<admin-host>/admin/dashboard`
   - `curl -I https://<admin-host>/productos` → `404`
   - Log in at `https://<public-host>/login?callbackUrl=/admin/dashboard` as an admin — you should land on `https://<admin-host>/admin/dashboard` with a fresh admin session cookie.
   - Open DevTools → Application → Cookies. The session cookie for `<admin-host>` should be a **different** cookie from the one on `<public-host>`.

## How to disable

Unset `ADMIN_HOST`. With no env var, the middleware behaves exactly as before (single-host mode). This is the default and is safe for local development.

## Local development

For local testing, map `admin.localhost` to `127.0.0.1` (your OS already does this for `*.localhost`), then set:

```
ADMIN_HOST=admin.localhost:3000
```

Visit the app via `http://admin.localhost:3000/admin/dashboard` and `http://localhost:3000` in parallel browser profiles to verify isolation.

## What this does NOT do (yet)

- **Cross-domain login handoff**: today, if an admin logs in on the public host and is redirected to the admin host, they will land on the admin host **without** a session and have to re-authenticate. A seamless handshake (signed one-time token exchanged for a session on the admin host) is out of scope for this ticket — see the [#348 description](https://github.com/juanmixto/marketplace/issues/348) for the design sketch. For now, document to admins that they should log in directly at `https://<admin-host>/login`.
- **IP allowlist**: the `ADMIN_IP_ALLOWLIST` feature mentioned in the ticket is intentionally deferred.
- **CSP hardening on the admin host specifically**: deferred. The same CSP is served for both hosts until a follow-up ticket.

## Invariants this ticket depends on

- The NextAuth session cookie must remain **host-only** (no explicit `Domain` attribute). This is the default in [`src/lib/auth-host.ts`](../src/lib/auth-host.ts) today. If a future change adds `Domain=<parent-domain>`, the isolation is silently defeated. Keep this in mind when modifying cookie config.
- `ADMIN_HOST` must NOT overlap with the public host. The middleware will happily treat them as the same if they match, removing the protection.
