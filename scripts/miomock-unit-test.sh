#!/bin/bash

# Miomock API의 유닛 테스트를 실행하는 스크립트입니다.
# Database를 띄우고, seed를 실행하고, fixture를 동기화하고, 테스트를 실행합니다.
# 로컬에서는 Docker를 사용하고, GitHub Actions에서는 로컬 MySQL 서버를 사용합니다.

set -e

# MySQL DB 준비 대기 함수
wait_for_mysql() {
  local MAX_ATTEMPTS=60
  local ATTEMPT=0
  
  echo "Waiting for MySQL to be ready..."
  while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    # 호스트의 MySQL 클라이언트로 연결 시도
    # root 사용자로 연결하여 miomock_test DB 존재 여부 확인
    if mysql -h 127.0.0.1 -P 3306 -u root -pmiomock123 -e "USE miomock_test; SELECT 1;" 2>/dev/null; then
      echo "MySQL is ready!"
      return 0
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
    sleep 1
  done
  
  echo "MySQL failed to become ready after ${MAX_ATTEMPTS} seconds"
  mysql -h 127.0.0.1 -P 3306 -u root -pmiomock123 -e "USE miomock_test; SELECT 1;" 2>&1 | grep -v "Warning"
  if [ -z "$CI" ]; then
    docker logs miomock-mysql --tail 20
  fi
  exit 1
}

# GitHub Actions 환경인지 확인
if [ -z "$CI" ]; then
  # 로컬 환경: Docker 사용
  (cd examples/miomock/api/database && docker compose up -d)
else
  # GitHub Actions 환경: 로컬 MySQL 서버 사용 (이미 설정됨)
  echo "Using local MySQL server in CI environment"
fi

wait_for_mysql

# 새로 만들어졌을 miomock, miomock_fixture_remote, miomock_test에 
# 마이그레이션을 적용하여 스키마를 최신으로 만들어줍니다.
# 이 작업은 fixture sync 전에 일어나야 합니다.
#
# 왜 이걸 가장 앞에 두었는가?!
# 테이블 없이 텅 빈 DB만 존재하는 상태가 영 달갑지 않아서 
# 가장 먼저 마이그레이션부터 하게 해 두었습니다. ㅎㅎ
pnpm --filter miomock-api sonamu migrate run

# miomock_fixture_remote에 덤프를 부어줍니다.
# 이 작업도 fixture sync 전에 일어나야 합니다.
pnpm --filter miomock-api seed

# miomock_fixture_remote에서 miomock_test로 데이터를 동기화합니다.
pnpm --filter miomock-api sonamu fixture sync

# 이제 테스트를 실행할 수 있습니다!
pnpm --filter miomock-api test
