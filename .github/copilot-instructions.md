# Copilot instructions — see AGENTS.md

GitHub Copilot reads this file by convention. The actual project conventions, multi-agent contract, and contributor checklist live in [`AGENTS.md`](../AGENTS.md) at the repo root, which is the single source of truth shared by Claude Code, Codex, Copilot, and any other agent or contributor.

**Before doing anything in this repo, read `AGENTS.md` end to end.**

Highlights you must respect (full detail in `AGENTS.md`):

- The shared main repo at `/home/whisper/marketplace` is **read-only for automated agents**. A guard wrapper at `~/.local/bin/git` actively blocks `checkout`, `switch`, `reset`, `restore`, `stash`, `merge`, `rebase`, `pull`, `cherry-pick`, `revert`, and `am` there. Work in a worktree under `/home/whisper/worktrees/<task>/` instead.
- Branch prefixes (`fix/`, `feat/`, `refactor/`, `docs/`, `chore/`) are documented in `docs/git-workflow.md`.
- Default merge command is `gh pr merge <n> --auto --squash --delete-branch`. Use synchronous merge or `--admin` only for documented exceptions.
- Domain boundaries are enforced by `scripts/audit-domain-contracts.mjs`. Cross-domain imports must go through barrels.

This file exists so Copilot picks up the same rules; do not duplicate them here. Fix `AGENTS.md` instead, then any agent reading either file gets the same answer.
