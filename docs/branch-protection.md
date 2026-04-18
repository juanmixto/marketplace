# Branch protection — required checks

This is the snapshot of the `main` branch protection ruleset (reference config; the source of truth is GitHub's UI under **Settings → Rules → Rulesets**). Update this doc whenever the ruleset changes.

## Required status checks on `main`

The following checks must pass before a PR can be merged. They correspond to job names in `.github/workflows/`:

| Check | Workflow | Why it gates |
|---|---|---|
| `Verify` | `ci.yml` | Lint + audit:contracts + typecheck + unit tests |
| `Build And Migrate` | `ci.yml` | `prisma migrate diff` (schema drift) + `migrate deploy` + `next build` |
| `Integration shard 0` / `1` / `2` | `ci.yml` | All 3 shards of `test/integration/**` |
| `E2E Smoke` | `ci.yml` | Playwright smoke spec — see [`docs/ci-testing-strategy.md §6`](ci-testing-strategy.md) |
| `Doctor (schema + routes + healthcheck)` | `doctor.yml` | Post-middleware HTTP probes + authenticated probes (#525, #526) |
| `Analyze (actions)` / `Analyze (javascript-typescript)` / `CodeQL` | CodeQL | Security scanning |

## Rules that must stay on

- **Require status checks to pass**: all of the above.
- **Require branches to be up to date**: yes — forces rebase against current `main`, so "drift from main" can't mask a failing check.
- **Block force pushes to `main`**: yes.
- **Required linear history**: yes (squash merges only; see [`docs/git-workflow.md`](git-workflow.md)).
- **Restrict deletions on `main`**: yes.
- **Require signed commits**: not required; the team uses GitHub-verified co-author trailers (see `AGENTS.md`).

## What is NOT required (and why)

- `Nightly` workflow — it runs full E2E in prod mode, not PR-scoped. A nightly failure opens an issue; it doesn't block merges.
- `Lighthouse` — informational PWA/perf metric, not a correctness gate.
- `Integration` (summary job) — reporting-only aggregator of the 3 shards; the shards themselves are the gate.

## When to update this doc

- Adding a new workflow job that is meant to be blocking: add it to the ruleset AND this table in the same PR.
- Demoting a check to non-blocking (last resort; open a retrospective): update both.
- Renaming a job: the GitHub ruleset identifies checks by name — renaming without updating the ruleset silently disables the gate. Always change both at once.

## How to audit

```bash
gh api repos/juanmixto/marketplace/rulesets --jq '.[].name'
gh api repos/juanmixto/marketplace/rulesets/<id> --jq '.rules[] | select(.type=="required_status_checks")'
```

Compare the returned list against the table above; divergence means either the doc or the ruleset is stale.
