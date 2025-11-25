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
DB_PORT="${MIOMOCK_DB_PORT:-3306}"
DB_USER="${MIOMOCK_DB_USER:-root}"
DB_PASSWORD="${MIOMOCK_DB_PASSWORD:-miomock123}"

# MySQL 패스워드 환경변수 설정 (warning 방지)
export MYSQL_PWD="${DB_PASSWORD}"

if [ ! -f "${DUMP_FILE}" ]; then
  echo "❌ Dump file not found: ${DUMP_FILE}"
  echo "💡 Run 'pnpm dump:fixture' first!"
  unset MYSQL_PWD
  exit 1
fi

echo "📥 Seeding ${FIXTURE_DB} from ${DUMP_FILE}..."
echo "🔗 Target: ${DB_USER}@${DB_HOST}:${DB_PORT}"

# 1. fixture DB 초기화
echo "🗑️  Recreating ${FIXTURE_DB}..."
mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  -e "DROP DATABASE IF EXISTS ${FIXTURE_DB}; CREATE DATABASE ${FIXTURE_DB};"

# 2. 덤프를 적용하면서 DB 이름 변환
echo "📝 Applying dump file to ${FIXTURE_DB}..."
sed "s/\`${SOURCE_DB}\`/\`${FIXTURE_DB}\`/g; s/USE \`${SOURCE_DB}\`/USE \`${FIXTURE_DB}\`/g" ${DUMP_FILE} | \
  mysql \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --user="${DB_USER}"

# 환경변수 정리
unset MYSQL_PWD

echo "✅ Dump applied to ${FIXTURE_DB}"
echo "🎉 Seed completed!"
echo ""
echo "💡 Next step: pnpm sonamu fixture sync"