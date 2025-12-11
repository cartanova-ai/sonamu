#!/bin/bash
# fixture DB에 덤프 적용하는 스크립트
# Usage: pnpm seed

# 환경변수
source .env

set -e # 에러 발생 시 즉시 중단

SOURCE_DB="miomock_test"
FIXTURE_DB="miomock_fixture_remote"
DUMP_FILE="database/dumps/miomock_test_latest.sql"

# sonamu.config.ts의 DB 설정 사용
DB_HOST="${MIOMOCK_DB_HOST:-0.0.0.0}"
DB_PORT="${MIOMOCK_DB_PORT:-5432}"
DB_USER="${MIOMOCK_DB_USER:-postgres}"
DB_PASSWORD="${MIOMOCK_DB_PASSWORD:-miomock123}"

# PostgreSQL 패스워드 환경변수 설정
export PGPASSWORD="${DB_PASSWORD}"

if [ ! -f "${DUMP_FILE}" ]; then
  echo "❌ Dump file not found: ${DUMP_FILE}"
  echo "💡 Run 'pnpm dump:fixture' first!"
  unset PGPASSWORD
  exit 1
fi

echo "📥 Seeding ${FIXTURE_DB} from ${DUMP_FILE}..."
echo "🔗 Target: ${DB_USER}@${DB_HOST}:${DB_PORT}"

# 1. fixture DB 초기화
echo "🗑️  Recreating ${FIXTURE_DB}..."
psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d postgres \
  -c "SELECT pg_terminate_backend(pg_stat_activity.pid)
  FROM pg_stat_activity
  WHERE datname = '${FIXTURE_DB}'
    AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"${FIXTURE_DB}\";" \
  -c "CREATE DATABASE \"${FIXTURE_DB}\";"

# 2. 덤프를 적용하면서 DB 이름 변환 (PostgreSQL은 덤프에 DB 이름 없어서 seed 불필요)
echo "📝 Applying dump file to ${FIXTURE_DB}..."
psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${FIXTURE_DB}" \
  -f "${DUMP_FILE}"

# 환경변수 정리
unset PGPASSWORD

echo "✅ Dump applied to ${FIXTURE_DB}"
echo "🎉 Seed completed!"
echo ""
echo "💡 Next step: pnpm sonamu fixture sync"