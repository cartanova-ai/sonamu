#!/bin/bash
set -e

# 컨테이너가 시작되고 데이터베이스가 준비된 직후에 실행될 스크립트입니다.
# 이 스크립트는 데이터베이스를 생성하는 것 까지만 담당합니다.
# 이후 DDL 추가는 Sonamu UI의 DB Migration 기능을 사용해주세요.

BASE_NAME=$(echo "${PROJECT_NAME:-sonamu}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//')

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  -- 데이터베이스에서 vector 확장 설치 (기본접속 template1)
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE DATABASE ${BASE_NAME}_development;
  CREATE DATABASE ${BASE_NAME}_staging;
  CREATE DATABASE ${BASE_NAME}_production;
  CREATE DATABASE ${BASE_NAME}_fixture;
  CREATE DATABASE ${BASE_NAME}_test;
EOSQL
