#!/usr/bin/env bash
# Claude Code agent guard for /home/whisper/marketplace
#
# REFERENCE COPY of the wrapper that lives at ~/.local/bin/git on the
# laptop and intercepts `git` invocations before /usr/bin/git. This
# file in the repo is for review and replication only — editing it
# does NOT update the active wrapper. To change behaviour, edit
# ~/.local/bin/git directly. See docs/git-workflow.md § "Structural
# enforcement" for context.
#
# Blocks HEAD-moving + working-tree-mutating git operations on the
# shared main repo when invoked by a Claude Code agent. Prevents the
# "branch changed under my feet" + "stash defensively over another
# agent's WIP" failure modes documented in docs/git-workflow.md.
#
# - Detects agent via CLAUDE_CODE_SESSION_ID env var (set by harness)
# - Only blocks when cwd is inside /home/whisper/marketplace
# - Allow-list: fetch, worktree, log, status, diff, show, branch -l, etc.
# - Block-list: checkout, reset --hard, stash, merge, rebase, pull, cherry-pick, revert
# - Override: set CLAUDE_AGENT_BYPASS=1 for a single invocation
#
# Humans (no CLAUDE_CODE_SESSION_ID env) are never affected.
# Agents in /home/whisper/worktrees/* are never affected (only the main repo).

REAL_GIT=/usr/bin/git
PROTECTED_PATH=/home/whisper/marketplace

# Fast path: not an agent → straight to real git
if [ -z "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  exec "$REAL_GIT" "$@"
fi

# Bypass override
if [ "${CLAUDE_AGENT_BYPASS:-}" = "1" ]; then
  exec "$REAL_GIT" "$@"
fi

# Resolve the actual repo path. Use --show-toplevel which respects
# any -C flag that may precede the subcommand.
TOPLEVEL=$("$REAL_GIT" "$@" rev-parse --show-toplevel 2>/dev/null) || true
# Fallback: use the CWD if rev-parse failed (e.g. not in a repo)
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

The shared main repo is read-only for Claude Code agents. This
prevents the "branch changed under my feet" and "stash over another
agent's WIP" incidents documented in docs/git-workflow.md.

What to do instead:
  1. Create a worktree from origin/main:
       git fetch origin main
       git worktree add /home/whisper/worktrees/<task-slug> \\
         -b <prefix>/<slug> origin/main
  2. cd into that worktree and work there.

If you genuinely need to bypass for one command (e.g. emergency
recovery, you confirmed with the user), prefix it:
  CLAUDE_AGENT_BYPASS=1 git $SUBCMD ...

See: AGENTS.md § "Before your first tool call"
     docs/git-workflow.md § "Concurrent-agent safety"

EOF
    exit 1
    ;;
esac

# Everything else passes through
exec "$REAL_GIT" "$@"
