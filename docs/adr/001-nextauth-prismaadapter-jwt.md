# ADR 001: Keep NextAuth + PrismaAdapter + JWT

- **Status:** Accepted
- **Date:** 2026-04-23
- **Issue:** #314

## Context

The current auth stack uses `PrismaAdapter(db)` with `session: { strategy: 'jwt' }`.
That looks like extra moving parts at first glance, so this decision records why we are keeping it for now instead of simplifying it opportunistically.

Relevant code:

- [`src/lib/auth.ts`](../../src/lib/auth.ts)
- [`src/lib/auth-config.ts`](../../src/lib/auth-config.ts)
- [`docs/auth-proxy-contract.md`](../../auth-proxy-contract.md)
- [`docs/admin-host.md`](../../admin-host.md)

## Decision

Keep the current setup:

- NextAuth with the Prisma adapter
- JWT sessions
- DB-backed role refresh in the session callback

## Why we are keeping it

1. **Credential login already depends on the current shape.**
   The project uses Prisma-backed credential verification through the auth stack. Removing the adapter now would not remove much complexity, but it would create migration risk for a working login path.

2. **JWT fits the current request model.**
   The app relies on stateless session reads in server components, route handlers, and the edge proxy. JWT keeps the hot path simple and avoids introducing server-session storage that would complicate middleware and role checks.

3. **Role propagation is intentionally refreshed from the DB.**
   The auth callback already refreshes the user role periodically so promotions like `CUSTOMER -> VENDOR` appear without a sign-out. That behavior is easier to preserve with JWT than with a server session store.

4. **The adapter is not dead weight.**
   It keeps the door open for future OAuth/account linking/email-verification flows without re-architecting auth later. Today we do not need to pay the cost of ripping it out just to reduce theoretical complexity.

5. **Existing security contracts already assume this shape.**
   Host-only cookie behavior and proxy protection are documented separately. The current auth stack is part of that larger contract, not an isolated implementation detail.

## Consequences

- We keep the current login, role propagation, and route authorization behavior.
- Auth tests remain part of the safety net.
- If we ever want to remove the adapter, that should happen in its own migration issue with explicit auth coverage, not as a drive-by simplification.

## Follow-up policy

Revisit this decision only if one of the following becomes true:

- we add a real session-store use case that JWT cannot support cleanly
- we remove credential login and no longer need Prisma-backed auth state
- auth complexity grows enough that a migration brings clear, tested value
