#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-local-env.sh <development|staging|production> [--allow-dirty] [--allow-unpublished]

Deploys one local Docker environment using the same compose file and the
environment-specific .env file:
  development -> .env.development, project marketplacedev
  staging     -> .env.staging,     project marketplacestg
  production  -> .env.production,  project marketplaceprod

By default the script refuses to deploy with uncommitted tracked changes.
Use --allow-dirty only for an explicit emergency hotfix.

Staging and production also require HEAD to match origin/main. Use
--allow-unpublished only during an explicit emergency hotfix, then open a PR for
the exact deployed diff immediately after the incident.
EOF
}

env_name="${1:-}"
allow_dirty="false"
allow_unpublished="false"

if [[ -z "$env_name" || "$env_name" == "-h" || "$env_name" == "--help" ]]; then
  usage
  exit 0
fi

shift || true
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) allow_dirty="true" ;;
    --allow-unpublished) allow_unpublished="true" ;;
    *)
      echo "Unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$env_name" in
  dev|development)
    env_name="development"
    env_file=".env.development"
    project="marketplacedev"
    ;;
  stg|stage|staging)
    env_name="staging"
    env_file=".env.staging"
    project="marketplacestg"
    ;;
  pro|prod|production)
    env_name="production"
    env_file=".env.production"
    project="marketplaceprod"
    ;;
  *)
    echo "Unknown environment: $env_name" >&2
    usage >&2
    exit 2
    ;;
esac

cd "$(git rev-parse --show-toplevel)"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file. Create it from the matching example before deploying." >&2
  exit 1
fi

if [[ "$allow_dirty" != "true" ]]; then
  if [[ -n "$(git status --short --untracked-files=no)" ]]; then
    echo "Refusing to deploy tracked dirty changes." >&2
    echo "Commit first, or rerun with --allow-dirty for an explicit emergency hotfix." >&2
    git status --short --untracked-files=no >&2
    exit 1
  fi
fi

if [[ "$env_name" != "development" && "$allow_unpublished" != "true" ]]; then
  if ! git remote get-url origin >/dev/null 2>&1; then
    echo "Refusing to deploy $env_name: git remote 'origin' is required." >&2
    exit 1
  fi

  git fetch --quiet origin main

  head_sha="$(git rev-parse HEAD)"
  origin_main_sha="$(git rev-parse origin/main)"

  if [[ "$head_sha" != "$origin_main_sha" ]]; then
    echo "Refusing to deploy $env_name from unpublished or non-current code." >&2
    echo "  HEAD:        $(git rev-parse --short HEAD)" >&2
    echo "  origin/main: $(git rev-parse --short origin/main)" >&2
    echo "" >&2
    echo "Merge the change into main first, then deploy from origin/main." >&2
    echo "Emergency only: rerun with --allow-unpublished and commit/PR the exact diff afterwards." >&2
    exit 1
  fi
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

required_vars=(
  APP_HOST
  AUTH_URL
  NEXT_PUBLIC_APP_URL
  APP_ENV
  NEXT_PUBLIC_APP_ENV
  AUTH_SECRET
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_DB
  TRUST_PROXY_HEADERS
  PAYMENT_PROVIDER
  CLOUDFLARE_TUNNEL_TOKEN
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required env var in $env_file: $var_name" >&2
    exit 1
  fi
done

if [[ "$AUTH_URL" != "https://$APP_HOST" || "$NEXT_PUBLIC_APP_URL" != "https://$APP_HOST" ]]; then
  echo "AUTH_URL and NEXT_PUBLIC_APP_URL must both be https://\$APP_HOST." >&2
  exit 1
fi

# #1185: `cloudflare` is the new recommended value (trusts ONLY
# cf-connecting-ip, ignores spoofable XFF). `true` is the legacy
# binary trust mode, kept for non-CF deployments. Anything else is
# rejected — the env-validator in src/lib/env.ts:268 demands one of
# the two in production, so the deploy fails-fast here instead of
# letting the app boot and throw on first request.
if [[ "$TRUST_PROXY_HEADERS" != "cloudflare" && "$TRUST_PROXY_HEADERS" != "true" ]]; then
  echo "TRUST_PROXY_HEADERS must be 'cloudflare' (recommended for CF→Traefik) or 'true' (legacy)." >&2
  exit 1
fi

case "$env_name" in
  production)
    if [[ "$APP_ENV" != "production" || "$NEXT_PUBLIC_APP_ENV" != "production" ]]; then
      echo "Production deploy requires APP_ENV=production and NEXT_PUBLIC_APP_ENV=production." >&2
      exit 1
    fi
    if [[ "$APP_HOST" != "raizdirecta.es" ]]; then
      echo "Production deploy currently expects APP_HOST=raizdirecta.es." >&2
      exit 1
    fi
    if [[ -z "${NEXT_PUBLIC_POSTHOG_KEY:-}" ]]; then
      echo "Production deploy requires NEXT_PUBLIC_POSTHOG_KEY in $env_file (analytics is silently dead without it; src/lib/posthog.ts skips init when the key is empty)." >&2
      exit 1
    fi
    ;;
  staging)
    if [[ "$APP_ENV" != "staging" || "$NEXT_PUBLIC_APP_ENV" != "staging" ]]; then
      echo "Staging deploy requires APP_ENV=staging and NEXT_PUBLIC_APP_ENV=staging." >&2
      exit 1
    fi
    ;;
  development)
    if [[ "$APP_ENV" != "development" || "$NEXT_PUBLIC_APP_ENV" != "development" ]]; then
      echo "Development deploy requires APP_ENV=development and NEXT_PUBLIC_APP_ENV=development." >&2
      exit 1
    fi
    ;;
esac

export ENV_FILE="$env_file"
export TRAEFIK_ROUTER_NAME="${project}-app"
export TRAEFIK_SERVICE_NAME="${project}-app"
export TRAEFIK_HEADERS_NAME="${project}-headers"

compose=(docker-compose -p "$project" -f docker-compose.prod.yml)

# Inject build-time identity for BuildBadge + /api/version. Without this,
# Next.js inlines the NEXT_PUBLIC_* vars as undefined at build time and the
# floating badge shows "unknown / unknown". See PR #1135.
export NEXT_PUBLIC_COMMIT_SHA="$(git rev-parse --short HEAD)"
export NEXT_PUBLIC_GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
export NEXT_PUBLIC_BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "Deploying $env_name"
echo "  project: $project"
echo "  env:     $env_file"
echo "  host:    $APP_HOST"
echo "  build:   $NEXT_PUBLIC_COMMIT_SHA on $NEXT_PUBLIC_GIT_BRANCH ($NEXT_PUBLIC_BUILD_TIME)"

# Pre-flight env validation. Loads the same Zod schema (parseServerEnv)
# the running server enforces at boot. Catches the 2026-05-04 class of
# regression: a guard added to src/lib/env.ts (e.g. CRON_SECRET required
# in APP_ENV=production) is mergeable to main without anyone exercising
# it against the prod env file. Without this check, the first deploy
# after such a guard lands sees a green build but a crash-loop on
# container start. With this check, deploy aborts in <2 seconds.
echo "Running pre-flight env validation..."
npx --no-install tsx "$(git rev-parse --show-toplevel)/scripts/preflight-env.ts" "$env_name"

"${compose[@]}" build app
"${compose[@]}" up -d db

# Migration safety pre-flight (production + staging only). Aborts if any
# pending migration contains a destructive statement (DROP TABLE/COLUMN,
# TRUNCATE, ALTER COLUMN ... DROP) without explicit MIGRATION_DESTRUCTIVE_OK=1.
# See issue #1255. Bypass is env-var, not a CLI flag, to make accidental
# bypass harder.
if [[ "$env_name" == "production" || "$env_name" == "staging" ]]; then
  echo "Migration safety pre-flight..."
  status_output="$("${compose[@]}" run --rm app npx prisma migrate status 2>&1 || true)"
  pending_names="$(printf '%s\n' "$status_output" \
    | awk '/have not yet been applied/{flag=1;next} /^$/{flag=0} flag {print $1}' \
    | grep -E '^[0-9]{14}_' || true)"
  if [[ -n "$pending_names" ]]; then
    echo "  Pending migrations:"
    printf '    - %s\n' $pending_names
    destructive=""
    while IFS= read -r name; do
      [[ -z "$name" ]] && continue
      sql_file="prisma/migrations/$name/migration.sql"
      if [[ -f "$sql_file" ]]; then
        if grep -iE 'DROP[[:space:]]+TABLE|DROP[[:space:]]+COLUMN|^[[:space:]]*TRUNCATE|ALTER[[:space:]]+COLUMN[[:space:]]+[^;]+[[:space:]]+DROP' "$sql_file" > /dev/null; then
          destructive+="$name "
        fi
      fi
    done <<< "$pending_names"
    if [[ -n "$destructive" && "${MIGRATION_DESTRUCTIVE_OK:-}" != "1" ]]; then
      echo ""
      echo "Destructive migration(s) detected:" >&2
      printf '  - %s\n' $destructive >&2
      echo "" >&2
      echo "Set MIGRATION_DESTRUCTIVE_OK=1 to override (and document why in the PR)." >&2
      exit 1
    fi
    if [[ -n "$destructive" ]]; then
      echo "  Destructive migrations approved via MIGRATION_DESTRUCTIVE_OK=1: $destructive"
    fi
  else
    echo "  No pending migrations."
  fi
fi

"${compose[@]}" run --rm app npx prisma migrate deploy

# docker-compose v1 can fail with KeyError: ContainerConfig while recreating
# containers built by newer Docker engines. Remove only the app container(s);
# the database volume and Cloudflare tunnel state are untouched.
mapfile -t old_runtime_containers < <(docker ps -aq \
  --filter "label=com.docker.compose.project=$project" \
  --filter "label=com.docker.compose.service=app")
mapfile -t old_tunnels < <(docker ps -aq \
  --filter "label=com.docker.compose.project=$project" \
  --filter "label=com.docker.compose.service=cloudflared")
old_runtime_containers+=("${old_tunnels[@]}")
if (( ${#old_runtime_containers[@]} > 0 )); then
  docker rm -f "${old_runtime_containers[@]}" >/dev/null
fi

"${compose[@]}" up -d --no-build app cloudflared

echo "Waiting for https://$APP_HOST/api/version ..."
healthcheck_ok="false"
for _ in {1..30}; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$APP_HOST/api/version" || true)"
  if [[ "$status" == "200" ]]; then
    echo "OK: $env_name is serving https://$APP_HOST"
    healthcheck_ok="true"
    break
  fi
  sleep 2
done

if [[ "$healthcheck_ok" != "true" ]]; then
  echo "Deploy finished, but healthcheck did not return 200." >&2
  echo "Check: docker logs ${project}_app_1 and Cloudflare tunnel routes." >&2
  exit 1
fi

# Post-deploy smoke (production + staging only). Headless Chromium against
# the live URL; asserts client hydration, PostHog SDK loaded, no CSP
# script-src violations in console, no 5xx during page load. Catches the
# class of regression the 2026-05-04 incident exposed (CSP nonce break,
# SW stale-chunk cache, missing NEXT_PUBLIC_*) — /api/version returns 200
# but the page is dead in the browser.
#
# Currently in --warn-only mode while the underlying RSC/hydration
# regression on prod is being investigated. Strip the flag once
# window.__NEXT_DATA__ is reliably present so future regressions block
# the deploy as intended.
if [[ "$env_name" == "production" || "$env_name" == "staging" ]]; then
  echo "Running post-deploy smoke against https://$APP_HOST ..."
  npx --no-install tsx \
    "$(git rev-parse --show-toplevel)/scripts/smoke-deploy.ts" \
    "https://$APP_HOST" --warn-only || true
fi

# Release tag (production + staging only). Marks the SHA that just passed
# /api/version so rollback can target a known-good point. See issue #1251.
# Tag is created and pushed only when the healthcheck succeeds — failed
# deploys leave no tag.
if [[ "$env_name" == "production" || "$env_name" == "staging" ]]; then
  tag_prefix="prod"
  [[ "$env_name" == "staging" ]] && tag_prefix="stg"
  release_tag="${tag_prefix}-$(date -u +%Y%m%dT%H%M%SZ)-${NEXT_PUBLIC_COMMIT_SHA}"
  if git tag "$release_tag" 2>/dev/null; then
    echo "Tagged release: $release_tag"
    if git push origin "$release_tag" 2>/dev/null; then
      echo "Pushed tag to origin."
    else
      echo "WARN: tag created locally but push to origin failed (no network?)." >&2
      echo "      Run 'git push origin $release_tag' when connectivity is back." >&2
    fi
  else
    echo "WARN: failed to create tag $release_tag (already exists?)." >&2
  fi
fi

exit 0
