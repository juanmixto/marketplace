---
summary: SOP for the four pre-launch audit-trail alerts (export>1000, search-spam, role_change, impersonation-write). What fires, where to look, what to do.
audience: oncall + SUPERADMIN
read_when: an audit-trail alert fires; setting up the PostHog/Sentry dashboards; investigating "did an admin do X?"
---

# Audit-trail alerts — runbook (#1357, epic #1346)

`AuditLog` is append-only and populated by every `mutateWithAudit` / `createAuditLog` call site. This runbook describes the **minimum four alerts** the pre-launch audit work assumes are wired, what each one means, and the SOP when one fires.

The viewer at [`/admin/audit`](../../src/app/(admin)/admin/audit/page.tsx) is the read surface (SUPERADMIN-only). Filters are URL-driven — share the link with the on-call investigator.

---

## Alert sources (logger scopes)

The alerting platform (PostHog / Sentry / Logtail) consumes these structured log events. Source code emits them via `logger.warn(scope, payload)` so they show up in the same sink as everything else.

| # | Scope | Emitted from | Fires when |
|---|-------|--------------|------------|
| 1 | `analytics.export.large_csv` | `src/domains/analytics/actions.ts` (#1348) | An admin's `exportOrdersCsv` returned ≥ 1000 rows |
| 2 | `admin.search.pii_burst` | `src/domains/admin/search-pii.ts` (#1353) | Same actor crossed 20 PII-shaped admin searches in 10 min |
| 3 | `auth.role_change` (NOT WIRED YET) | _no admin path mutates `User.role` to SUPERADMIN today_ | When the role-change feature lands, the writer must `logger.warn('auth.role_change', { actorId, targetUserId, before, after })` |
| 4 | `impersonation.start` (NOT WIRED YET) | gated behind `IMPERSONATION_ENABLED` (see #1155 / #351) | When impersonation lands, fire on `readOnly === false` |

The `AuditLog` row itself is the durable record. The logger emit is the **fast signal**; the audit row is the **slow forensic detail**.

---

## SOP — when an alert fires

### 1. `analytics.export.large_csv`

**What it means:** An admin downloaded ≥ 1000 customer-attributed orders in one CSV. Legitimate use: finance reconciliation. Malicious use: bulk PII exfiltration.

**Steps:**
1. Open `/admin/audit?action=DATA_EXPORT` filtered to the alerting time window.
2. Locate the row matching the alert (`actorId`, `createdAt`).
3. Verify `after.rowCount` matches the alert payload.
4. Cross-check `after.filters` against the actor's stated work for the day (Slack `#oncall`, Linear ticket).
5. If unexplained → suspend the actor: `gh api ... PATCH user role to CUSTOMER`, bump `tokenVersion`, page legal.
6. **Always** ask: did the actor download a date range that fully overlaps a previous one (re-pull within 1h)? That's a smell.

### 2. `admin.search.pii_burst`

**What it means:** Same admin pattern-matched 20+ emails / phones / postal codes in 10 minutes. Real moderation work doesn't look like this.

**Steps:**
1. Open `/admin/audit?action=DATA_SEARCH&actorId=<actorId>` filtered to the last hour.
2. Each row carries `after.qHash` (sha256), `after.kind`, `after.matchedCount`. The literal queries are NOT in the audit (by design — see #1353).
3. Pair with the actor on Slack: ask what they were investigating. Legitimate: "I'm chasing an incident from `+34 600 123 456`" — verifiable by the matching incident ticket.
4. If no plausible justification: suspend (same as #1) and review the last 24h of their `DATA_SEARCH` rows for a pattern.

### 3. `auth.role_change`

**What it means:** A user's role was elevated. Pre-launch the only path is `approveVendor` (CUSTOMER → VENDOR) which is benign. Any change to or from SUPERADMIN must be a deliberate, peer-reviewed operation.

**Steps:**
1. Open `/admin/audit?action=USER_ROLE_CHANGED` (or whatever scope the writer uses — keep this runbook in sync).
2. Verify the change was authorised in `#superadmin` or whatever channel the org uses for elevation reviews.
3. If unauthorised: REVERT the role change (`/admin/usuarios/<id>` should expose this), bump `tokenVersion`, force re-auth, page legal + the perpetrator's manager.

### 4. `impersonation.start` (read-write)

**What it means:** A SUPERADMIN entered impersonation mode and the session is read-write (can mutate state on behalf of a user). Read-only impersonation is fine; read-write is the same risk surface as a stolen session.

Wired only when the impersonation epic (#1155 / #351) lands. Until then this section is a placeholder.

---

## What's NOT in this runbook

- Setting up the PostHog dashboards / Sentry alerts is an ops task — the rules above describe the contract, not the platform-specific config. Talk to whoever owns the alerting platform when adding a new scope.
- Schema additions (`userAgent`, `requestId`, `outcome`, `reason`) are a follow-up to #1357. The current schema is enough for the four alerts above.
- The `before` / `after` payloads are deep-scrubbed at render time via the unified scrubber (#1354). If you see PII inside a row, that's a writer bug — file an issue and patch the writer.

---

## Adding a new alert

1. Pick a stable scope name (`<domain>.<event>.<modifier>`). Names rot if they change — oncall queries break.
2. Emit `logger.warn(scope, payload)` from the writer. Keep payload structured (no PII). Numbers + ids only.
3. Persist the durable row via `createAuditLog` / `mutateWithAudit` so the `/admin/audit` viewer has the slow-path detail.
4. Add a row to the table above and an SOP block. A new alert without an SOP is a paging device that nobody knows how to action.
