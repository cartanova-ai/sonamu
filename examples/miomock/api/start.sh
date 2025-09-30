#!/bin/bash

# miomock API 서버 시작 스크립트
# Docker 데이터베이스와 API 서버를 함께 시작합니다.

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 현재 디렉토리 확인
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_ROOT="${SCRIPT_DIR}"
DATABASE_DIR="${API_ROOT}/database"

echo -e "${BLUE}🌲 Miomock API 서버를 시작합니다...${NC}"
echo -e "${YELLOW}📁 API 루트: ${API_ROOT}${NC}"

# 1. Docker 상태 확인
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

# 2. Yarn Berry PnP 상태 확인
echo -e "\n${BLUE}📦 Yarn Berry PnP 상태 확인 중...${NC}"
cd "${API_ROOT}"
if [ -f ".pnp.cjs" ]; then
    echo -e "${GREEN}✅ PnP 파일이 존재합니다. (Zero Install 준비됨)${NC}"
else
    echo -e "${YELLOW}⚠️  PnP 파일이 없습니다. yarn install을 실행합니다...${NC}"
    yarn install
fi

# 3. sonamu 모듈 portal 연결 상태 확인
echo -e "\n${BLUE}🔗 Sonamu 모듈 연결 상태 확인 중...${NC}"
if yarn list sonamu 2>/dev/null | grep -q "portal:"; then
    echo -e "${GREEN}✅ sonamu 모듈이 portal로 연결되어 있습니다.${NC}"
else
    echo -e "${YELLOW}⚠️  sonamu 모듈 연결에 문제가 있을 수 있습니다.${NC}"
    echo -e "${YELLOW}필요시 yarn install을 수동으로 실행해주세요.${NC}"
fi

# 4. API 서버 시작
echo -e "\n${BLUE}🔧 API 서버 시작 중... (포트: 19000)${NC}"
echo -e "${GREEN}🎉 서버가 시작되었습니다!${NC}"
echo -e "${YELLOW}API 서버: http://localhost:19000${NC}"
echo -e "${YELLOW}MySQL DB: localhost:33061${NC}"
echo -e "${YELLOW}  - Database: miomock${NC}"
echo -e "${YELLOW}  - User: root${NC}"
echo -e "${YELLOW}  - Password: miomock123${NC}"
echo -e "\n${BLUE}종료하려면 Ctrl+C를 누르세요.${NC}"

# 종료 시그널 처리
cleanup() {
    echo -e "\n${YELLOW}⏹️  API 서버를 종료합니다...${NC}"
    echo -e "${BLUE}Docker 컨테이너는 계속 실행됩니다.${NC}"
    echo -e "${BLUE}Docker 중지: cd database && docker compose down${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# API 서버 실행
yarn sonamu dev:serve
