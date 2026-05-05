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

### Structural enforcement (active 2026-04-26)

A guard wrapper at `~/.local/bin/git` (laptop-local install, **not** committed to this repo) actively rejects HEAD-moving and working-tree-mutating subcommands inside `/home/whisper/marketplace`. The detection model inverted on 2026-04-26 from "detect a specific agent harness via env var" to **"block by default, humans opt out"**. Reason: Codex CLI, GitHub Copilot CLI, and any future agent harness should inherit the guard automatically without per-agent allowlist maintenance. There is no env var that all agents share, so the only stable signal is the absence of the human marker.

| Behaviour | When it fires |
|---|---|
| **Block:** `checkout`, `switch`, `reset`, `restore`, `stash`, `merge`, `rebase`, `pull`, `cherry-pick`, `revert`, `am` | cwd inside `/home/whisper/marketplace` AND `HUMAN_SHELL` is unset |
| **Allow:** `fetch`, `worktree add/remove/list`, `log`, `status`, `diff`, `show`, `branch`, `remote`, etc. | Always |
| **Humans opt out:** add `export HUMAN_SHELL=1` to your shell rc file once. Your shells then run unrestricted on the protected path. | Persistent |
| **One-shot bypass:** prefix one invocation with `AGENT_BYPASS=1` (or the legacy `CLAUDE_AGENT_BYPASS=1` for back-compat). | Manual override after explicit user confirmation |

When blocked, the wrapper prints a message pointing to this section and `AGENTS.md`, and exits with code 1.

The wrapper's source lives at `~/.local/bin/git` on the laptop. A reference copy with the same logic ships at [`scripts/agent-guard-git.sh`](../scripts/agent-guard-git.sh) for reviewers and replication; editing the repo copy does NOT change behaviour. To change behaviour, edit the laptop file directly.

**Setup for humans:** add `export HUMAN_SHELL=1` to `~/.bashrc` (bash) or `~/.zshrc` (zsh). Verify with `git -C /home/whisper/marketplace stash list` — if you see the actual stash list (or empty), you are set up; if you see the BLOCKED banner, the env var is not propagating into your shell.

**Setup for agent harnesses:** none required. Any process that does not export `HUMAN_SHELL=1` is treated as agent-controlled.

History: motivated by an inventory pass on 2026-04-26 that found 21 long-lived stashes (oldest 13 days, 15 over the 24h limit) and 7 worktrees with stale uncommitted WIP, several self-labelled `wip-other-agent`. The previous mitigation (docs-only nudge in #833) was insufficient because it relied on every agent reading and obeying. The first wrapper iteration in #839 detected only Claude Code (via `CLAUDE_CODE_SESSION_ID`); the inversion to "block by default" extends the guard to every agent without per-vendor maintenance.

### Concrete conventions

**1 agent = 1 worktree.** Non-negotiable. The base checkout at `/home/whisper/marketplace` is for solo work; parallel agents must branch out.

- **Path layout:**

  ```text
  /home/whisper/marketplace          → base (not shared in parallel)
  /home/whisper/worktrees/<agent-1>  → isolated
  /home/whisper/worktrees/<agent-2>  → isolated
  ```

- **Spawn:**

  ```bash
  git fetch origin
  git worktree add /home/whisper/worktrees/<name> origin/main -b feat/<feature>
  ```

- **Port per agent:** each agent runs its own dev server on its own port (`3001`, `3002`, `3003`, …). Never share a `next dev` process.
- **`node_modules`:** reuse across worktrees only if the build stays green. Prisma `generate` has bitten us here — when in doubt, install fresh.
- **Rebase policy:** do **not** rebase every time `main` moves. Rebase once, when work is ready to merge (or immediately before merge). Constant rebasing burns CI and creates phantom "behind" churn.
- **Stop on anomalies.** Files mutating without cause, branch switching under you, or index errors → halt, move work to a fresh worktree, do not try to salvage in-place.
- Never `reset`, `checkout`, `clean`, or modify branches outside your own worktree.

Priority: **isolation > convenience.** An extra worktree is cheap; corrupted work is not.

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

For the merge side of the workflow, keep [`docs/runbooks/pr-landing-checklist.md`](runbooks/pr-landing-checklist.md) open while you land PRs. It is the short version of the same guardrails: right worktree, exact contract check, one sync before merge, no protection bypass for convenience.

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

**Default merge command** (uses GitHub auto-merge — enabled in this repo since 2026-04-26):

```bash
gh pr merge <number> --auto --squash --delete-branch
```

GitHub queues the PR and merges it the moment all required checks pass and the head is up-to-date with `main`. You can move on to the next task immediately — no need to babysit the rebase loop. If `main` advances and your branch falls behind, GitHub posts a comment on the PR; rebase and force-push when convenient.

Auto-merge is **per PR**, not a permanent repo or agent setting. Draft/ready transitions, new pushes, or manual UI changes can leave a PR ready but unarmed. Before declaring a PR queued, verify it:

```bash
gh pr view <number> --json autoMergeRequest,mergeStateStatus,statusCheckRollup
```

If `autoMergeRequest` is `null`, auto-merge is not armed. Re-run the default merge command above, or use the synchronous merge path below if the required checks are already green and the PR must land now.

**Synchronous merge** (only when you need the result *right now*, e.g. unblocking a chain of stacked PRs):

```bash
gh pr merge <number> --squash --delete-branch
```

Returns immediately on success/failure. Will fail if checks aren't done or the branch is outdated — fix and retry.

**`--admin` is reserved for emergencies.** Bypassing branch protection is a real cost: the change ships without the same safety net every other PR pays for. Use only when:
- The change is provably risk-free (docs-only, hot-fix revert, etc.)
- You've already passed CI on a recent ancestor
- High-concurrency rebase loops would otherwise burn an hour
- You explicitly tell the user / co-maintainer afterwards

After the merge:

```bash
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
