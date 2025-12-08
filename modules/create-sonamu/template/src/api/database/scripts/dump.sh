#!/bin/bash
# 테스트 DB 덤프 스크립트
# Usage: pnpm dump

source .env

set -e

DB_NAME="${DATABASE_NAME}_test"
DUMP_DIR="database/dumps"
DUMP_FILE="${DUMP_DIR}/${DATABASE_NAME}_test_latest.sql"

mkdir -p ${DUMP_DIR}

echo "📦 Dumping ${DB_NAME}..."

# Docker 컨테이너 이름 찾기 (여러 방법 시도)
if [ -n "$CONTAINER_NAME" ]; then
  # .env에서 CONTAINER_NAME이 설정된 경우 사용
  echo "🐳 Using container from .env: ${CONTAINER_NAME}"
else
  # 자동 탐지
  CONTAINER_NAME=$(docker ps --format "{{.Names}}" | grep -i postgres | head -n 1)

  if [ -z "$CONTAINER_NAME" ]; then
    CONTAINER_NAME=$(docker ps --filter "ancestor=postgres:18" --format "{{.Names}}" | head -n 1)
  fi

  if [ -z "$CONTAINER_NAME" ]; then
    CONTAINER_NAME=$(docker ps --format "{{.Names}}\t{{.Ports}}" | grep 5432 | cut -f1 | head -n 1)
  fi
fi

if [ -z "$CONTAINER_NAME" ]; then
  echo "❌ PostgreSQL 컨테이너를 찾을 수 없습니다."
  echo "💡 다음 명령어로 컨테이너를 확인하세요:"
  echo "   docker ps"
  echo ""
  echo ".env 파일에 CONTAINER_NAME을 설정하세요."
  exit 1
fi

echo "🐳 Using container: ${CONTAINER_NAME}"

# Docker 컨테이너 내부의 pg_dump 사용
docker exec ${CONTAINER_NAME} pg_dump \
  --username=${DB_USER:-postgres} \
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
