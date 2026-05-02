# Rollout test plan — Social Login (Google)

Manual test cases to run during the canary rollout of #848. Pair with `docs/auth/google-setup.md` (config, alerts, troubleshooting).

**Tiempo total estimado**: ~45 min en staging, ~15 min en producción canary, ~5 min en cada ramp step.

**Cuándo ejecutar cada bloque**:
- §A → antes de flipar `kill-auth-social=false` en cualquier env.
- §B → tras flipar a 10% en producción, durante las primeras 2h.
- §C → revisión a 24h y a 48h del canary.
- §D → solo si una alerta dispara (no preventivo).
- §E → tras flipar a 100%.

Cada caso indica: **Setup → Steps → Expected → Verify**. Marca con `[x]` lo ejecutado.

---

## A. Pre-rollout en staging (antes del flip)

Objetivo: validar que el código en main hace lo que el playbook dice **antes** de exponer ningún usuario real.

### A1 — Botón oculto sin env vars

- [ ] **Setup**: staging deploy con `AUTH_GOOGLE_ID/SECRET` **no** seteados.
- [ ] **Steps**: navegar a `https://staging.feldescloud.com/login` en incógnito.
- [ ] **Expected**: solo aparece el form de credentials. NO hay botón "Continuar con Google" ni divider "o continúa con email".
- [ ] **Verify**: DevTools → Network → `/login` HTML response no contiene "Continuar con Google".

### A2 — Botón oculto con env vars + flag off

- [ ] **Setup**: env vars seteadas en staging. Flag `feat-auth-google=false` en PostHog.
- [ ] **Steps**: incógnito → `/login`.
- [ ] **Expected**: botón sigue oculto (flag domina).
- [ ] **Verify**: en DevTools no hay request a `/api/auth/signin/google`.

### A3 — Happy path: case A (nuevo email)

- [ ] **Setup**: flag `feat-auth-google=true` para tu email staff. Cookie/localStorage limpios.
- [ ] **Steps**:
  1. Usar una cuenta Google que NO exista en staging DB.
  2. Navegar `/login?callbackUrl=/cuenta`.
  3. Click en "Continuar con Google".
  4. Autorizar en Google consent screen.
  5. Aceptar consent en `/onboarding`.
- [ ] **Expected**: aterriza en `/cuenta` con sesión válida.
- [ ] **Verify**:
  - DevTools → Application → Cookies: `__Secure-authjs.session-token` presente.
  - DB: `SELECT id, email, "firstName", "lastName", "consentAcceptedAt" FROM "User" WHERE email='<google-email>'` → User existe, consent set.
  - DB: `SELECT provider, "providerAccountId" FROM "Account" WHERE "userId"='<id>'` → 1 row con `provider='google'`.
  - PostHog: `auth.social.start` y `auth.social.success` con mismo distinct_id.

### A4 — Case B: returning user

- [ ] **Setup**: usuario de A3 ya existe.
- [ ] **Steps**: logout. Repetir A3 con la misma cuenta Google.
- [ ] **Expected**: aterriza directo en `/cuenta` (sin `/onboarding`).
- [ ] **Verify**:
  - DB Account: sigue habiendo **1** row para ese email + provider `google` (no se duplica).
  - Logs: `auth.social.allow` con `isNewUser: false`.

### A5 — Case D: credentials collision

- [ ] **Setup**: existe un User con credentials (email + passwordHash) — usar `cliente@test.com / cliente1234` o equivalente staging.
- [ ] **Steps**:
  1. Logout. Limpiar cookies.
  2. `/login?callbackUrl=/cuenta`.
  3. Click Google con una cuenta cuyo email = el del User de credentials.
  4. Autorizar Google.
- [ ] **Expected**: redirige a `/login/link?token=...`. Form pide password. Submit con la password real.
- [ ] **Verify**:
  - Tras submit, aterriza en `/cuenta` (o callback original).
  - DB: User sigue siendo el mismo (mismo `id`), ahora con `Account` row para `google`.
  - Mailbox del usuario: email "Has vinculado Google a tu cuenta" llega (Resend).
  - Logs: `auth.link.required` → `auth.link.completed` → `auth.account_linked_email.sent`.

### A6 — Case D negative: password incorrecta

- [ ] **Setup**: continuación de A5 con un nuevo User de credentials limpio.
- [ ] **Steps**: en `/login/link` submit con password equivocada.
- [ ] **Expected**: error visible "Contraseña incorrecta". User puede reintentar.
- [ ] **Verify**:
  - DB: sigue **sin** Account row para google (no se escribió).
  - Logs: `auth.link.password_failed`.
  - Repetir 5 veces consecutivas → 6º intento muestra "Demasiados intentos" (rate limit).

### A7 — Open redirect blindado

- [ ] **Steps**: navegar a `https://staging.feldescloud.com/login?callbackUrl=https%3A%2F%2Fevil.com%2Fpwn`.
- [ ] **Expected**: form aparece normal. Tras login, NUNCA aterriza en evil.com.
- [ ] **Verify**:
  - Tras login → /cuenta o portal por defecto, no evil.com.
  - Logs: `auth.callback.rejected reason=not_in_allowlist`.

### A8 — Admin OAuth → 2FA enroll detour

- [ ] **Setup**: admin user en staging con `passwordHash` y SIN 2FA enrolada. Flag activado para ese admin.
- [ ] **Steps**:
  1. Logout.
  2. `/login?callbackUrl=/admin/dashboard`.
  3. Click Google con cuenta cuyo email = admin email.
  4. `/login/link` → submit password.
- [ ] **Expected**: aterriza en `/admin/security/enroll`, NO en `/admin/dashboard`.
- [ ] **Verify**: la sesión existe pero el proxy detoura. Tras enrolar 2FA → libre acceso al panel.

### A9 — Cookie verify behind tunnel

- [ ] **Steps**:
  ```bash
  curl -sI https://staging.feldescloud.com/api/auth/csrf | grep -i set-cookie
  ```
- [ ] **Expected**: `__Secure-authjs.csrf-token` en la respuesta.
- [ ] **Verify**: si NO aparece `__Secure-` prefix → AUTH_URL mal configurado, abortar rollout.

### A10 — Kill switch funciona

- [ ] **Setup**: A3 happy path completo previo.
- [ ] **Steps**: PostHog → `kill-auth-social=true`. Esperar ≤30s. Recargar `/login`.
- [ ] **Expected**: botón Google desaparece. Flag override es instantáneo.
- [ ] **Verify**: si por race condition alguien clickea el botón viejo → server signIn callback rechaza con `reason: kill_switch`.
- [ ] Volver a `kill-auth-social=false` cuando termine este bloque.

---

## B. Canary 10% en producción (primeras 2h)

Objetivo: detectar problemas reales antes de exponer al 100%. Ejecutar **tras** §A todo en verde + las 9 casillas de §10 de `google-setup.md`.

### B1 — Smoke desde un device real

- [ ] **Setup**: ser parte del cohort 10% (verificable: aparece el botón).
- [ ] **Steps**: A3 happy path en producción. Email Google nueva.
- [ ] **Expected**: idéntico a A3.
- [ ] **Verify**: `__Secure-authjs.session-token` en cookies (en prod debe ser `__Secure-`, no plain).

### B2 — Smoke desde mobile (real device)

- [ ] **Setup**: iPhone Safari y Android Chrome.
- [ ] **Steps**: B1 en cada uno.
- [ ] **Expected**: igual que desktop. Nada de webviews bloqueando.
- [ ] **Verify**: si Android in-app webview (Instagram/Facebook/...) bloquea → documentar caso, no bloqueante.

### B3 — Telemetría primer signal

A las 30 min de canary live:

- [ ] **Verify en PostHog**:
  - `auth.social.start` count > 0.
  - `auth.social.success` count > 0.
  - Ratio `success / start` ≥ 0.85.
  - `auth.social.error` aislado (cualquier valor < 5 en 30 min).

### B4 — Sentry baseline

- [ ] **Verify en Sentry**: filter por scope `auth.*`. Cero errores nuevos en las primeras 2h.

### B5 — DB no se está duplicando

- [ ] **Setup**: SQL acceso a prod read replica.
- [ ] **Verify**:
  ```sql
  SELECT email, COUNT(*) FROM "User" GROUP BY email HAVING COUNT(*) > 1;
  ```
  → cero rows.
  ```sql
  SELECT COUNT(*) FROM "Account" WHERE provider='google';
  ```
  → > 0 (significa que case A funciona en prod).

---

## C. Watch a 24h y 48h

Si B verde, dejar el canary correr. Revisar a 24h y 48h.

### C1 — Métricas dashboard

- [ ] **24h**: `success / start` ratio promedio ≥ 0.85.
- [ ] **24h**: `auth.social.error` count < 50/h en cualquier ventana.
- [ ] **48h**: ratios estables o mejorando.

### C2 — Distribución de errores

- [ ] PostHog filter `auth.social.error.code`. Top 3 códigos:
  - Si dominan `OAuthCallback` o `Configuration` → revisar Cloud Console URIs.
  - Si dominan `AccessDenied` (>50% de errores) → usuarios cancelan, no es bug — UX hipótesis #5 confirmada.

### C3 — `/login/link` traffic

- [ ] **Verify**: count `auth.link.required` durante 48h.
- [ ] Ratio `auth.link.completed / auth.link.required`.
  - Si <50% → hipótesis #1 confirmada (drop-off real). Backlog issue para mejorar copy.
  - Si >70% → buena salud.

### C4 — Onboarding

- [ ] **Verify**: median time `auth.social.success` → `auth.onboarding.completed`.
- [ ] Si median > 10s → copy demasiado largo, hipótesis #2 confirmada.

### C5 — Email security notification

- [ ] **Verify Resend dashboard**: open rate del email "Has vinculado Google".
- [ ] `auth.account_linked_email.failed` rate < 5%.

### C6 — Manual test de rollback

- [ ] **Setup**: fuera de horario crítico.
- [ ] **Steps**: PostHog → `kill-auth-social=true`. Esperar 1 min. Verificar que /login no muestra el botón.
- [ ] **Expected**: botón desaparece. Tráfico vuelve al form clásico sin downtime.
- [ ] Volver a `false` tras la verificación.

---

## D. Incident response (solo si dispara una alerta)

### D1 — Success ratio cae bajo 0.85

- **Inmediato**: revisar `auth.social.error.code` distribution en PostHog.
- **Si dominan errores Auth.js** (`OAuthCallback`, `Configuration`): probable secret rotation o redirect URI drift en Cloud Console. Verificar §11 troubleshooting.
- **Si no es claro**: PostHog `kill-auth-social=true` + investigar offline.

### D2 — `auth.social.error` spike > 50/h

- **Inmediato**: Sentry scope `auth.*` para ver stack traces.
- **Si Sentry vacío**: probable provider outage. PostHog → `kill-auth-social=true`. Reintentar en 30 min.
- **Si Sentry con stack trace**: identificar la regression del último deploy. Revert + rollback.

### D3 — Nuevos códigos de error desconocidos

- **PostHog**: `auth.error.unknown_code` count > 0.
- **Action**: identificar el código en logs. Añadir mapping en `src/lib/auth-error-codes.ts` (PR pequeño).
- **No urgente**: usuario ve el mensaje generic, no se rompe nada.

### D4 — Brute force en `/login/link`

- **Setup**: `auth.link.password_failed` desde una IP > 10/h.
- **Action**: el rate-limit ya bloquea a partir de 5/h. Si pasa el threshold, considerar:
  - Bloquear IP en Cloudflare WAF (manual).
  - Bajar el threshold rate-limit a 3/h en `actions.ts` (PR pequeño post-incidente).

### D5 — `__Secure-authjs.session-token` no se setea

- **Síntoma**: usuarios reportan login OK pero al recargar siguen como anónimos.
- **Causa**: AUTH_URL no es `https://...` o discrepancia entre AUTH_URL y NEXT_PUBLIC_APP_URL.
- **Action**: revisar §4 de `google-setup.md`. Fix env vars + re-deploy. NO requiere rollback del rollout.

---

## E. Post-100% (tras ramp completo)

### E1 — Estabilidad 7 días

- [ ] Métricas mantenidas: `success / start` ≥ 0.85, `error` < 50/h, Sentry limpio.
- [ ] Sin oncall pages auth-relacionadas.

### E2 — Insights validation (hypotheses → data)

Volver a §8 de `google-setup.md` y marcar cada hipótesis como:
- **Confirmada con datos** + métricas que la respaldan.
- **Refutada con datos** + métricas que la refutan.
- **Inconclusa** — needs más tiempo.

Si alguna hipótesis #1-#5 confirmada, abrir issue de mejora con scope concreto.

### E3 — Apple trigger check (Phase 3)

- [ ] PostHog: % Safari iOS sobre `/login`.
- [ ] PostHog: `auth.social.error` desde Safari iOS.
- [ ] Producto: ¿hay decisión de App Store / TWA?
- Si **ninguno** dispara → Apple sigue dormido. Re-evaluar en otros 30 días.

### E4 — Cleanup tickets

- [ ] D+30 (2026-05-26): ejecutar #864 — eliminar flag `feat-auth-google` del código + del PostHog. El kill-switch (`kill-auth-social`) se queda.
- [ ] Revisar si #857 (UX/perf full) sigue siendo relevante con datos reales o queda como N/A.

---

## Resumen de criterios "go / no-go"

| Fase | Go criteria | No-go → action |
|---|---|---|
| Staging → 10% canary | §A todos `[x]` + checklist §10 google-setup.md | Fix gap antes de flipar |
| 10% → 100% | §B y §C todo verde a 48h | Pausa, investigar, posible rollback |
| 100% → Apple decision | §E3 al menos 1 trigger fires en 30d | Apple sigue deferred |

## Quién ejecuta qué

- **§A**: ops + 1 dev como pair (pre-rollout).
- **§B**: ops + dev oncall (canary first 2h).
- **§C**: solo dev oncall (24h y 48h checkpoints).
- **§D**: oncall (incident only).
- **§E**: producto + dev (post-stable review).
