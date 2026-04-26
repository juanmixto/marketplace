# Auth audit (Phase 0 — pre social login)

Snapshot del estado de autenticación antes de añadir Google / Apple. Su propósito es **fijar la política de colisión de email** y **mapear la maquinaria existente** para que las fases 1-8 (#850-#857) no rediseñen lo que ya funciona.

Última verificación: 2026-04-26 contra `main` post #848.

---

## 1. Inventario de superficies

| Surface | Archivo | Qué hace | Edge-safe |
|---|---|---|---|
| Auth.js bootstrap | `src/lib/auth.ts` | `NextAuth({...})` con `PrismaAdapter`, JWT sessions, callback `jwt` que refresca rol cada 60s | No (importa Prisma) |
| Config compartida | `src/lib/auth-config.ts` | `pages`, `callbacks.authorized`, `callbacks.jwt` (initial), `callbacks.session`. Vacío en `providers` (los rellena `auth.ts`) | **Sí** — importable desde middleware |
| Credentials provider | `src/domains/auth/credentials.ts` | `authorizeCredentials()` — Zod, bcrypt, rate-limit por email, exige `emailVerified`, valida TOTP para admins | No |
| Edge middleware | `src/proxy.ts` | `getToken()`, gate por rol, fuerza `/admin/security/enroll` si admin sin 2FA, construye `/login?callbackUrl=...` | **Sí** |
| Cookie helper | `src/lib/auth-env.ts` → `isSecureAuthDeployment()` | Resuelve `__Secure-` cookie prefix desde `AUTH_URL` (no desde `request.url`, que detrás del tunnel es http://localhost) | **Sí** |
| Callback URL guard | `src/lib/portals.ts` → `describeCallbackRejection`, `sanitizeCallbackUrl`, `resolvePostLoginDestination` | Allow-list por prefijo + 8 razones de rechazo + role mismatch | **Sí** |
| Login page | `src/app/(auth)/login/page.tsx` | Si ya hay sesión, redirige a `resolvePostLoginDestination`. Loggea `auth.callback.rejected` con `reason` | No (server component) |
| Login form (client) | `src/components/auth/LoginForm.tsx` | Form de credentials | — |
| Register | `src/app/api/auth/register/route.ts`, `src/app/(auth)/register/page.tsx` | Crea User con `passwordHash`, dispara verificación email | No |
| Verify email | `src/app/api/auth/verify-email/route.ts` + `EmailVerificationToken` | Marca `User.emailVerified` | No |
| Forgot / reset | `src/app/api/auth/{forgot-password,reset-password}/route.ts` + `PasswordResetToken` | Token de reset 1-hora | No |
| Login pre-check | `src/app/api/auth/login-precheck/route.ts` | Detecta si el email exige TOTP (UX 2-pasos) | No |
| 2FA | `src/domains/auth/{two-factor,trusted-device,two-factor-crypto}.ts` + `UserTwoFactor` table | TOTP, trusted-device cookie 30d | No |
| Login redirect helper | `src/proxy.ts` → `createLoginRedirectUrl()` | `${pathname}${search}` → sanitiza → `?callbackUrl=` | **Sí** |

### Conclusión

**El allow-list de callback URLs ya está construido (#853 ~90% hecho).**
**El gate de admin-host + 2FA enroll ya está construido.**
**La normalización de email (`trim().toLowerCase()`) ya es contrato implícito** (`authorizeCredentials` y register la aplican).

Phase 1 y siguientes deben **enchufarse** a estas piezas, no reescribirlas.

---

## 2. Modelo de datos relevante

```
User                    Account                 Session             VerificationToken
─────                   ─────                   ─────               ─────────────────
id          (cuid)      id                      id                  identifier
email       UNIQUE      userId  →  User.id      sessionToken UNIQUE token UNIQUE
emailVerified           type    ('oauth')       userId  →  User.id  expires
passwordHash?           provider                expires             (UNIQUE [identifier, token])
firstName               providerAccountId
lastName                refresh_token?
image?                  access_token?
role                    expires_at?
isActive                token_type?
deletedAt?              scope?
consentAcceptedAt?      id_token?
stripeCustomerId?       session_state?
                        UNIQUE (provider, providerAccountId)
```

### Relaciones que se rompen si duplicamos `User`

`User` cuelga de: `Vendor`, `Order`, `Cart`, `CartItem`, `Address`, `Incident`, `Review`, `ReviewReport`, `Favorite`, `Subscription`, `PushSubscription`, `EmailVerificationToken`, `PasswordResetToken`, `UserTwoFactor`, `TelegramLink`, `TelegramLinkToken`, `NotificationPreference`, `NotificationDelivery`.

→ Un duplicado de `User` parte 18 relaciones. **No es aceptable** crear un `User` paralelo cuando el email ya existe.

### Modelo `Account`: vacío hoy, listo para OAuth

Está cableado por `PrismaAdapter` pero no contiene filas (cero credentials providers usan esta tabla — los credentials viven en `User.passwordHash`). El primer Google login será la primera fila. La unique `(provider, providerAccountId)` cubre la race de doble-click.

### Política de sesión

JWT (no DB sessions). Implicación: `Session` table no se usa. **Mantener JWT** — migrar a DB sessions es scope distinto.

---

## 3. Flujo de login actual (texto)

```
[/login]
  │
  ├─ ya hay sesión? ──► resolvePostLoginDestination(role, callbackUrl, { lastPortal })
  │                       │
  │                       ├─ callbackUrl válido + role match  → callbackUrl
  │                       ├─ callbackUrl válido + role mismatch → primary portal + log
  │                       ├─ lastPortal cookie + role permite → lastPortal
  │                       └─ fallback                         → primary portal por rol
  │
  └─ no hay sesión → <LoginForm callbackUrl={...}>
                        │
                        └─ submit → signIn('credentials', { email, password, totpCode? })
                                      │
                                      ├─ authorizeCredentials() → AuthenticatedUser | null
                                      │     • zod parse
                                      │     • rate limit (login-identity, 10 / 15 min)
                                      │     • DB lookup user por email normalizado
                                      │     • bcrypt.compare passwordHash
                                      │     • exige isActive && emailVerified
                                      │     • si admin con 2FA → exige totpCode (o trusted-device cookie)
                                      │
                                      ├─ jwt callback (auth-config) → token.id, token.role, token.has2fa
                                      ├─ jwt callback (auth.ts)     → re-fresh role cada 60s
                                      └─ session callback           → session.user.{id,role,has2fa}

[middleware src/proxy.ts] cada request a path protegido:
  → getToken() con cookie correcta (isSecureAuthDeployment)
  → si no hay token → redirect /login?callbackUrl=<safe>
  → /admin & !isAdmin → redirect getPrimaryPortalHref(role)
  → /admin & isAdmin & !has2fa & !exemptPath → /admin/security/enroll
  → /vendor & !isVendor → primary portal
```

---

## 4. Matriz de decisiones de colisión de email

Política firmada para Phase 1 (#850). **Default seguro: nunca crear un `User` paralelo, nunca linkear sin verificar control.**

| Escenario | Existe en DB | Acción al recibir social signIn | Por qué |
|---|---|---|---|
| **A** | Email no existe | Crear `User` + `Account` (Auth.js default). `emailVerified = now()` (provider entrega `email_verified=true`). | No hay colisión. |
| **B** | Existe `User` con `Account` mismo provider+providerAccountId | Login normal, reutilizar `Account`. | Es el segundo+ login del mismo usuario. |
| **C** | Existe `User` con `Account` MISMO provider pero `providerAccountId` distinto | **Denegar** signIn. Esto es: el provider devuelve un sub diferente (cuenta nueva del mismo IdP con el mismo email). Mensaje "Inicia sesión con la cuenta original o contacta soporte". | Caso patológico (Apple permite renombrar el sub via privacy controls). Manejar manualmente, no automatizar. |
| **D** | Existe `User` con credentials (`passwordHash` set), sin `Account` | **Denegar signIn social, redirigir a `/login/link?token=<HMAC>`** donde el usuario confirma su password actual antes de añadir el `Account`. | Vector clásico de hijack: alguien crea cuenta Google con email de víctima + intenta linkear. Password gate corta el ataque. |
| **E** | Existe `User` solo-social (otro provider distinto, sin `passwordHash`) | **Denegar signIn social, enviar email de confirmación** al inbox real. Click en el email = autorización para linkear. | Sin password no podemos pedir password. El email del inbox real es la autoridad. **Recorte MVP**: este caso solo aparece cuando un mismo usuario trata de añadir un 3er provider. Implementación se aplaza a Phase 2 hardening (no hay usuarios solo-social hasta que Google esté en prod). |
| **F** | Existe `User` con `emailVerified = null` (registro abandonado a medias) | Tratar como caso D si hay password, como caso A si no (overrideable: si el provider dice `email_verified=true`, se puede setear `User.emailVerified = now()` y saltar el detour). | Limpia un edge case real: usuarios que se registraron por credentials pero nunca verificaron — no podemos exigirles password porque no la usaron. |

### Notas de la política

- **`allowDangerousEmailAccountLinking` debe ser `false`** en cada provider (default Auth.js v5). La decisión de link es nuestra, no de la librería.
- **`signIn` callback** es el único hook donde se ejecuta esta matriz. `linkAccount` event es post-decisión, sirve solo para audit log.
- **`emailVerified` se acepta como `true` desde Google y Apple** sin verificación adicional. Google nunca entrega `email_verified=false` para emails @gmail; Apple solo entrega emails verificados o relays propios.
- **HMAC link token** (Phase 1): payload `{email, provider, providerAccountId, callbackUrl, exp}`, exp = 5 min, firmado con `AUTH_SECRET`. Edge-safe (Web Crypto). El token NO contiene access_token / id_token — esos se descartan; el link se completa re-disparando `signIn(provider)` después del password-gate, con cookie short-lived `__Host-auth-link-confirmed` (60s).

---

## 5. Normalización de email

Hoy (verificado):

- `authorizeCredentials`: `email.trim().toLowerCase()` antes de `db.user.findUnique({ where: { email }})`.
- Register endpoint (a verificar en su PR): asumido mismo contrato.
- `User.email` columna: `@unique`. **No es citext**, no es case-insensitive en DB. Si `register` no normaliza, `Juan@x.com` y `juan@x.com` son dos `User` distintos.

### Acción para Phase 1

- El callback `signIn` debe normalizar `profile.email` con el mismo helper que `authorizeCredentials`. Extraer a `src/lib/auth-email.ts`:
  ```ts
  export const normalizeAuthEmail = (e: string) => e.trim().toLowerCase()
  ```
- Auditoría a 1-shot para detectar duplicados case-different en `User` antes del rollout social (script `scripts/audit-user-email-collisions.ts`). Si aparece alguno, resolver manualmente — no debería haber.

---

## 6. Instrumentación PostHog ya presente / faltante

### Existente
- `auth.callback.rejected` (login page, structured logger) — `reason` ∈ las 9 razones de `describeCallbackRejection` + `role_mismatch`.

### Falta (a añadir junto con cada Phase, no en este PR)
- `auth.social.start` — click en botón social, `provider`. (Phase 2)
- `auth.social.success` — callback OK, `provider`, `is_new_user`. (Phase 2)
- `auth.social.error` — callback con error, `provider`, `code`. (Phase 2)
- `auth.intent.captured` — `/login` cargada con `callbackUrl` válido. (Phase 4 — opcional, ya tenemos `auth.callback.rejected` para el lado negativo)
- `auth.intent.consumed` — redirect post-login a `callbackUrl`. (Phase 4)
- `auth.link.required` — `signIn` denegado por colisión D/E, redirect a `/login/link`. (Phase 5)
- `auth.link.completed` — link OK. (Phase 5)
- `auth.link.password_failed` — password gate falló. (Phase 5)

---

## 7. Riesgos detectados durante el audit

| Riesgo | Severidad | Mitigación |
|---|---|---|
| `User.email` no es citext → posibles duplicados case-different | Baja (no observado en prod) | Script de audit pre-rollout |
| `register` route no auditada en este PR | Media | Verificar normalización antes de Phase 1 merge — issue separado si difiere de `authorizeCredentials` |
| Apple sub puede cambiar (privacy reset) — caso C | Baja | Mensaje de error específico, no auto-create |
| `signIn` callback ejecuta en cada login (no solo el primero) → coste de DB lookup | Bajísima | Lookup es por `provider+providerAccountId` (índice unique) |
| Cookie `__Host-auth-link-confirmed` debe sobrevivir al detour por el IdP | Media | sameSite=lax + httpOnly + path=/ + 60s. Verificar en E2E de Phase 5 |
| 2FA admin: tras social login, el `has2fa` claim del JWT debe seguir funcionando | Media | El callback `jwt` initial (auth-config.ts:57) lee `(user as ...).has2fa`. El adapter de OAuth no lo entrega — debe leerse desde DB en `jwt({ user, account })` cuando `account.type === 'oauth'`. **Acción en Phase 1**: extender el callback para hacer ese lookup en el primer login social |
| `consentAcceptedAt` puede quedar null en social signups | Media | Phase 6 onboarding lo cubre. MVP: checkbox embebido + setear en el primer login |

---

## 8. Decisiones firmadas

1. **Política de colisión: matriz §4 vigente para todas las fases**.
2. **`allowDangerousEmailAccountLinking = false` en todos los providers**.
3. **Mantener JWT sessions** (no migrar a DB).
4. **Reutilizar `describeCallbackRejection` / `sanitizeCallbackUrl` / `resolvePostLoginDestination`** — no escribir helpers paralelos.
5. **Edge-safety del link token**: Web Crypto, no `node:crypto`.
6. **`has2fa` para admins sociales**: lookup en DB en el primer signIn OAuth y stamp en JWT (extensión a Phase 1 — no hace falta migración).
7. **Recorte MVP**: caso E (3er provider para usuario solo-social) se aplaza a hardening — no hay usuarios solo-social hasta GA de Google.
8. **`emailIsRelay` flag**: se introduce en Phase 3 (Apple), no en MVP.

---

## 9. Cierre del issue #849

Cuando este doc esté en `main`, #849 se cierra. El siguiente bloqueo es #850 (OAuth base + signIn callback que implementa §4).

---

## 10. Lecciones aprendidas durante la ejecución (post-mortem)

Añadidas tras Phase 1-2 hardening completado para que futuros agentes no tropiecen con las mismas piedras.

### `process.env.AUTH_URL` no es de fiar dentro de request handlers

`src/lib/auth-host.ts` → `applyNormalizedAuthHostEnv()` **borra** `process.env.AUTH_URL` cuando el valor apunta a una URL dev dinámica (LAN-access support para móvil/tablet testing). Esto rompió el fix inicial del callbackUrl de case D (#876), que dependía de `new URL(process.env.AUTH_URL).host` para validar same-origin del cookie value. En test/dev, `AUTH_URL` es `undefined` → el host check siempre falla.

**Reglas**:
- No usar `process.env.AUTH_URL` para validación dentro del request lifecycle. Para detección de Secure cookies usar `isSecureAuthDeployment` (que tolera el unset) o leer del request headers.
- Para extraer path+search de URLs absolutas guardadas como cookies, fíate del `redirect` callback que las escribió: la cookie ya pasó por nuestro allow-list al guardarse. Re-sanitiza el path como defense-in-depth, no fuerces equality checks de host.

### `console.info` no se ve en CI webserver capture

Playwright captura **stderr** del `webServer`, no stdout. Nuestro `logger.info()` usa `console.info` → stdout → invisible en CI. `logger.warn()` y `logger.error()` van a stderr → sí visibles. Para debug de server actions en CI, usar `console.error('[scope-debug]', ...)` directamente — bypasses el logger filter y siempre se ve.

Documentado tras descubrirlo durante #879 (debug PR). Los logs de `auth.social.allow / deny / link.required` (todos info) no se ven en CI webserver capture, lo que ralentizó el debug de #873 ~3 horas.

### Server-side `signIn(<oauth>)` desde un server action no completa el flow OAuth

Auth.js v5 `signIn()` server-side simula la POST a `/api/auth/signin/<provider>` internamente, captura la respuesta (Location + cookies), las propaga al cookieJar de la action y emite redirect a la authorize URL. Pero el browser, al seguir la redirect, no completa el round-trip cleanly cuando el provider es OAuth con state/PKCE checks: el state cookie del primer signin choca con la del segundo. **Para OAuth providers, no llamar `signIn(<oauth>)` desde una action server-side**. Para credentials sí funciona (single round-trip a /api/auth/callback/credentials).

Concretamente en case D (#854-lite): tras password gate, NO usar `signIn(<provider>)`; usar `signIn('credentials', { email, password, redirectTo })` con el password recién verificado. El usuario obtiene sesión en una sola hop.

### Next.js trata folders prefijados con `_` como private (no routables)

Documentado en `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`. Los paths `__test__/` y `_anything/` son ignorados por el router. Para rutas test-only que necesiten URL real, usar `/dev/<route>` (gateado por `isDevRoute()` + el proxy 404 en producción) o `/api/dev-<thing>` (self-gate via env flag + `NODE_ENV !== production`).

### Auth.js v5 `pages.signIn` cambia el comportamiento de GET `/api/auth/signin/<provider>`

Cuando `pages.signIn` está configurado (ej. `/login`), GET sobre `/api/auth/signin/<provider>` redirige a `/login` en vez de iniciar el flow OAuth. Por lo tanto, **redirigir el browser a `/api/auth/signin/<provider>` no funciona** — solo POST inicia el flow. Para OAuth desde el cliente, usar `signIn(<provider>)` de `next-auth/react` que hace el POST con CSRF.

### Auto-merge cascade en stacked PRs colapsa el contenido

Cuando varios PRs stacked tienen `--auto --squash` habilitado, GitHub puede mergearlos en cascada hacia las bases intermedias en orden distinto al de creación. El resultado: los HEAD branches absorben el contenido de los PRs siguientes antes de mergear a main, y los PRs intermedios marcan como MERGED contra una base que ya no existe en main.

Síntoma concreto durante el MVP rollout: PRs #861-#863 quedaron MERGED contra `feat/oauth-base-850` (head de #860). Después #860 mergeó a main con todo el contenido consolidado (22 ficheros, no 8). En la práctica funciona — main acaba con todo — pero el grafo PR queda confuso. Si te toca diagnosticar, mira el final state de main, no el grafo de PRs.

---

## 11. Cierre Phase 2

Estado al cierre (2026-04-26):
- MVP en main: #850/#851/#854/#856/#855 cerrados.
- E2E coverage: cases A/B/D + defense smoke = 4/4 verde en CI shard 3.
- Apple (#852) y Phase 8 UX/perf (#857) deferred — sin trigger explícito todavía.
- `feat-auth-google` cleanup (#864) programado D+30 (2026-05-26).
