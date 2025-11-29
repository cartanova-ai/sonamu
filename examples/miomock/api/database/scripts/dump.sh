#!/bin/bash
# miomock_test 로컬 DB 덤프 스크립트
# Usage: pnpm dump

set -e

DB_NAME="miomock_test"
DUMP_DIR="database/dumps"
DUMP_FILE="${DUMP_DIR}/miomock_test_latest.sql"

# 환경변수로 패스워드 설정 (warning 방지)
export MYSQL_PWD='miomock123'

mkdir -p ${DUMP_DIR}

echo "📦 Dumping ${DB_NAME}..."

# mysqldump 실행
mysqldump \
  --protocol=TCP \
  --host=0.0.0.0 \
  --port=3306 \
  --user=root \
  --databases ${DB_NAME} \
  --single-transaction \
  --skip-add-drop-table \
  --skip-comments \
  --complete-insert \
  --result-file=${DUMP_FILE}

# 환경변수 정리
unset MYSQL_PWD

# 파일 크기 확인
FILE_SIZE=$(du -h ${DUMP_FILE} | cut -f1)

echo "✅ Updated: ${DUMP_FILE} (${FILE_SIZE})"
echo "🎉 Dump completed!"