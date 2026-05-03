---
summary: 4-step playbook for debugging an E2E test that "looks flaky". Read the page snapshot before patching the test; iterate at the right layer.
audience: agents,humans
read_when: an E2E smoke (cart-checkout, multi-vendor, social-auth, etc.) starts failing intermittently
---

# E2E flake debug runbook

When an E2E smoke test fails on CI and your first instinct is "the test
is flaky, just retry / parch it", **stop and read this first**.

## TL;DR

1. **`bash scripts/diagnose-failed-run.sh <pr-number>`** — downloads the
   Playwright artifact and dumps the page snapshot to stdout. Read it.
2. **Compare snapshot vs expected UI**. Snapshot wrong → product bug.
   Snapshot right but locator missed → test timing.
3. **Don't patch the test on iteration 1.** Patch only when step 2
   confirms a real timing race.
4. **If iteration 3 has the same failure signature, you're at the wrong
   layer.** Walk up the data flow.

## Why this runbook exists

In the 2026-05-02 cart-checkout incident, the smoke had been red on
`main` for 6+ hours. The natural reaction — "test flake, parch it,
move on" — produced three test patches in a row, none of which fixed
anything, because the failure was a real product bug
(`CartHydrationProvider` clobbering local cart on full reload of
`/checkout`). The page snapshot showed `"Tu carrito está vacío"` on
what should have been `/checkout` — direct proof the test was correctly
observing UI state. ~90 min wasted before anyone read the snapshot.

The script and this playbook are the antidote.

## Step 1 — Download the page snapshot

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

## Step 2 — Read the snapshot. Diagnose.

Three cases:

### Case A: snapshot shows UI in an unexpected state

The test is correctly observing a real product defect. Examples:

- Snapshot on `/checkout` shows `"Tu carrito está vacío"` →
  cart is being cleared somewhere it shouldn't.
- Snapshot on confirmation page shows `"Pedido no encontrado"` →
  the order isn't being persisted.
- Snapshot shows a stale price → caching layer not invalidating.

**Action:** investigate the product code path. Do NOT modify the test.
The test is doing its job.

### Case B: snapshot shows expected UI but the locator failed

A real timing race. Examples:

- Snapshot shows the form field, but it appeared 100 ms after the test
  gave up.
- Snapshot shows the modal, but the test was waiting on the button it
  contains and the button mounted late.

**Action:** widen the timeout, switch to `Promise.race`, or add an
explicit `waitForURL` / `waitFor({state: 'visible'})` before the
assertion. Test fix is appropriate.

### Case C: snapshot shows the user logged out / a redirect happened mid-test

Session expired, auth race, server restart. Investigate the auth flow
or the test's `loginAs` helper. May require a product fix (token
refresh) or a test fix (re-login on demand).

## Step 3 — If you patch the test, push and watch

If step 2 was a clear Case B: change the test, push, wait for CI. Re-run
`scripts/diagnose-failed-run.sh` on the next failure. **Compare the
new snapshot to the previous one.** If identical, the patch was wrong.

## Step 4 — Hard rule: 3 iterations = wrong layer

If you've pushed three test patches and the failure signature is
identical each time (same locator, same line, same snapshot), you are
patching at the wrong layer. Stop.

Walk up the data flow:

- Test asserts X is visible on page Y.
- Y route renders → state populates → store hydrates → API/data source.
- Where in that chain does the snapshot diverge from expected?

The cart-checkout incident: 3 test patches at the locator layer, when
the bug was in `CartHydrationProvider` (3 layers up: Test → Page →
Provider → Store). The Provider was overwriting the local cart with
an empty server response on every full reload. A glance at the snapshot
on iteration 1 would have surfaced that immediately.

## Companion tools

- [`scripts/diagnose-failed-run.sh`](../../scripts/diagnose-failed-run.sh) — step 1 automation.
- [`docs/ai-workflows.md`](../ai-workflows.md) § TL;DR — `npm run verify` to catch typos / contract regressions before they hit CI.
- [`docs/runbooks/ci-incident.md`](./ci-incident.md) — when CI is red on `main` and blocking everyone.
