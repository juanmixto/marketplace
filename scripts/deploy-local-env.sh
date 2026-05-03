#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy-local-env.sh <development|staging|production> [--allow-dirty]

Deploys one local Docker environment using the same compose file and the
environment-specific .env file:
  development -> .env.development, project marketplacedev
  staging     -> .env.staging,     project marketplacestg
  production  -> .env.production,  project marketplaceprod

By default the script refuses to deploy with uncommitted tracked changes.
Use --allow-dirty only for an explicit emergency hotfix.
EOF
}

env_name="${1:-}"
allow_dirty="false"

if [[ -z "$env_name" || "$env_name" == "-h" || "$env_name" == "--help" ]]; then
  usage
  exit 0
fi

shift || true
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) allow_dirty="true" ;;
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

if [[ "$TRUST_PROXY_HEADERS" != "true" ]]; then
  echo "TRUST_PROXY_HEADERS=true is required behind Cloudflare." >&2
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

"${compose[@]}" build app
"${compose[@]}" up -d db
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
for _ in {1..30}; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' "https://$APP_HOST/api/version" || true)"
  if [[ "$status" == "200" ]]; then
    echo "OK: $env_name is serving https://$APP_HOST"
    exit 0
  fi
  sleep 2
done

echo "Deploy finished, but healthcheck did not return 200." >&2
echo "Check: docker logs ${project}_app_1 and Cloudflare tunnel routes." >&2
exit 1
