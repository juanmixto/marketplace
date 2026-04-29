---
summary: main is red — playbook de triage. Escrito desde el incidente 2026-04-29 (3 smokes rotos atravesaron varios merges por bypass de branch protection).
audience: agents,humans
read_when: CI de main rojo; PRs encolando sobre base rota
---

# CI incident runbook — main is red, what now?

When `main`'s CI is red, work is silently being layered on top of a broken base. Every minute it stays red, the rollback surface grows. This runbook is the playbook for triage, written from the 2026-04-29 incident where three smokes broke and stayed broken across multiple merges because of a branch-protection bypass nobody noticed.

Read it once cold so the steps are recognisable when you need them at 23:00.

## 0. Confirm `main` is actually red

```sh
gh run list --workflow=ci.yml --branch=main --limit=3 --json conclusion,headSha,createdAt,event
```

- `"conclusion": "failure"` on the latest push event → red.
- `"conclusion": ""` (empty) → still running. Wait, don't act yet.
- `"conclusion": "cancelled"` → concurrency cancelled the run; check the next-newest entry instead. Most recent push wins.

If only nightly is red, this runbook does not apply — that's [`runbooks/payment-incidents.md`](payment-incidents.md) territory or its own follow-up.

## 1. Spot the bypass — was the PR even gated?

Before chasing the failing test, check **how the broken commit got onto `main`**. Branch protection has known bypass shapes:

### 1a. Aggregator job SKIPPED treated as neutral

```sh
gh pr view <NNN> --json statusCheckRollup -q '.statusCheckRollup[] | "\(.name): \(.conclusion // .status)"'
```

If the required `E2E Smoke` (or `Integration`) shows `SKIPPED` while individual `E2E Smoke (shard N)` rows show `FAILURE` — **the aggregator pattern is broken in `ci.yml`**. See [`branch-protection.md` § Aggregator gate pattern](../branch-protection.md). All aggregators must use `if: always()` + an explicit `result != 'success'` check.

This bypass shipped #1037, #1040, #1043 with red shards on 2026-04-29. Fixed in #1041.

### 1b. Doc-only PR with required checks unreported

If the PR only touches `**/*.md`, `.vscode/**`, `LICENSE`, `.gitignore`, the main `ci.yml` is path-filtered out. The required contexts (`Verify`, `Build And Migrate`, `E2E Smoke`) come from `ci-docs.yml` — a sidecar that posts no-op checks under the same names so doc PRs satisfy branch protection.

If `ci-docs.yml` isn't reporting them, doc-PRs become permanently `BLOCKED`. This shipped on 2026-04-29 between #1029 (added paths-ignore) and #1040 (added passthrough sidecar).

### 1c. Skipped check name no longer matches required context

`docs/branch-protection.md` lists the required contexts. If `ci.yml` renames a job, the old required name keeps "expecting" forever. Audit:

```sh
gh api repos/juanmixto/marketplace/branches/main/protection \
  --jq '.required_status_checks.contexts'
```

Should match the table in `branch-protection.md` exactly.

## 2. Was the regression introduced or pre-existing?

```sh
# What changed in src/ since the last green main run?
git log --since="<last-green-time>" --oneline -- src/
```

The last green commit's CI run is the baseline. Diff `src/` between then and now — the suspect set is usually 1-3 PRs. Most src/ files won't break smokes; focus on:
- `src/app/(public)/**/page.tsx` — server component changes
- `src/components/catalog/**` — PDP / cart UI
- `src/domains/cart/**` — store / persistence
- `src/lib/auth*.ts` — login flow
- `prisma/schema.prisma` — migration drift

If the PR-level CI for the suspect was green but `main` post-squash run is red, the merge-commit picked up an interaction the PR didn't see. **Don't trust PR-green for post-merge state.**

## 3. Extract evidence — page snapshot beats log grep

Playwright failures land more signal in the report artifact than in the run logs. The `error-context.md` files include a **full page snapshot at failure time** which often makes the bug obvious in 30 seconds.

```sh
# 1. Find the artifact name (depends on commit SHA)
RUN_ID=<from gh run list>
gh api "repos/juanmixto/marketplace/actions/runs/$RUN_ID/artifacts" \
  -q '.artifacts[] | select(.name | contains("shard5")) | .name'

# 2. Download
gh run download "$RUN_ID" --name "<artifact-name>" --dir /tmp/pw

# 3. Each failed test produces an error-context.md
ls /tmp/pw/data/*.md
grep -l "Test info" /tmp/pw/data/*.md
```

The first ~30 lines of any `error-context.md` give: test name, locator that failed, **page snapshot YAML**. That snapshot is the smoking gun:

| Snapshot says | Likely diagnosis |
|---|---|
| `heading "Tu carrito está vacío"` | Cart store didn't persist across navigation |
| `heading "Inicia sesión"` after login flow | Auth session lost / cookies dropped |
| Cart with wrong product / wrong quantity | Stale prop or productId mix-up |
| Generic 500 error page | Server crash, look at `[WebServer] [Error]` lines in run log |

Don't grep logs unless the snapshot was inconclusive — the snapshot is faster and more accurate.

## 4. Bisect via PR-level CI, not local repro

For narrow hypotheses, **a revert PR is faster than fighting local infra**:

1. Worktree off main: `git -C /home/whisper/marketplace worktree add /home/whisper/worktrees/<task-slug> -b fix/<slug> origin/main`.
2. Revert just the file(s) suspect — keep ≤3 files for a clean signal.
3. `git push -u origin fix/<slug>` → CI runs in ~5-7 min.
4. If the failing test goes green → hypothesis confirmed. If still red → suspect set was wrong, widen revert.

Don't try to spin up `marketplace_test` locally first. Cycle time on a PR-level CI run is shorter than any local-DB setup.

**Watch for flake amplification**, not just flake fixing. A revert that makes the test pass once might just reduce the flake rate, not fix the root cause. **Three consecutive green runs** on the suspect spec is the minimum bar before declaring "fixed".

## 5. Quarantine pattern — `.fixme`, never delete

When a spec is broken and the root cause needs more investigation than the current incident allows:

```ts
// In e2e/smoke/<spec>.spec.ts
test.describe('flow @smoke', () => {
  // Quarantined YYYY-MM-DD (#NNNN). <one-line symptom>.
  // <reason this is .fixme not deleted>.
  test.fixme('test name', async ({ page }) => {
    // ... unchanged body ...
  })
})
```

Why `.fixme` over `.skip` or removal:
- Keeps the spec visible in run logs as TODO (Playwright reports `.fixme` lines explicitly).
- Re-enabling is a one-line change — no need to re-discover where the spec lived.
- The `@smoke` tag stays, so the spec re-enters the gate the moment `.fixme` is removed.
- Open a tracking issue in the same PR (template in [`testing/business-tests.md`](../testing/business-tests.md)).

## 6. After the merge — verify the fix really fixed it

Don't rely on a single post-merge run. The last incident had a "fixed" cart-checkout that was actually flake-reduced (passed on PR's own run, failed on next main run, passed on the run after). Wait for **3 consecutive green main runs** before closing the incident.

```sh
gh run list --workflow=ci.yml --branch=main --limit=5 \
  --json conclusion,headSha,createdAt -q '.[] | "\(.createdAt) \(.headSha[:8]) \(.conclusion)"'
```

If runs 1-3 are green, ship it. If run 2 is red, the fix wasn't complete — back to step 2.

## 7. Common gotchas

- **`gh pr merge --auto` stalls on `mergeStateStatus: UNSTABLE`** even if Vercel isn't a required check. If all required contexts are SUCCESS, `gh pr merge --squash --delete-branch` (no `--auto`) is the unblock.
- **`gh pr merge --admin` doesn't bypass missing required checks.** It returns `GraphQL: N of N required status checks are expected`. Admin bypass requires the rule to have "Allow administrators to bypass" enabled, which our ruleset doesn't.
- **`update-branch` API errors with "merge conflict" can be transient.** Re-check `mergeStateStatus` directly via `gh pr view <NNN>` before assuming a real conflict.
- **The aggregator-skipped bypass (§ 1a) is silent.** No alert fires. The only signal is `main`'s next CI run going red. Run `gh run list --workflow=ci.yml --branch=main` periodically when shipping a string of PRs through auto-merge.

## References

- [`docs/branch-protection.md`](../branch-protection.md) — required contexts, ruleset audit command, aggregator gate pattern.
- [`docs/testing/business-tests.md`](../testing/business-tests.md) — smoke selectors, fixtures, debugging recipes.
- [`docs/ci-testing-strategy.md`](../ci-testing-strategy.md) — what tests run when, prod-mode coverage in nightly.
- Memory: `feedback_headers_before_unstable_cache.md`, `feedback_docs_only_pr_passthrough.md` — Next.js 16 + CI gotchas surfaced by the 2026-04-29 incident.
