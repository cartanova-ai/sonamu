#!/bin/bash

# Runs the miomock search tests. PostgreSQL comes from docker compose locally and from the CI service in CI;
# the tests start OpenSearch themselves (MIOMOCK_OPENSEARCH_IMAGE overrides the image).

set -e

wait_for_postgres() {
  if ! command -v psql &>/dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client tools."
    exit 1
  fi

  local MAX_ATTEMPTS=60
  local ATTEMPT=0

  echo "Waiting for PostgreSQL to be ready..."
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if PGPASSWORD=miomock123 psql -h 127.0.0.1 -p 5432 -U postgres -d miomock_test -c "SELECT 1;" &>/dev/null; then
      echo "PostgreSQL is ready!"
      return 0
    fi

    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done

  echo "PostgreSQL failed to become ready after ${MAX_ATTEMPTS} seconds"
  PGPASSWORD=miomock123 psql -h 127.0.0.1 -p 5432 -U postgres -d miomock_test -c "SELECT 1;" 2>&1 || true
  exit 1
}

if [ -z "$CI" ]; then
  (cd examples/miomock/api/database && docker compose up -d)
else
  echo "Using local PostgreSQL server in CI environment"
fi

wait_for_postgres

# The tests clone miomock_test, so migrate it first (this installs the search schema).
mise exec -- pnpm --filter miomock-api sonamu migrate run --execute --confirm

# 복제 원본인 miomock_test의 테이블과 데이터는 seed의 fixture sync가 채웁니다.
# 이전에는 같은 job의 miomock unit test가 먼저 seed를 해 둬서 드러나지 않던 의존성입니다.
mise exec -- pnpm --filter miomock-api seed

mise exec -- pnpm --filter miomock-api test:search
