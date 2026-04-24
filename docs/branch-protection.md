# Branch protection — required checks

This is the snapshot of the `main` branch protection ruleset (reference config; the source of truth is GitHub's UI under **Settings → Rules → Rulesets**). Update this doc whenever the ruleset changes.

## Required status checks on `main`

The following checks **must pass** before a PR can be merged. They correspond to job names in `.github/workflows/` and are verified as currently active in the GitHub ruleset (audited 2026-04-23):

| Check | Workflow | Why it gates | Status |
|---|---|---|---|
| `Verify` | `ci.yml` | Lint + audit:contracts + typecheck + unit tests | ✅ ACTIVE |
| `Build And Migrate` | `ci.yml` | `prisma migrate diff` (schema drift) + `migrate deploy` + `next build` | ✅ ACTIVE |
| `E2E Smoke` | `ci.yml` | Playwright smoke spec — see [`docs/ci-testing-strategy.md §6`](ci-testing-strategy.md) | ✅ ACTIVE |

## Rules that must stay on

- **Require status checks to pass**: all of the above.
- **Require branches to be up to date**: yes — forces rebase against current `main`, so "drift from main" can't mask a failing check.
- **Block force pushes to `main`**: yes.
- **Required linear history**: yes (squash merges only; see [`docs/git-workflow.md`](git-workflow.md)).
- **Restrict deletions on `main`**: yes.
- **Require signed commits**: not required; the team uses GitHub-verified co-author trailers (see `AGENTS.md`).

## What is NOT required (and why)

- `Integration shard 0` / `1` / `2` — were marked as required in historical configs, but are no longer gating in the active ruleset. These still run and their results inform local dev testing; consider re-enabling as a gate for higher integration coverage (issue #TBD).
- `Doctor (schema + routes + healthcheck)` — was intended as a runtime validation gate but is not currently active. Consider re-enabling to catch schema drift and route registration errors at merge time (issue #TBD).
- `Analyze (actions)` / `Analyze (javascript-typescript)` / `CodeQL` — security scanning is performed via other pipelines. CodeQL results are informational and not a merge blocker in this ruleset.
- `Nightly` workflow — it runs full E2E in prod mode, not PR-scoped. A nightly failure opens an issue; it doesn't block merges.
- `Lighthouse` — informational PWA/perf metric, not a correctness gate.
- `Integration` (summary job) — reporting-only aggregator of the 3 shards; the shards themselves are the gate.

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
