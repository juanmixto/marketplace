#!/usr/bin/env bash
# Multi-agent guard for /home/whisper/marketplace
#
# REFERENCE COPY of the wrapper that lives at ~/.local/bin/git on the
# laptop and intercepts `git` invocations before /usr/bin/git. This
# file in the repo is for review and replication only — editing it
# does NOT update the active wrapper. To change behaviour, edit
# ~/.local/bin/git directly. See docs/git-workflow.md § "Structural
# enforcement" for context.
#
# Blocks HEAD-moving + working-tree-mutating git operations on the
# shared main repo when invoked by ANY automated agent (Claude Code,
# Codex, Copilot CLI, future agents). Prevents the "branch changed
# under my feet" + "stash defensively over another agent's WIP"
# failure modes documented in docs/git-workflow.md.
#
# Detection model: BLOCK BY DEFAULT. The shell is treated as agent-
# controlled unless explicitly marked human. Humans add
#   export HUMAN_SHELL=1
# to their .bashrc / .zshrc / equivalent. Any agent harness inherits
# the absence of that flag and is automatically guarded — no per-
# agent allowlist of env vars to maintain.
#
# - Block-list: checkout, switch, reset, restore, stash, merge,
#               rebase, pull, cherry-pick, revert, am
# - Allow-list: fetch, worktree, log, status, diff, show, branch,
#               remote, push (handled separately at branch protection)
# - Override: prefix one call with CLAUDE_AGENT_BYPASS=1 (kept for
#             back-compat; AGENT_BYPASS=1 also works)
#
# Scope: only when cwd's repo top-level is /home/whisper/marketplace.
# Worktrees under /home/whisper/worktrees/* and any other repo are
# never affected. The wrapper is a no-op on every other path.

REAL_GIT=/usr/bin/git
PROTECTED_PATH=/home/whisper/marketplace

# Fast path: humans run unrestricted
if [ "${HUMAN_SHELL:-}" = "1" ]; then
  exec "$REAL_GIT" "$@"
fi

# Bypass override (one-shot, supports both names for back-compat)
if [ "${CLAUDE_AGENT_BYPASS:-}" = "1" ] || [ "${AGENT_BYPASS:-}" = "1" ]; then
  exec "$REAL_GIT" "$@"
fi

# Resolve the repo top-level. Respects any -C path / --git-dir flag
# that may precede the subcommand.
TOPLEVEL=$("$REAL_GIT" "$@" rev-parse --show-toplevel 2>/dev/null) || true
if [ -z "$TOPLEVEL" ]; then
  TOPLEVEL=$("$REAL_GIT" rev-parse --show-toplevel 2>/dev/null || pwd)
fi

# Only guard when operating on the protected repo
if [ "$TOPLEVEL" != "$PROTECTED_PATH" ]; then
  exec "$REAL_GIT" "$@"
fi

# Find the actual subcommand (skip global flags like -C path, -c key=val)
SUBCMD=""
i=1
while [ $i -le $# ]; do
  arg="${!i}"
  case "$arg" in
    -C|-c)
      i=$((i + 2))
      continue
      ;;
    --git-dir=*|--work-tree=*|--namespace=*|--exec-path=*|--git-dir|--work-tree|--namespace|--exec-path)
      i=$((i + 1))
      continue
      ;;
    --*|-*)
      i=$((i + 1))
      continue
      ;;
    *)
      SUBCMD="$arg"
      break
      ;;
  esac
done

# Block-list of subcommands that mutate HEAD or working tree
case "$SUBCMD" in
  checkout|switch|reset|stash|merge|rebase|pull|cherry-pick|revert|am|restore)
    cat >&2 <<EOF

╔══════════════════════════════════════════════════════════════════╗
║ BLOCKED: agent attempted '$SUBCMD' in /home/whisper/marketplace    ║
╚══════════════════════════════════════════════════════════════════╝

The shared main repo is read-only for automated agents. This prevents
the "branch changed under my feet" and "stash over another agent's
WIP" incidents documented in docs/git-workflow.md.

What to do instead:
  1. Create a worktree from origin/main:
       git fetch origin main
       git worktree add /home/whisper/worktrees/<task-slug> \\
         -b <prefix>/<slug> origin/main
  2. cd into that worktree and work there.

If you genuinely need to bypass for one command (e.g. emergency
recovery, you confirmed with the user), prefix it:
  AGENT_BYPASS=1 git $SUBCMD ...
  (CLAUDE_AGENT_BYPASS=1 also works for back-compat.)

The guard treats every shell as agent-controlled unless HUMAN_SHELL=1
is exported. If you ARE human and seeing this, add to your shell rc:
  export HUMAN_SHELL=1

See: AGENTS.md § "Before your first tool call"
     docs/git-workflow.md § "Concurrent-agent safety"

EOF
    exit 1
    ;;
esac

# Everything else passes through
exec "$REAL_GIT" "$@"
