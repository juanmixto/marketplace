# Google OAuth — provider setup

Steps to register the marketplace as an OAuth client in Google Cloud
Console and wire the resulting credentials to the deployment.

## 1. Cloud Console

1. https://console.cloud.google.com → create or pick the project.
2. APIs & Services → OAuth consent screen.
   - User type: **External**.
   - App name: *Marketplace* (or environment-specific: *Marketplace (staging)*).
   - User support email + developer contact: ops alias.
   - Authorized domains: `feldescloud.com` (prod) plus any explicit
     dev / staging hosts. Don't list ephemeral preview deploys —
     Google requires explicit verification per added domain.
   - Scopes: `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`. Do NOT request anything beyond.
3. APIs & Services → Credentials → **Create Credentials → OAuth client ID**.
   - Application type: Web application.
   - Authorized redirect URIs (one entry per env):
     - dev tunnel: `https://dev.feldescloud.com/api/auth/callback/google`
     - staging:    `https://staging.feldescloud.com/api/auth/callback/google`
     - production: `https://feldescloud.com/api/auth/callback/google`
   - Authorized JavaScript origins: same hosts without the path.
4. Save → copy the **Client ID** and **Client Secret**.

## 2. Environment variables

Set on each deploy target (dev `.env.local`, staging, prod secret store):

```
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

`src/lib/auth.ts` registers Google **only when both vars are present**.
A deploy without them runs without the provider — the SocialButtons
component reads the same vars and hides the button, so there's no
broken UI state.

## 3. Feature flag

In PostHog:

- `feat-auth-google` (default `false`): cohort-gated rollout. Target
  10% of authenticated traffic for 48h, watch `auth.social.success` /
  `auth.social.error` ratio, then ramp to 100%.
- `kill-auth-social` (default `true` per `kill-*` convention): emergency
  off switch. Set to `false` only when the rollout starts.

The button uses `isFeatureEnabledStrict` for `feat-auth-google`
(fail-closed) so a PostHog outage hides Google rather than exposing it
prematurely.

## 4. Cookie + tunnel sanity check

Behind Cloudflare Tunnel (dev) and the prod TLS terminator, Auth.js
must write `__Secure-authjs.session-token`. Verify after deploy:

```bash
curl -sI https://feldescloud.com/api/auth/callback/google?... \
  | grep -i set-cookie
```

`__Secure-` prefix must appear. If it doesn't, `AUTH_URL` is wrong —
see `docs/auth/audit.md` §1 and `src/lib/auth-env.ts`.

## 5. Rollback

If Google login starts failing in production:

1. PostHog → set `kill-auth-social = true`. Button vanishes within
   the next flag-eval round (≤30s for new logins).
2. If the SDK call from the IdP itself misbehaves, revoke the OAuth
   client secret in Cloud Console; the provider stops working
   server-side immediately.
3. Both kill switches are independent — using either is safe; using
   both is safer.
