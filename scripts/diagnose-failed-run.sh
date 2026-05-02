#!/usr/bin/env bash
# scripts/diagnose-failed-run.sh
#
# Download every failed-job artifact from a CI run (PR or run id) and
# print the artifact's `error-context.md` files to stdout — the page
# snapshot Playwright captures on test failure, which is usually the
# fastest signal for *why* a test failed.
#
# Why this script exists: in the 2026-05-02 cart-checkout incident I
# iterated three "fixes" of an E2E test before downloading the page
# snapshot and discovering the failure was a real product bug
# (`CartHydrationProvider` clobbering local cart on full reload of
# `/checkout`), not a test timing issue. The snapshot showed
# `"Tu carrito está vacío"` on what should have been `/checkout` —
# direct proof the test was correctly observing a UI defect. Reading
# it on iteration 1 instead of iteration 4 would have saved ~90 min.
#
# Usage:
#   bash scripts/diagnose-failed-run.sh <pr-number>
#   bash scripts/diagnose-failed-run.sh --run <run-id>
#
# Examples:
#   bash scripts/diagnose-failed-run.sh 1097
#   bash scripts/diagnose-failed-run.sh --run 25264055428
#
# Companion to docs/runbooks/e2e-flake-debug.md.

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/diagnose-failed-run.sh <pr-number>
  scripts/diagnose-failed-run.sh --run <run-id>

Downloads playwright-report artifacts from every failed job in the
specified CI run and prints the captured error-context.md (page
snapshot) for each failed test to stdout.

Required: gh CLI authenticated against the repo.
EOF
  exit 1
}

if [[ $# -lt 1 ]]; then
  usage
fi

mode="pr"
target=""
case "$1" in
  --run)
    [[ $# -lt 2 ]] && usage
    mode="run"
    target="$2"
    ;;
  --help|-h)
    usage
    ;;
  *)
    target="$1"
    ;;
esac

if [[ -z "$target" ]]; then
  usage
fi

# Resolve a run id. For a PR, take the most recent CI run on its head SHA.
if [[ "$mode" == "pr" ]]; then
  echo "[diagnose] Resolving most recent CI run for PR #$target..." >&2
  head_sha=$(gh pr view "$target" --json headRefOid --jq .headRefOid)
  if [[ -z "$head_sha" ]]; then
    echo "[diagnose] Could not resolve head SHA for PR #$target." >&2
    exit 2
  fi
  run_id=$(gh run list --commit "$head_sha" --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
  if [[ -z "$run_id" ]]; then
    echo "[diagnose] No ci.yml run found for SHA $head_sha." >&2
    exit 2
  fi
else
  run_id="$target"
fi

echo "[diagnose] Inspecting run $run_id" >&2

# List failed jobs.
mapfile -t failed_jobs < <(gh run view "$run_id" --json jobs --jq '.jobs[] | select(.conclusion == "failure") | "\(.databaseId)|\(.name)"')

if [[ ${#failed_jobs[@]} -eq 0 ]]; then
  echo "[diagnose] No failed jobs on run $run_id. Nothing to diagnose." >&2
  exit 0
fi

echo "[diagnose] ${#failed_jobs[@]} failed job(s):" >&2
for job in "${failed_jobs[@]}"; do
  echo "[diagnose]   - ${job#*|}" >&2
done

# List artifacts, filter to playwright-report-* (the convention in
# .github/workflows/ci.yml). Also include any artifact whose name
# contains 'playwright' as a defensive fallback.
mapfile -t artifacts < <(gh api "repos/{owner}/{repo}/actions/runs/$run_id/artifacts" --paginate --jq '.artifacts[] | select(.name | test("playwright"; "i")) | "\(.id)|\(.name)"')

if [[ ${#artifacts[@]} -eq 0 ]]; then
  echo "[diagnose] No playwright-* artifacts on this run. The failure is probably non-E2E." >&2
  echo "[diagnose] Falling back to raw failed-job log heads:" >&2
  echo "" >&2
  for job in "${failed_jobs[@]}"; do
    job_id="${job%%|*}"
    job_name="${job#*|}"
    echo "==================== $job_name (id $job_id) ====================" >&2
    gh run view --log-failed --job "$job_id" 2>&1 | grep -E '✘|FAIL|fail|Error' | grep -v WebServer | head -20 >&2 || true
    echo "" >&2
  done
  exit 0
fi

# Stage one tmp dir per script invocation; reuse across artifacts.
stage="$(mktemp -d -t diagnose-failed-run.XXXXXX)"
trap 'rm -rf "$stage"' EXIT

echo "[diagnose] Downloading ${#artifacts[@]} playwright artifact(s) to $stage" >&2

for entry in "${artifacts[@]}"; do
  art_id="${entry%%|*}"
  art_name="${entry#*|}"
  dest="$stage/$art_name"
  mkdir -p "$dest"
  if ! gh run download "$run_id" -D "$dest" -n "$art_name" >/dev/null 2>&1; then
    echo "[diagnose] Failed to download artifact $art_name (id $art_id), skipping." >&2
    continue
  fi
done

# Playwright stores error-context content as markdown files in
# <artifact>/data/<sha>.md (no human-friendly name). Find every .md in
# data/ and filter to those that look like error contexts (they start
# with "# Instructions" and contain "# Page snapshot").
mapfile -t snapshots < <(
  find "$stage" -path '*/data/*.md' -type f 2>/dev/null \
    | while read -r f; do
        if head -3 "$f" | grep -q '^# Instructions'; then
          echo "$f"
        fi
      done \
    | sort
)

if [[ ${#snapshots[@]} -eq 0 ]]; then
  echo "[diagnose] Artifacts downloaded but no error-context.md found inside." >&2
  echo "[diagnose] Files present in stage:" >&2
  find "$stage" -maxdepth 4 -type f 2>/dev/null | head -30 >&2
  exit 0
fi

echo "" >&2
echo "[diagnose] ${#snapshots[@]} error-context.md file(s) found. Dumping each:" >&2
echo "" >&2

for snap in "${snapshots[@]}"; do
  rel="${snap#$stage/}"
  echo "================================================================="
  echo "## $rel"
  echo "================================================================="
  cat "$snap"
  echo ""
done

echo "[diagnose] Done. ${#snapshots[@]} snapshot(s) printed above." >&2
echo "[diagnose] What to look for:" >&2
echo "[diagnose]   1. Does the page snapshot show the UI in an UNEXPECTED state?" >&2
echo "[diagnose]      → Real product bug, not a test flake. Fix product." >&2
echo "[diagnose]   2. Does the snapshot show the EXPECTED UI but a locator missed it?" >&2
echo "[diagnose]      → Real timing race. Test fix is appropriate." >&2
echo "[diagnose]   3. If you're already on iteration 3 of patching the test with no" >&2
echo "[diagnose]      progress, stop and walk up the data flow. Wrong layer." >&2
echo "[diagnose]   See docs/runbooks/e2e-flake-debug.md for the full playbook." >&2
