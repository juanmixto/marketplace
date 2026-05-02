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

## 6. Observability — events emitted

The rollout dashboard reads three canonical PostHog/logger events:

| Event | Where it fires | Source |
|---|---|---|
| `auth.social.start` | Client click on the Google button | `SocialButtonsClient.tsx` (PostHog client) |
| `auth.social.success` | Server-side: matrix decision = allow + session emitted | `auth.ts` (logger.info) |
| `auth.social.error` | Server-side matrix denied; OR client lands on `/login?error=…` | `auth.ts` (logger.warn) + `AuthErrorTracker.tsx` (PostHog client) |

Plus context events that aid investigation but aren't dashboard-critical:

| Event | Meaning |
|---|---|
| `auth.social.allow` / `.deny` | Granular matrix decision (allow includes `isNewUser`; deny includes `reason`: `kill_switch` / `provider_account_mismatch`) |
| `auth.social.no_email` | Provider returned no email — Apple privacy edge case (post Phase 3) |
| `auth.user.created_via_oauth` | Adapter created a fresh User row from a social profile |
| `auth.link.required` | Matrix case D — credentials user redirected to `/login/link` |
| `auth.link.completed` | Account row written after password gate verification |
| `auth.link.password_failed` | Wrong password at the link gate |
| `auth.link.token_invalid` / `.token_expired` | HMAC token rejected at the link page |
| `auth.account.linked` | Auth.js `linkAccount` event (matrix case A first signin) |
| `auth.account_linked_email.sent` / `.failed` | Security notification email status |
| `auth.callback.rejected` | `?callbackUrl=` value failed sanitize allow-list |
| `auth.onboarding.completed` | New OAuth user accepted consent and continued |
| `auth.error.unknown_code` | A `?error=` code we haven't mapped — investigate |

## 7. Alerts — concrete thresholds

Run these as PostHog dashboard alerts during the 10% canary and the 100% ramp. All are **per 1-hour rolling window** unless stated.

| Condition | Severity | Action |
|---|---|---|
| `auth.social.success / auth.social.start` < 0.85 over 1h with ≥30 starts | **page oncall** | Likely provider config or callback URL drift. Check PostHog `auth.social.error.code` breakdown. If config issue → fix; if Auth.js error spike → consider rollback. |
| `auth.social.error` count > 50 in 1h | **page oncall** | Could be provider outage, expired client secret, redirect URI mismatch. Check Sentry scope `auth.*`. |
| `auth.link.password_failed` from a single IP > 10 in 1h | warn (Slack) | Brute-force attempt at the link gate. Rate-limit already kicks in at 5/h, but watch for distributed. |
| `auth.error.unknown_code` count > 0 / day | warn (backlog) | New error code from upstream — needs mapping in `auth-error-codes.ts`. Not a fire, but file an issue. |
| `auth.account_linked_email.failed` rate > 5% | warn (backlog) | Resend health issue or template regression. Email is fire-and-forget so users aren't blocked, but security notifications missing is a soft issue. |
| Sentry events with scope starting `auth.` | **page oncall** | Any `logger.error()` in the auth subsystem — by definition something we can't recover from automatically. |
| 5xx rate on `/api/auth/*` > 1% in 5min | **page oncall** | Auth.js or our adapter blowing up. Possible kill-switch trigger. |
| `__Secure-authjs.session-token` not set on `/api/auth/callback/google` | smoke check | Run after every deploy. Cookie absence means tunnel/HTTPS misconfiguration. See §4. |

### Rollback decision matrix

- **Page oncall + cause is config/secret**: rotate secret, verify URI, no rollback needed.
- **Page oncall + cause is code regression**: PostHog `kill-auth-social=true` first, then revert PR.
- **Multiple page oncall events in 24h**: pause the canary, revert to `feat-auth-google=false` until investigated.

## 8. Product insights — first-iteration hypotheses

These are theoretical until 7+ days of canary data lands. File them as *hypotheses to verify*, not commitments.

1. **`/login/link` will be the surprise drop-off.** Users who hit Case D (credentials user → social signin) face an unexpected password prompt. Real-world abandon rate likely 30-50% on first encounter. Mitigation: clearer copy on the link page explaining *why* the password is asked. If telemetry confirms >40% drop-off after 100 attempts, prioritize.

2. **Onboarding consent rate near 100%, but completion time matters.** GDPR consent is a single checkbox so refusal is rare. But the page adds ~3-5 seconds vs no-onboarding. Watch `(auth.social.success → auth.onboarding.completed)` median time. If >10s, copy is probably too long.

3. **Mobile users may dismiss the OAuth popup.** Some Android browsers spawn an in-app webview that blocks Google's auth domain. Watch `auth.social.error.code = OAuthSignin` distribution by user-agent. If >5% mobile, document fallback.

4. **Email-derived `firstName` fallback will surface.** When Google delivers no `given_name`, our adapter falls back to the email local-part (e.g. `juan.ortega` → `Juan`). Watch the `auth.user.created_via_oauth.hasName=false` count. If >10% of new OAuth users land here, ship onboarding-with-name input as a follow-up.

5. **Returning users may be confused by the Google button if they registered with credentials.** Without prior context, clicking Google opens the link gate. Hypothesis: a small "ya tienes cuenta — usa tu contraseña habitual" hint reduces confusion. Validate by comparing case D password-success rate to credentials-only login success rate.

## 9. Phase 3 — Apple trigger conditions

Apple OAuth (#852) stays deferred until **at least one** of these fires, measured during the 30-day post-100% window:

| Trigger | Measurement | Source |
|---|---|---|
| Safari iOS share of `/login` page-views > 25% | PostHog `$browser=Mobile Safari` filter on the route | PostHog dashboards |
| App Store / TWA distribution decision | Product/legal greenlight | Out-of-band |
| `auth.social.error` from Safari iOS specifically > 10% above baseline | PostHog filter `$browser=Mobile Safari` over `auth.social.error` | PostHog |
| iOS user complaint volume in support inbox | Manual (Slack #soporte weekly review) | Support |

If none fire in the 30-day window, Apple stays deferred and the audit's case E (3rd-provider link for solo-social user) also stays out — no users will be solo-social.

## 9.1 Manual test plan

Casos concretos a ejecutar en staging y durante canary: ver [`docs/auth/rollout-test-plan.md`](./rollout-test-plan.md). Cubre §A pre-rollout staging (10 casos), §B canary 2h, §C 24h/48h, §D incidente, §E post-100%.

## 10. Pre-rollout final checklist

Run this once before flipping `kill-auth-social=false` in production:

- [ ] OAuth client created in Google Cloud Console with all 3 redirect URIs (dev tunnel / staging / prod).
- [ ] `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` set in staging secret store.
- [ ] `AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` set in prod secret store.
- [ ] PostHog flags created: `feat-auth-google` (default `false`), `kill-auth-social` (default `true`).
- [ ] PostHog alerts from §7 wired (at minimum the two `page oncall` ones).
- [ ] Sentry alerting on scope `auth.*` confirmed.
- [ ] Smoke run in staging: anon → /checkout → click Google → /cuenta loads with cart intact.
- [ ] Cookie verify (§4) on staging callback.
- [ ] Canary cohort identified in PostHog: 10% of authenticated traffic, OR a fixed list of staff emails for an internal canary first.

If all green: `kill-auth-social=false` + `feat-auth-google=true` for the canary cohort. Watch §7 alerts for 48h. If clean: ramp to 100%.

If 1+ unchecked: do NOT flip. Fix the gap.

## 11. Troubleshooting catálogo

Síntomas → causa → fix:

| Síntoma | Causa probable | Fix |
|---|---|---|
| Botón Google no aparece en `/login` | `feat-auth-google=false` o `kill-auth-social=true` | PostHog override del flag para el cohort |
| Botón visible pero click → 500 | `AUTH_GOOGLE_ID` / `_SECRET` no seteados en runtime | Re-deploy con secret store actualizado |
| Click → `OAuthCallback` error | redirect URI no incluida en Cloud Console | Añadir URI exacta en Cloud Console (incluye trailing path `/api/auth/callback/google`) |
| Click → llega a Google → vuelve y muestra `Configuration` | client_id/secret no coinciden entre env y Cloud Console | Verificar copia exacta del secret |
| Login OK pero `/cuenta` redirige a `/login` | `__Secure-authjs.session-token` no se está escribiendo (problema de cookie prefix) | Ver §4; revisar `AUTH_URL` empieza por `https://` |
| Caso D loop: usuario → /login/link → submit → vuelve a `/login` | Password incorrecta (rate-limit silencioso) o action timeout | Ver `auth.link.password_failed` count; si rate-limited muestra UI; si timeout investigar Resend |
| `?error=link_expired` lo ven muchos usuarios | Token TTL 5min se queda corto | No tocar; investigar si tienen el tab abierto >5min antes de submit. Considerar bumpa a 10min si pattern claro |
| Sentry spike de `auth.social.missing_secret` | `AUTH_SECRET` no seteado en runtime (no Google secret) | Re-deploy con AUTH_SECRET en secret store |
