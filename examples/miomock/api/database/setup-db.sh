#!/bin/bash

# Miomock 데이터베이스 설정 스크립트
# Docker 데이터베이스 컨테이너를 시작합니다.

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="${SCRIPT_DIR}"

echo -e "${BLUE}🌲 Miomock 데이터베이스를 설정합니다...${NC}"
echo -e "${YELLOW}📁 데이터베이스 루트: ${DATABASE_DIR}${NC}"

# Docker 상태 확인
echo -e "\n${BLUE}🐳 Docker 컨테이너 상태 확인 중...${NC}"
if docker ps --format "table {{.Names}}" | grep -q "miomock-mysql"; then
    echo -e "${GREEN}✅ miomock-mysql 컨테이너가 이미 실행 중입니다.${NC}"
else
    echo -e "${YELLOW}⚠️  miomock-mysql 컨테이너가 실행되지 않았습니다.${NC}"

    # Docker Compose로 데이터베이스 시작
    echo -e "\n${BLUE}🚀 MySQL 데이터베이스 컨테이너 시작 중...${NC}"
    cd "${DATABASE_DIR}"
    docker compose up -d

    # 데이터베이스 준비 대기
    echo -e "\n${YELLOW}⏳ 데이터베이스 준비 대기 중... (최대 30초)${NC}"
    for i in {1..30}; do
        if docker exec miomock-mysql mysqladmin ping -h localhost -u root -pmiomock123 --silent; then
            echo -e "${GREEN}✅ 데이터베이스가 준비되었습니다!${NC}"
            break
        fi
        echo -e "${YELLOW}   대기 중... (${i}/30)${NC}"
        sleep 1
    done

    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ 데이터베이스 연결 시간 초과입니다.${NC}"
        echo -e "${YELLOW}수동으로 확인해주세요: docker logs miomock-mysql${NC}"
        exit 1
    fi
fi

echo -e "\n${GREEN}✅ 데이터베이스 설정이 완료되었습니다!${NC}"
