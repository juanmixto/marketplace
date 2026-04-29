#!/usr/bin/env bash
# scripts/agent-context.sh
#
# Print the minimum reading list for a given task type.
#
# Why this script exists: docs/AGENT-CONTEXT.md gives agents the dense facts
# (decisions, invariants, anti-patterns). When a task is scoped (checkout,
# auth, ingestion, db…) the agent still needs to open 1–2 specific runbooks
# or convention docs. Picking those by hand from AGENTS.md / CLAUDE.md is
# token-heavy and inconsistent across agents. This script makes the choice
# deterministic and cheap.
#
# Usage:
#   scripts/agent-context.sh                  # list task types
#   scripts/agent-context.sh <task-type>      # print reading list for that type
#   scripts/agent-context.sh --all            # print every task type's list
#
# The script ONLY prints paths (one per line, optional inline reason after #).
# It never reads files or makes assumptions about your task — pipe through
# `xargs cat` if you want to dump the content, or feed paths to your editor.
#
# Add a new task type: edit the case statement below. Keep each list to ≤ 4
# files. If you need more than 4, the task is probably two task types stacked.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

# Always-on baseline. Every task starts here.
BASELINE=(
  "AGENTS.md                              # multi-agent contract + repo rules"
  "docs/AGENT-CONTEXT.md                  # decisions + invariants + anti-patterns (dense)"
)

print_list() {
  local task="$1"
  shift
  echo "# task: $task"
  echo "# baseline (read first):"
  printf '  %s\n' "${BASELINE[@]}"
  echo "# task-specific:"
  if [ "$#" -eq 0 ]; then
    echo "  (no extra reading — baseline is enough)"
  else
    printf '  %s\n' "$@"
  fi
  echo ""
}

list_tasks() {
  cat <<'EOF'
agent-context — minimum reading list per task type

Usage:
  scripts/agent-context.sh <task>
  scripts/agent-context.sh --all

Available task types:

  product         feature/UX visible to buyer or vendor
  checkout        anything in the checkout/payment path
  auth            login, OAuth, signup, account recovery
  catalog         product listing, PDP, search, filters
  vendor          vendor onboarding, vendor panel, ghost vendor
  admin           admin panel pages, admin actions
  db              prisma schema, migration, FK, relations
  webhook         stripe / oauth / telegram webhook handlers
  ingestion       telegram ingestion (raw or processing)
  i18n            adding/changing copy in ES/EN
  pwa             service worker, manifest, install prompts
  security        rate limit, WAF, IP resolution, edge
  ci              CI workflows, branch protection, required checks
  test            adding/changing tests
  refactor        no-behavior-change refactor across files
  bugfix          bug fix with reproducible cause
  docs            doc-only change

Run with --all to dump every list.
EOF
}

case "${1:-}" in
  ""|-h|--help)
    list_tasks
    exit 0
    ;;
  --all)
    for t in product checkout auth catalog vendor admin db webhook ingestion i18n pwa security ci test refactor bugfix docs; do
      "$0" "$t"
    done
    exit 0
    ;;
esac

case "$1" in
  product)
    print_list product \
      "docs/product/01-principios-producto.md   # 10 hard UX rules" \
      "docs/product/02-flujos-criticos.md       # CF-1..CF-5; do not break" \
      "docs/business/09-decisiones-estrategicas.md  # ADRs (decisions closed)"
    ;;
  checkout)
    print_list checkout \
      "docs/product/02-flujos-criticos.md       # CF-1 is sacred" \
      "docs/checkout-dedupe.md                  # checkoutAttemptId UNIQUE + force-dynamic" \
      "docs/state-machines.md                   # Order/Payment/Fulfillment guards" \
      "docs/runbooks/payment-incidents.md       # log scopes oncall depends on"
    ;;
  auth)
    print_list auth \
      "docs/auth/audit.md                       # auth surfaces + email-collision matrix" \
      "docs/adr/001-nextauth-prismaadapter-jwt.md  # auth architecture decision" \
      "docs/authz-audit.md                      # role + ownership checklist"
    ;;
  catalog)
    print_list catalog \
      "docs/business/03-productos-iniciales.md  # catalog philosophy" \
      "docs/product/01-principios-producto.md   # confidence > cleverness" \
      "docs/product/04-prioridades-ux-mobile.md # mobile rules"
    ;;
  vendor)
    print_list vendor \
      "docs/business/02-productores-ideales.md  # who we want / don't want" \
      "docs/business/07-copy-contacto-productores.md  # tone + templates" \
      "docs/product/02-flujos-criticos.md       # CF-3 onboarding"
    ;;
  admin)
    print_list admin \
      "docs/authz-audit.md                      # role + ownership checklist" \
      "docs/idempotency.md                      # IdempotencyKey + force-dynamic"
    ;;
  db)
    print_list db \
      "docs/db-conventions.md                   # FK ondelete, paginated findMany, money" \
      "docs/runbooks/db-backup.md               # Phase 0 backup setup (if touching infra)"
    ;;
  webhook)
    print_list webhook \
      "docs/orderevent-vs-webhookdelivery.md    # dedupe lives on WebhookDelivery" \
      "docs/state-machines.md                   # transitions + guards" \
      "docs/runbooks/payment-incidents.md       # log scopes (if Stripe)"
    ;;
  ingestion)
    print_list ingestion \
      "docs/ingestion/telegram.md               # raw pipeline + worker + sidecar" \
      "docs/ingestion/processing.md             # drafts, classifier, extractor, dedupe"
    ;;
  i18n)
    print_list i18n \
      "src/i18n/README.md                       # flat keys vs *-copy.ts; labelKey pattern"
    ;;
  pwa)
    print_list pwa \
      "docs/pwa.md                              # SW denylist; do not weaken"
    ;;
  security)
    print_list security \
      "docs/runbooks/under-attack.md            # L7 attack playbook" \
      "docs/runbooks/edge-protection.md         # Cloudflare/WAF (#540)"
    ;;
  ci)
    print_list ci \
      "docs/branch-protection.md                # required checks + audit command" \
      "docs/runbooks/ci-incident.md             # main is red — triage" \
      "docs/ci-testing-strategy.md              # test layout + sharding"
    ;;
  test)
    print_list test \
      "docs/ci-testing-strategy.md              # where tests live + how they shard" \
      "docs/authz-audit.md                      # cross-tenant negative test registry"
    ;;
  refactor)
    print_list refactor \
      "docs/ai-workflows.md                     # refactor recipe" \
      "docs/conventions.md                      # imports, server-action pattern"
    ;;
  bugfix)
    print_list bugfix \
      "docs/conventions.md                      # do not introduce regressions"
    ;;
  docs)
    print_list docs \
      "docs/audits/README.md                    # verify before flagging, re-verify before fixing"
    ;;
  *)
    echo "unknown task type: $1" >&2
    echo "" >&2
    list_tasks >&2
    exit 1
    ;;
esac
