#!/usr/bin/env bash
# Wrapper around `docker compose -f docker-compose.prod.yml build app`.
# Exports the three NEXT_PUBLIC_* identity vars BuildBadge + /api/version need.
# Without it those vars default to "unknown" because Next.js inlines
# NEXT_PUBLIC_* at build time and nothing else in the deploy path sets them.
set -euo pipefail

cd "$(dirname "$0")/.."

export NEXT_PUBLIC_COMMIT_SHA="$(git rev-parse --short HEAD)"
export NEXT_PUBLIC_GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
export NEXT_PUBLIC_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Building app image with:"
echo "  NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA"
echo "  NEXT_PUBLIC_GIT_BRANCH=$NEXT_PUBLIC_GIT_BRANCH"
echo "  NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME"

exec docker compose -f docker-compose.prod.yml build "$@" app
