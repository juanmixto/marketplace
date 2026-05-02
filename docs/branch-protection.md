# Branch protection — required checks

This is the snapshot of the `main` branch protection ruleset (reference config; the source of truth is GitHub's UI under **Settings → Rules → Rulesets**). Update this doc whenever the ruleset changes.

## Required status checks on `main`

The following checks **must pass** before a PR can be merged. They correspond to job names in `.github/workflows/` and are verified as currently active in the GitHub ruleset (audited 2026-04-29):

| Check | Workflow | Why it gates | Status |
|---|---|---|---|
| `Verify` | `ci.yml` (real) + `ci-docs.yml` (no-op for docs-only PRs) | Lint + audit:contracts + typecheck + unit tests | ✅ ACTIVE |
| `Build And Migrate` | `ci.yml` (real) + `ci-docs.yml` (no-op for docs-only PRs) | `prisma migrate diff` (schema drift) + `migrate deploy` + `next build` | ✅ ACTIVE |
| `E2E Smoke` | `ci.yml` (real) + `ci-docs.yml` (no-op for docs-only PRs) | Playwright smoke spec — see [`docs/ci-testing-strategy.md §6`](ci-testing-strategy.md) | ✅ ACTIVE |

`ci.yml` ignores docs-only paths (`**/*.md`, `.vscode/**`, `LICENSE`, `.gitignore`) to avoid paying the full pipeline tax on typo fixes. Without a sibling, those PRs would never get the required contexts reported and become permanently `BLOCKED` (discovered with #1038 + #1039 on 2026-04-29). `ci-docs.yml` is the path-inverse companion that posts trivial green checks under the same context names so doc-only PRs can satisfy branch protection. **When promoting a check to required, mirror it in both workflows or revert the docs PR's mergeability gain.**

## Rules that must stay on

- **Require status checks to pass**: all of the above.
- **Require branches to be up to date**: yes — forces rebase against current `main`, so "drift from main" can't mask a failing check. Compensating workflow: `.github/workflows/auto-update-pr-branches.yml` runs after every push to `main` (and every 30 min as backup) and triggers `update-branch` on every open PR with auto-merge enabled and `mergeStateStatus = BEHIND`. Without that, a PR queue silently rots in `BEHIND` forever — that's exactly the failure mode that kept main red across 30+ pushes on 2026-04-28 (every fix waiting on a manual rebase before it could land).
- **Block force pushes to `main`**: yes.
- **Required linear history**: yes (squash merges only; see [`docs/git-workflow.md`](git-workflow.md)).
- **Restrict deletions on `main`**: yes.
- **Require signed commits**: not required; the team uses GitHub-verified co-author trailers (see `AGENTS.md`).

## Aggregator gate pattern (matrix shards → single required context)

Required checks like `E2E Smoke` are aggregator jobs that fan out into a matrix (`E2E Smoke (shard 1)` … `(shard 8)`). The aggregator must explicitly fail when any shard fails, otherwise GitHub treats the SKIPPED-on-needs-failure result as **neutral** and lets the PR merge.

The 2026-04-29 incident: #1037, #1040, and #1043 each merged with red shards because the aggregator was the default shape, which evaluates to SKIPPED rather than FAILURE when `needs:` fails. Branch protection passed all three through silently. Fixed in #1041.

```yaml
# WRONG — `needs` failure → job SKIPPED → branch protection treats as neutral
e2e-smoke-complete:
  name: E2E Smoke
  needs: e2e-smoke
  steps:
    - run: echo "All E2E smoke shards passed"

# RIGHT — `if: always()` runs the aggregator, explicit step fails it
e2e-smoke-complete:
  name: E2E Smoke
  needs: e2e-smoke
  if: always()
  steps:
    - if: needs.e2e-smoke.result != 'success'
      run: |
        echo "::error::E2E Smoke aggregator failed: shards did not all succeed (result=${{ needs.e2e-smoke.result }})"
        exit 1
    - run: echo "All E2E smoke shards passed"
```

**When promoting a check to required AND it has matrix shards, the aggregator must use the `if: always() + result-check` pattern.** Any other shape is a silent bypass.

The same fix applies to the `integration` aggregator in `ci.yml` (#1041), and to any future required matrix job (e.g., a future `Doctor` if its checks fan out).

## What is NOT required (and why)

- `Integration shard 0` … `15` and `Integration` (aggregator) — gated by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'` in `ci.yml`, so they only run **post-merge** on `main`. They are NOT in the required-checks list (verified 2026-04-29), so they cannot be a phantom required-skipped check on PRs. Coverage gap (#974): integration tests don't run on PRs at all; revisit if regressions slip past `Verify` repeatedly.
- `Doctor (schema + routes + healthcheck)` — runs on every push but is NOT a required check. Consider promoting to required if it stays green for 2 weeks straight (issue #TBD).
- `Analyze (actions)` / `Analyze (javascript-typescript)` / `CodeQL` — security scanning is performed via the `Security Scan` workflow. CodeQL results are informational and not a merge blocker in this ruleset.
- `Security Scan` (semgrep + gitleaks + npm audit) — runs only on push to `main` (no PR trigger), so it cannot be required.
- `Nightly` workflow — it runs full E2E in prod mode, not PR-scoped. A nightly failure opens an issue; it doesn't block merges.
- `Lighthouse` — informational PWA/perf metric, not a correctness gate.

## When to update this doc

- Adding a new workflow job that is meant to be blocking: add it to the ruleset AND this table in the same PR.
- Demoting a check to non-blocking (last resort; open a retrospective): update both.
- Renaming a job: the GitHub ruleset identifies checks by name — renaming without updating the ruleset silently disables the gate. Always change both at once.

## How to audit

```bash
# List required checks from branch protection (current standard)
gh api repos/juanmixto/marketplace/branches/main/protection \
  --jq '.required_status_checks.checks[].context' | sort -u

# List actual jobs from latest run on main
RUN_ID=$(gh run list --repo juanmixto/marketplace --branch main --limit 1 --json databaseId -q '.[0].databaseId')
gh run view "$RUN_ID" --repo juanmixto/marketplace --json jobs --jq '.jobs[].name' | sort -u
```

Compare the first list against the **ACTIVE** checks in the table above. If divergence is found:
- **Missing check that should gate**: add it to the GitHub ruleset (Settings → Rules → Rulesets → Edit).
- **Check in ruleset but not in CI**: rename must be done in both places simultaneously — renaming only in the ruleset silently disables the gate.
- If unsure, ask in #eng or open an issue for discussion.
