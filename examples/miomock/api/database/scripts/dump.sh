#!/bin/bash
# miomock_test 로컬 DB 덤프 스크립트
# Usage: pnpm dump

set -e

DB_NAME="miomock_test"
DUMP_DIR="database/dumps"
DATE=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="${DUMP_DIR}/miomock_test_${DATE}.sql"
LATEST_FILE="${DUMP_DIR}/miomock_test_latest.sql"

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
echo "✅ Dump created: ${DUMP_FILE} (${FILE_SIZE})"  # 한 번만 출력

# latest 복사
cp ${DUMP_FILE} ${LATEST_FILE}
echo "✅ Updated: ${LATEST_FILE}"

# 최근 10개 덤프만 유지 (latest.sql 제외)
DUMP_COUNT=$(ls -1 ${DUMP_DIR}/miomock_test_2*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ "${DUMP_COUNT}" -gt 10 ]; then
  echo "🧹 Cleaning old dumps..."
  ls -t ${DUMP_DIR}/miomock_test_2*.sql | tail -n +11 | xargs -r rm -f
fi

echo "🎉 Dump completed!"