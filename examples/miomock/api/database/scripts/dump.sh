#!/bin/bash
# miomock_test 로컬 DB 덤프 스크립트
# Usage: pnpm dump

set -e

DB_NAME="miomock_test"
DUMP_DIR="database/dumps"
DUMP_FILE="${DUMP_DIR}/miomock_test_latest.sql"

mkdir -p ${DUMP_DIR}

echo "📦 Dumping ${DB_NAME}..."

# Docker 컨테이너 이름 찾기 (여러 방법 시도)
CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -i postgres | head -n 1)

if [ -z "$CONTAINER_NAME" ]; then
  # postgres 이미지를 사용하는 컨테이너 찾기
  CONTAINER_NAME=$(docker ps --filter "ancestor=postgres:18" --format "{{.Names}}" | head -n 1)
fi

if [ -z "$CONTAINER_NAME" ]; then
  # 5432 포트를 사용하는 컨테이너 찾기
  CONTAINER_NAME=$(docker ps --format "{{.Names}}\t{{.Ports}}" | grep 5432 | cut -f1 | head -n 1)
fi

if [ -z "$CONTAINER_NAME" ]; then
  echo "❌ PostgreSQL 컨테이너를 찾을 수 없습니다."
  echo "💡 다음 명령어로 컨테이너를 확인하세요:"
  echo "   docker ps"
  echo ""
  echo "그리고 스크립트에서 CONTAINER_NAME을 직접 설정하세요:"
  echo "   CONTAINER_NAME=\"your-container-name\""
  exit 1
fi

echo "🐳 Using container: ${CONTAINER_NAME}"

# Docker 컨테이너 내부의 pg_dump 사용
docker exec ${CONTAINER_NAME} pg_dump \
  --username=postgres \
  --dbname=${DB_NAME} \
  --no-owner \
  --no-privileges \
  --no-comments \
  --inserts > ${DUMP_FILE}

if [ $? -eq 0 ]; then
  # 파일 크기 확인
  FILE_SIZE=$(du -h ${DUMP_FILE} | cut -f1)
  echo "✅ Updated: ${DUMP_FILE} (${FILE_SIZE})"
  echo "🎉 Dump completed!"
else
  echo "❌ Dump failed!"
  exit 1
fi
