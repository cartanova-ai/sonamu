#!/bin/bash

# Miomock API의 유닛 테스트를 실행하는 스크립트입니다.
# Database를 띄우고, seed를 실행하고, fixture를 동기화하고, 테스트를 실행합니다.
# Docker가 설치되어 있어야 하며, 모든 패키지가 빌드되어 있어야 합니다.

set -e

# MySQL DB 준비 대기 함수
wait_for_mysql() {
  local MAX_ATTEMPTS=60
  local ATTEMPT=0
  
  echo "Waiting for MySQL to be ready..."
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    # 호스트의 MySQL 클라이언트로 연결 시도 (포트 3306이 매핑되어 있음)
    # root 사용자로 연결하여 miomock_test DB 존재 여부 확인
    if mysql -h 127.0.0.1 -P 3306 -u root -pmiomock123 -e "USE miomock_test; SELECT 1;"; then
      echo "MySQL is ready!"
      return 0
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done
  
  echo "MySQL failed to become ready after ${MAX_ATTEMPTS} seconds"
  mysql -h 127.0.0.1 -P 3306 -u root -pmiomock123 -e "USE miomock_test; SELECT 1;" 2>&1
  docker logs miomock-mysql --tail 20
  exit 1
}

(cd examples/miomock/api/database && docker compose up -d)
wait_for_mysql

pnpm --filter miomock-api sonamu migrate run
pnpm --filter miomock-api seed
pnpm --filter miomock-api sonamu fixture sync
pnpm --filter miomock-api test
