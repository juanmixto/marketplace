#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/staging-seed.sh [--reset-demo]

Seeds the Docker-managed staging database using .env.staging and the
marketplacestg Compose project.

Options:
  --reset-demo   Remove known demo rows before reseeding them.

This script refuses to run unless APP_ENV=staging. It is intentionally scoped
to staging so production can never receive demo data by accident.
EOF
}

reset_demo="false"

for arg in "$@"; do
  case "$arg" in
    --reset-demo) reset_demo="true" ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

if [[ ! -f ".env.staging" ]]; then
  echo "Missing .env.staging. Create it before seeding staging." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. ".env.staging"
set +a

if [[ "${APP_ENV:-}" != "staging" || "${NEXT_PUBLIC_APP_ENV:-}" != "staging" ]]; then
  echo "Refusing to seed: .env.staging must set APP_ENV=staging and NEXT_PUBLIC_APP_ENV=staging." >&2
  exit 1
fi

if [[ "${APP_HOST:-}" != "staging.raizdirecta.es" ]]; then
  echo "Refusing to seed: APP_HOST must be staging.raizdirecta.es." >&2
  exit 1
fi

export ENV_FILE=".env.staging"
export TRAEFIK_ROUTER_NAME="marketplacestg-app"
export TRAEFIK_SERVICE_NAME="marketplacestg-app"
export TRAEFIK_HEADERS_NAME="marketplacestg-headers"

compose=(docker-compose -p marketplacestg -f docker-compose.prod.yml)

"${compose[@]}" up -d db

if [[ "$reset_demo" == "true" ]]; then
  "${compose[@]}" run --rm -v "$PWD:/workspace" -w /workspace app node --import tsx scripts/clear-demo-data.ts
fi

"${compose[@]}" run --rm -v "$PWD:/workspace" -w /workspace app node --import tsx prisma/seed.ts
