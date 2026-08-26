#!/bin/bash

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
    if PGPASSWORD=miomock123 psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "SELECT 1;" &>/dev/null; then
      echo "PostgreSQL is ready!"
      return 0
    fi

    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done

  echo "PostgreSQL failed to become ready after ${MAX_ATTEMPTS} seconds"
  PGPASSWORD=miomock123 psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -c "SELECT 1;" 2>&1 || true
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

# 모든 마이그레이션은 테스트 전에 pretest 스크립트를 통해 실행됩니다.
mise exec -- pnpm --filter @sonamu-kit/tasks test
