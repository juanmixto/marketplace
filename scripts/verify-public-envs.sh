#!/usr/bin/env bash
set -Eeuo pipefail

expected_sha="${1:-}"

cd "$(git rev-parse --show-toplevel)"

if [[ -z "$expected_sha" ]]; then
  git fetch --quiet origin main
  expected_sha="$(git rev-parse --short origin/main)"
fi

declare -A hosts=(
  [development]="dev.raizdirecta.es"
  [staging]="staging.raizdirecta.es"
  [production]="raizdirecta.es"
)

failures=0

check_status() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status

  status="$(curl -sS -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ "$status" == "$expected" ]]; then
    printf 'OK   %-12s %s -> %s\n' "$label" "$url" "$status"
  else
    printf 'FAIL %-12s %s -> %s, expected %s\n' "$label" "$url" "$status" "$expected" >&2
    failures=$((failures + 1))
  fi
}

check_version() {
  local env_name="$1"
  local host="$2"
  local json
  local sha

  json="$(curl -fsS "https://$host/api/version" || true)"
  sha="$(printf '%s' "$json" | node -e "let data=''; process.stdin.on('data', c => data += c); process.stdin.on('end', () => { try { console.log(JSON.parse(data).sha || '') } catch { console.log('') } })")"

  if [[ "$sha" == "$expected_sha" ]]; then
    printf 'OK   %-12s https://%s/api/version -> %s\n' "$env_name" "$host" "$sha"
  else
    printf 'FAIL %-12s https://%s/api/version -> %s, expected %s\n' "$env_name" "$host" "${sha:-<empty>}" "$expected_sha" >&2
    failures=$((failures + 1))
  fi
}

check_robots_header() {
  local env_name="$1"
  local host="$2"
  local header

  header="$(curl -sSI "https://$host/" | tr -d '\r' | awk 'tolower($0) ~ /^x-robots-tag:/ { print tolower($0) }')"

  case "$env_name" in
    development|staging)
      if [[ "$header" == "x-robots-tag: noindex, nofollow, noarchive" ]]; then
        printf 'OK   %-12s X-Robots-Tag noindex present\n' "$env_name"
      else
        printf 'FAIL %-12s missing non-production X-Robots-Tag, got: %s\n' "$env_name" "${header:-<empty>}" >&2
        failures=$((failures + 1))
      fi
      ;;
    production)
      if [[ -z "$header" ]]; then
        printf 'OK   %-12s production has no X-Robots-Tag noindex\n' "$env_name"
      else
        printf 'FAIL %-12s production should be indexable, got: %s\n' "$env_name" "$header" >&2
        failures=$((failures + 1))
      fi
      ;;
  esac
}

for env_name in development staging production; do
  host="${hosts[$env_name]}"
  check_version "$env_name" "$host"
  check_status "$env_name" "https://$host/productores" 200
  check_status "$env_name" "https://$host/productos" 200
  check_robots_header "$env_name" "$host"
done

if (( failures > 0 )); then
  printf '\n%s verification check(s) failed.\n' "$failures" >&2
  exit 1
fi

printf '\nAll public environment checks passed for %s.\n' "$expected_sha"
