---
summary: Playbook for debugging a test that "looks flaky" — covers E2E (Playwright) and integration (node:test). Read the page snapshot or stack trace before patching the test; iterate at the right layer.
audience: agents,humans
read_when: any test (E2E smoke, integration, contract) starts failing intermittently or unexpectedly
---

# Test debug runbook

When a test fails on CI and your first instinct is "it's flaky, just
retry / parch it", **stop and read this first**. The first few minutes
spent on the right diagnostic save hours of patches that don't fix
anything.

This runbook covers two kinds of tests, with very different first
moves:

- **E2E** (`e2e/smoke/*.spec.ts`, Playwright): the page snapshot is the
  signal. Use the diagnose-failed-run script to dump it.
- **Integration** (`test/integration/*.test.ts`, node:test): the stack
  trace is the signal. Reproduce locally — way faster than reading
  truncated CI logs.

## TL;DR by test kind

### E2E (Playwright)

1. **`bash scripts/diagnose-failed-run.sh <pr-number>`** — downloads the
   Playwright artifact and dumps the page snapshot to stdout. Read it.
2. Compare snapshot vs expected UI. Snapshot wrong → product bug.
   Snapshot right but locator missed → test timing.
3. Don't patch the test on iteration 1. Patch only when step 2
   confirms a real timing race.
4. If iteration 3 has the same failure signature, you're at the wrong
   layer. Walk up the data flow.

### Integration (node:test)

1. **Reproduce locally**:
   ```bash
   DATABASE_URL=$(grep DATABASE_URL_TEST .env.test | cut -d= -f2- | tr -d '"') \
   NODE_ENV=test \
   npx tsx --test test/integration/<file>.test.ts 2>&1 | grep -A 30 "<failing test name>"
   ```
   Don't use `npm run test:integration <file>` — that runner ignores
   args and runs the whole suite.
2. Read the FULL stack trace. CI's `gh run view --log-failed` truncates;
   local does not.
3. If the failure points at a "stable" helper / wrapper, suspect the
   helper FIRST, not your new test. Old helpers carry latent bugs that
   surface only when a new path exercises them.
4. If iteration 3 has the same failure signature, you're at the wrong
   layer. Walk up the data flow.

## Why this runbook exists

Two incidents that motivated each path:

**E2E (cart-checkout, 2026-05-02):** the smoke had been red on `main`
for 6+ hours. The natural reaction — "test flake, parch it, move on" —
produced three test patches in a row, none of which fixed anything,
because the failure was a real product bug (`CartHydrationProvider`
clobbering local cart on full reload of `/checkout`). The page snapshot
showed `"Tu carrito está vacío"` on what should have been `/checkout`
— direct proof the test was correctly observing UI state. ~90 min
wasted before anyone read the snapshot.

**Integration (order-create guest tests, 2026-05-03):** four guest
checkout tests were failing with `headers() called outside a request
scope`. Reading CI logs gave only the one-line error. Reproducing
locally gave the full 4-frame stack: `headers → next-auth →
getActionSession → createOrder`, which immediately pointed at
`getActionSession()`, which pointed at the bug in `clearTestSession()`
(a 7-line fix in #1110). Total time from "see failure" to "have fix":
~10 minutes locally vs an estimated 25-30 reading CI logs.

The script (for E2E) and the local-repro recipe (for integration) are
the antidote to both patterns.

## E2E — Step-by-step

### Step 1 — Download the page snapshot

```bash
bash scripts/diagnose-failed-run.sh 1097          # by PR number
bash scripts/diagnose-failed-run.sh --run 25264258069  # by run id
```

Output: every failed job's `error-context.md` printed to stdout. Each
contains:

- **Test info**: spec name + line.
- **Error details**: locator + timeout + which assertion missed.
- **Page snapshot**: full DOM tree (yaml) at the moment of failure.
  This is the signal.

### Step 2 — Read the snapshot. Diagnose.

Three cases:

#### Case A: snapshot shows UI in an unexpected state

The test is correctly observing a real product defect. Examples:

- Snapshot on `/checkout` shows `"Tu carrito está vacío"` →
  cart is being cleared somewhere it shouldn't.
- Snapshot on confirmation page shows `"Pedido no encontrado"` →
  the order isn't being persisted.
- Snapshot shows a stale price → caching layer not invalidating.

**Action:** investigate the product code path. Do NOT modify the test.
The test is doing its job.

#### Case B: snapshot shows expected UI but the locator failed

A real timing race. Examples:

- Snapshot shows the form field, but it appeared 100 ms after the test
  gave up.
- Snapshot shows the modal, but the test was waiting on the button it
  contains and the button mounted late.

**Action:** widen the timeout, switch to `Promise.race`, or add an
explicit `waitForURL` / `waitFor({state: 'visible'})` before the
assertion. Test fix is appropriate.

#### Case C: snapshot shows the user logged out / a redirect happened mid-test

Session expired, auth race, server restart. Investigate the auth flow
or the test's `loginAs` helper. May require a product fix (token
refresh) or a test fix (re-login on demand).

## Integration — Step-by-step

### Step 1 — Reproduce locally

```bash
# Set up once per machine (skip if already done):
#   1. createdb marketplace_test
#   2. DATABASE_URL_TEST set in .env.test (already shipped)
#   3. With that env: npx prisma migrate deploy --schema prisma/schema.prisma

# To run a single failing file:
DATABASE_URL=$(grep DATABASE_URL_TEST .env.test | cut -d= -f2- | tr -d '"') \
NODE_ENV=test \
npx tsx --test test/integration/<file>.test.ts 2>&1 | tee /tmp/test-out.log

# To filter to one failing test by name:
grep -A 30 "<test name fragment>" /tmp/test-out.log
```

The full stack trace is in the output. Look for `stack: |-` blocks in
the TAP output — they include the full call chain.

### Step 2 — Read the stack trace bottom-up

Stack frames go from top (the place that threw) to bottom (your test).
The bug usually lives at one of:

- Frame 2-3 from the top → bug at a Next.js / framework boundary
  (e.g. calling `headers()` outside a request scope, calling `cookies()`
  before `await`).
- Frame in your project's `src/lib/*` → bug in a shared helper.
- Frame in `test/integration/helpers.*` → bug in a test helper (see
  next section).

### Step 3 — If the failure points at a "stable" helper, suspect the HELPER

When a test that uses a long-existing helper / wrapper / utility starts
failing, the default hypothesis should be **"the helper had a latent
bug that nobody had exercised, and the new code revealed it"** — NOT
"the new code is wrong".

The cart-checkout shard 0 incident (#1110): `clearTestSession()` had
been wrong since day one — it delegated to `resetTestActionSession()`
which sets `globalThis.__testActionSession = undefined`, but the
contract in `getActionSession()` is that `undefined` means "no test
mode active" (falls through to `auth()` which calls `headers()` and
throws). Every previous user of `clearTestSession` either re-injected
a session right after, or didn't reach `auth()`. The bug was latent
for the entire lifetime of the helper.

**Heuristic:** the helper has 2-3 logical states but only 1-2 were
exercised by previous callers. Read the helper's source AND the
contract of whatever it delegates to. Look for sentinel values
(undefined vs null vs missing) and "fallthrough to real impl" branches.

### Step 4 — Don't lean on `npm run verify` for integration tests

`npm run verify` (added in #1103) runs lint + typecheck + audits + fast
unit/contract tests. It **does NOT** run integration tests because they
need a DB and are slow. **For PRs that touch server actions, helpers
in `test/integration/`, or anything that crosses the request boundary,
also run `npm run test:integration` locally** before pushing. Takes
~3-5 min on a warm machine.

This is the gap between local `verify` and full CI: integration tests
only run on CI. If CI is red on integration, that signal is hidden
unless you reproduce locally.

## Hard rules (both kinds)

### 3 iterations = wrong layer

If you've pushed three test patches and the failure signature is
identical each time, you are patching at the wrong layer. Stop.

Walk up the data flow:

- Test asserts X is visible / X equals Y.
- X comes from the action / store / API call → which provider
  wires it → which helper / framework call → which DB query.
- Where does the data diverge from expected?

The cart-checkout E2E incident: 3 test patches at the locator layer,
when the bug was in `CartHydrationProvider` (3 layers up). The
order-create integration incident: 0 test patches needed because step
1 (reproduce + read stack) immediately pointed at the helper.

### Pre-existing red on main is signal, not noise

If a test has been red on main for hours when you start work, do NOT
default to "not my problem, parch around it". Spend 5-10 min on root
cause investigation. The cart hydration bug and the
`clearTestSession` bug both started as "pre-existing failures we
inherited" and turned out to be real defects affecting either users
(cart) or every downstream PR (test helper).

## Companion tools

- [`scripts/diagnose-failed-run.sh`](../../scripts/diagnose-failed-run.sh) — E2E artifact dumper.
- [`scripts/verify.mjs`](../../scripts/verify.mjs) (`npm run verify`) — fast local pre-CI check (no integration / E2E).
- [`docs/runbooks/ci-incident.md`](./ci-incident.md) — when CI is red on `main` and blocking everyone.
