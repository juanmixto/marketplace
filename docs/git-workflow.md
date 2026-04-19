# Git workflow — trunk-based

`main` is the only long-lived branch. Every fix and feature lands on `main` via PR. There is no `develop`, no `next`, no `integration/*`.

This document is the canonical source of truth. If anything in your tooling, muscle memory, or another doc disagrees with it, this wins.

> Background: this policy exists because of the 2026-04-12 hygiene incident. A long-lived `integration/all-fixes` branch caused asymmetric squash-merge divergence, agents stomping on each other's working trees, and four >24h stashes containing real work. We adopted trunk-based to make those failure modes structurally impossible.

---

## Rules

### 1. `main` is the only trunk

Every change targets `main`. No intermediate aggregator branches. If you find yourself wanting one, the answer is **feature flags**, not branches (rule 2).

### 2. Big features hide behind feature flags

A multi-week feature is split into many small PRs that each merge to `main` behind a flag. The flag is flipped when the whole thing is ready. Long-lived feature branches are forbidden.

If we don't have a flag system yet, open an infra issue — don't reach for a long branch as a workaround.

### 3. One live branch per active task

When the task ends (merged or abandoned), the branch **and** its worktree are deleted in the same step. No "I'll clean up later".

```bash
# after a PR merges:
git checkout main && git pull
git branch -D <branch-name>
git worktree remove <worktree-path>   # if applicable
git fetch --prune                     # drop dead remote-tracking refs
```

### 4. No long-lived stashes

If a WIP needs to survive a context switch, it becomes an explicit `wip/<topic>` branch and is pushed. **Stashes older than 24 hours are forbidden** — convert them to a branch or drop them.

### 5. One worktree per active task

Not one per branch you've ever touched. When the task ends, `git worktree remove`. The hygiene script (below) lists worktrees whose branches are gone — review them and clean up.

### 6. Upstream `[gone]` is a decision, not a state

When a PR closes (merged or not) and origin deletes the branch, your local copy is in `[gone]` state. On the next hygiene pass:

- If the local branch has no unique commits → delete it.
- If it has unique commits → push a `rescue/<name>` to origin first, then delete locally. **Never silently drop unique commits.**

---

## Allowed branch prefixes

| Prefix | Purpose | Lifetime |
|---|---|---|
| `fix/<issue>-<slug>` | Bug fix tied to an issue | Until merge or drop |
| `feat/<issue>-<slug>` | New feature tied to an issue | Until merge or drop |
| `refactor/<issue>-<slug>` | Refactor tied to an issue | Until merge or drop |
| `docs/<issue>-<slug>` | Docs-only change | Until merge or drop |
| `chore/<slug>` | Tooling, CI, deps | Until merge or drop |
| `wip/<slug>` | Persisted WIP that survives a context switch | Days, not weeks |
| `rescue/<name>` | Backup of unique commits before destructive cleanup. **Never merged from directly** — revive into `feat/*` or `fix/*` or drop. | Until reviewed |
| `release/*` | Cut for an external consumer with a freeze window (mobile, partner). Created → merged → deleted. | Days |

Anything else (`integration/*`, `develop`, `next`, `staging`) is forbidden as a long-lived branch.

---

## Concurrent-agent safety

Multiple Claude Code agents (or a human + agent) can be active in the same repo at the same time. To avoid stomping on each other's work:

- **Before touching a worktree, run `git status`. If you see uncommitted changes that are not yours, do NOT proceed — stop and ask.** Those may be another agent's WIP.
- Prefer creating a **new branch + new worktree** over reusing an existing one when starting a task.
- Never `git stash` somebody else's working tree to "make room".

This rule comes directly from the 2026-04-12 incident, where an agent overwrote a concurrent agent's WIP because it assumed the worktree was idle.

---

## Hygiene

Run `scripts/git-hygiene.sh` periodically (or before starting a new task in a stale environment). It surfaces:

- Branches with `[gone]` upstreams.
- Worktrees whose branches were deleted.
- Stashes older than 24 hours.
- Local branches that have diverged from `origin` in a non-fast-forward way.

The script only **reports** by default — it never deletes anything without explicit confirmation. Use it as a checklist, not an autopilot.

```bash
./scripts/git-hygiene.sh
```

### Closing the loop

When a task is done, prefer this order:

1. Merge or archive the useful commits.
2. Align the active branch with the remote branch or `main`.
3. Remove temporary worktrees.
4. Delete temporary backup branches once the useful work is preserved.
5. Remove generated test artefacts such as `test-results/.last-run.json` if they are not part of the task.

If you are unsure whether a branch or worktree still contains unique work, stop and inspect the diff first. Do not assume a `[gone]` ref or a dirty worktree is safe to delete.

---

## Examples

### Starting a task

```bash
git checkout main && git pull
git checkout -b fix/123-cart-overflow
# ... work, commit, push ...
gh pr create --title "fix(cart): clamp overflow on long product names (#123)"
```

### Finishing a task

```bash
gh pr merge <number> --squash --delete-branch
git checkout main && git pull
git branch -D fix/123-cart-overflow
git fetch --prune
```

### A long-running task that needs a context switch

```bash
# don't stash — push a wip branch
git checkout -b wip/payments-refactor-day3
git add -A && git commit -m "wip: refactor in progress"
git push -u origin wip/payments-refactor-day3
# come back later, continue, eventually rename to feat/* before opening the PR
```

### Rescuing unique work before deletion

```bash
# you noticed a [gone] branch with unique commits
git push origin <branch>:refs/heads/rescue/<name>
git branch -D <branch>
# revisit rescue/<name> later, decide whether to revive or drop
```

---

## What does NOT belong in this workflow

- "Just one quick" feature branch that lives "for a couple of weeks"
- Stashes used as a long-term TODO list
- A worktree per branch instead of per active task
- Force-pushes to `main`
- Force-pushes to anyone else's branch
