#!/usr/bin/env bash
set -e

RESET=false
SMOKE=false
for arg in "$@"; do
  [[ "$arg" == "--reset" ]] && RESET=true
  [[ "$arg" == "--smoke" ]] && SMOKE=true
done

# Comprobar si PostgreSQL en localhost:5432 ya responde
DB_READY=false
if docker exec mercadoproductor_postgres_1 pg_isready -U mp_user -d marketplace &>/dev/null 2>&1; then
  DB_READY=true
  echo "✓ PostgreSQL ya está corriendo (mercadoproductor_postgres_1)"
fi

if [ "$DB_READY" = false ]; then
  echo "▶ Levantando base de datos..."
  docker-compose up -d db

  echo "⏳ Esperando a que PostgreSQL esté listo..."
  until docker-compose exec -T db pg_isready -U mp_user -d marketplace &>/dev/null; do
    sleep 1
  done
fi

if [ "$SMOKE" = true ]; then
  echo "▶ Preparando base smoke (marketplace_test)..."
  if ! docker exec mercadoproductor_postgres_1 psql -U mp_user -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'marketplace_test'" | grep -q 1; then
    docker exec mercadoproductor_postgres_1 psql -U mp_user -d postgres -c "CREATE DATABASE marketplace_test OWNER mp_user;"
  fi
  DB_NAME="marketplace_test"
  DB_URL="postgresql://mp_user:mp_pass@localhost:5432/marketplace_test"
  export DATABASE_URL="$DB_URL"
  export DATABASE_URL_TEST="$DB_URL"
  export AUTH_URL="http://localhost:3001"
  export NEXT_PUBLIC_APP_URL="http://localhost:3001"
  export PLAYWRIGHT_E2E="1"
  export PORT="3001"
else
  DB_NAME="marketplace"
  DB_URL="postgresql://mp_user:mp_pass@localhost:5432/marketplace"
fi

if [ "$RESET" = true ]; then
  echo "🔄 Reset de BD (migraciones + seed)..."
  npm run db:reset
else
  echo "▶ Aplicando migraciones pendientes..."
  node --env-file=.env --env-file-if-exists=.env.local ./node_modules/prisma/build/index.js migrate deploy

  echo "▶ Comprobando si la BD tiene datos..."
  HAS_DATA=$(docker exec mercadoproductor_postgres_1 psql -U mp_user -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM \"User\" LIMIT 1;" 2>/dev/null || echo "0")
  HAS_DATA=$(echo "$HAS_DATA" | tr -d '[:space:]')

  if [ "$HAS_DATA" = "0" ]; then
    echo "▶ BD vacía — ejecutando seed..."
    npm run db:seed
  else
    echo "✓ BD ya tiene datos — $HAS_DATA usuario(s) (usa --reset para reiniciar)"
  fi
fi

echo ""
if [ "$SMOKE" = true ]; then
  echo "✅ Todo listo. Arrancando Next.js en http://localhost:3001 (smoke)"
else
  echo "✅ Todo listo. Arrancando Next.js en http://localhost:3000"
fi
echo ""
echo "  Accesos de prueba:"
echo "    Admin:    admin@marketplace.com  /  admin1234"
echo "    Vendedor: productor@test.com     /  vendor1234"
echo "    Comprador: cliente@test.com      /  cliente1234"
echo ""
npm run dev
