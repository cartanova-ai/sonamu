#!/bin/bash
set -e

# 컨테이너가 시작되고 데이터베이스가 준비된 직후에 실행될 스크립트입니다.
# 이 스크립트는 데이터베이스를 생성하는 것 까지만 담당합니다.
# 이후 DDL 추가는 Sonamu UI의 DB Migration 기능을 사용해주세요.

BASE_NAME=$(echo "${PROJECT_NAME:-sonamu}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')

create_database() {
  local database_name="$1"
  psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    --set=database_name="$database_name" <<-'EOSQL'
  SELECT format('CREATE DATABASE %I', :'database_name')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'database_name')\gexec
EOSQL
}

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
  -- 데이터베이스에서 vector 확장 설치 (기본접속 template1)
  CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

create_database "${BASE_NAME}_development"
create_database "${BASE_NAME}_staging"
create_database "${BASE_NAME}_production"
create_database "${BASE_NAME}_test"
create_database "${BASE_NAME}_fixture"

if [ -n "${SONAMU_DB_NAME}" ]; then
  create_database "${SONAMU_DB_NAME}"
fi

if [ -n "${SONAMU_DB_FIXTURE_NAME}" ]; then
  create_database "${SONAMU_DB_FIXTURE_NAME}"
fi
