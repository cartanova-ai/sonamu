#!/bin/bash

# Miomock API의 유닛 테스트를 실행하는 스크립트 (PostgreSQL 버전)입니다.
# Database를 띄우고, seed를 실행하고, fixture를 동기화하고, 테스트를 실행합니다.
# 로컬에서는 Docker의 PostgreSQL을 사용하고, CI 환경에서는 이미 기동된 PostgreSQL 인스턴스를 사용합니다.

set -e

# PostgreSQL DB 준비 대기 함수
wait_for_postgres() {
  # psql 명령어가 설치되어 있는지 확인
  if ! command -v psql &> /dev/null; then
    echo "Error: psql command not found. Please install PostgreSQL client tools."
    exit 1
  fi

  local MAX_ATTEMPTS=60
  local ATTEMPT=0

  echo "Waiting for PostgreSQL to be ready..."
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    # PGPASSWORD가 필요하다면 환경변수로 지정
    if PGPASSWORD=miomock123 psql -h 127.0.0.1 -p 5432 -U postgres -d miomock_test -c "SELECT 1;" &>/dev/null; then
      echo "PostgreSQL is ready!"
      return 0
    fi

    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done

  echo "PostgreSQL failed to become ready after ${MAX_ATTEMPTS} seconds"
  PGPASSWORD=miomock123 psql -h 127.0.0.1 -p 5432 -U postgres -d miomock_test -c "SELECT 1;" 2>&1 || true
  if [ -z "$CI" ]; then
    docker logs miomock-postgres --tail 20 || true
  fi
  exit 1
}

# GitHub Actions 환경인지 확인
if [ -z "$CI" ]; then
  # 로컬 환경: Docker 사용
  (cd examples/miomock/api/database && docker compose up -d)
else
  # GitHub Actions 환경: 로컬 PostgreSQL 서버 사용 (이미 설정됨)
  echo "Using local PostgreSQL server in CI environment"
fi

wait_for_postgres

# 새롭게 생성된 miomock, miomock_fixture_remote, miomock_test에 
# 마이그레이션을 적용합니다.
mise exec -- pnpm --filter miomock-api sonamu migrate run

# miomock_fixture_remote에 seed 데이터를 삽입합니다.
# 이 seed 동작에는 fixture sync가 포함됩니다.
mise exec -- pnpm --filter miomock-api seed

# 이제 테스트를 실행할 수 있습니다!
mise exec -- pnpm --filter miomock-api test
