---
summary: Practical checklist for landing PRs safely in this repo. Designed to catch stale worktrees, wrong-cwd validation, and brittle contract checks before merge.
audience: agents, humans
read_when: before merging or revalidating a PR, especially when the branch edits tests, authz, deploys, or contract-sensitive code
---

# PR landing checklist

Use this as a guardrail, not as ceremony. If any stop condition fires, pause and re-sync before continuing.

## AGENTS quick copy

- [ ] I am in a dedicated worktree and `git status --short --branch` is clean.
- [ ] `scripts/agents-status.sh` shows no overlapping WIP or stale local work I would overwrite.
- [ ] I read the task-specific docs before editing.
- [ ] I am changing a real contract, not solving a hypothetical future scale problem.
- [ ] If the change is role-sensitive or idempotency-sensitive, I use the narrowest correct helper or allow-list.
- [ ] I validate from the edited worktree, with the smallest test that exercises the contract, not a stale copy from `main`.
- [ ] If `main` moved, I sync once before merge and re-run the minimum checks on the updated head.
- [ ] I do not merge while CI is red, checks are missing, or I need `--admin` for convenience.
- [ ] After merge, `gh pr view` says `MERGED` and the temporary worktree / session note are cleaned up.

## 0. Start in the right place

- [ ] I am in a dedicated worktree, not the shared `/home/whisper/marketplace` checkout.
- [ ] `git status --short --branch` is clean in the worktree.
- [ ] `scripts/agents-status.sh` shows no unowned WIP that overlaps this branch or files.
- [ ] `docs/state-of-the-world.md` was read if the task touches deploys, domains, tunnels, or feature flags.
- [ ] I read the task-specific docs before editing:
  - `docs/runbooks/test-debug.md` for tests.
  - `docs/authz-audit.md` for role-sensitive changes.
  - `docs/checkout-dedupe.md` for checkout idempotency.
  - `docs/idempotency.md` for non-checkout mutations with replay safety.

Stop if:

- [ ] The worktree is dirty and the changes are not mine.
- [ ] I cannot name which docs govern the area I am changing.

## 1. Before coding

- [ ] The change answers a real question today, not a hypothetical future scale problem.
- [ ] The smallest possible version fits in one PR.
- [ ] I am not adding a framework for the third similar case if the first two are still handwritten.
- [ ] If the change is role-sensitive, I prefer an explicit allow-list or narrow helper over a broad shared helper.
- [ ] If a test reads source files, I know which `cwd` and worktree it must run against.

Stop if:

- [ ] The feature only matters once the catalog is much larger.
- [ ] The fix needs a second PR before it can be meaningful.
- [ ] I am about to add a brittle substring assertion that can be satisfied by a comment or alias.

## 2. Validate the real contract

- [ ] I run the smallest test that exercises the edited contract.
- [ ] For route and handler changes, I test both the allowed path and the denied path.
- [ ] For source-contract tests, I check the exact line or block in the edited worktree, not a stale copy from `main`.
- [ ] For file-content assertions, I use exact strings or precise code-shape checks.
- [ ] If the worktree lacks tooling like `tsx`, I use the root `node_modules` or an absolute loader path instead of guessing.

Stop if:

- [ ] The test only passes from the wrong directory.
- [ ] The assertion is true because of a comment, alias, or unrelated helper.
- [ ] I cannot explain the contract the test is actually pinning.

## 3. Before pushing

- [ ] `git diff --stat` contains only the intended files.
- [ ] The commit message names the contract or behavior, not just the filename.
- [ ] If `main` moved, I sync once before merge and then re-verify the minimum needed checks.
- [ ] I do not rebase in a loop just to chase every new `main` commit.
- [ ] The branch still reflects the latest validated head.

Stop if:

- [ ] The branch is behind and I have not re-run verification.
- [ ] The push would hide unrelated WIP from another agent.
- [ ] I would need `--admin` to make the merge happen.

## 4. Before merging

- [ ] The PR description says what changed and what contract it protects.
- [ ] I checked the latest PR run on the current head, not only the last green run on an older head.
- [ ] If the PR fixed a flaky regression, I want a fresh green run on the updated head before merging.
- [ ] If GitHub reports `BEHIND`, I sync and push before asking it to merge.
- [ ] The normal merge path is `gh pr merge --auto --squash --delete-branch`.

Stop if:

- [ ] CI is red on the current head.
- [ ] Required checks are missing, renamed, or skipped unexpectedly.
- [ ] The branch is still behind after the last push.
- [ ] I am considering a protection bypass for convenience rather than necessity.

## 5. After merge

- [ ] `gh pr view` shows `state: MERGED`.
- [ ] The temporary worktree is removed or clearly marked done.
- [ ] Temporary rescue branches are deleted once the useful work is safely on `main`.
- [ ] Any session note or scratchpad for the task is cleaned up.

## Hardening notes

- Exact matches beat broad `includes(...)` checks when a test is meant to guard a contract.
- Comments do not count as proof of behavior.
- A green PR is not enough if the branch becomes behind before merge.
- If the same validation only works from a specific directory, document that directory explicitly.
- When a merge turns up a stale checklist item, fix the checklist instead of hoping the next person remembers.
