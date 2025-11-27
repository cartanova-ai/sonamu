#!/bin/bash

# Miomock이 제대로 실행되는지 검증하는 스크립트입니다.
# 테스트 대상은 miomock-api와 miomock-web입니다.
# 각각을 dev와 start(preview)로 띄워서 프로세스가 잘 살아있는지 확인합니다.
# miomock-api는 /api/user/getMyIP 엔드포인트를 호출하여 응답이 잘 오는지도 봅니다.
# 먼저 모든 패키지가 빌드되어 있어야 합니다.

set -e
set +m

# 포트를 사용하는 프로세스 종료 함수
kill_port() {
  local PORT=$1
  lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
}

echo "Testing miomock-api (start)..."
(cd examples/miomock/api && pnpm start > /tmp/miomock-api-start.log 2>&1 &)
sleep 3
curl -sf http://localhost:10280/api/user/getMyIP > /dev/null || (cat /tmp/miomock-api-start.log && exit 1)
kill_port 10280

echo "Testing miomock-api (dev)..."
(cd examples/miomock/api && pnpm dev > /tmp/miomock-api-dev.log 2>&1 &)
sleep 3
curl -sf http://localhost:10280/api/user/getMyIP > /dev/null || (cat /tmp/miomock-api-dev.log && exit 1)
kill_port 10280

echo "Testing miomock-web (preview)..."
(cd examples/miomock/web && pnpm preview > /tmp/miomock-web-preview.log 2>&1 &)
sleep 3
curl -sf http://localhost:4173 > /dev/null || (cat /tmp/miomock-web-preview.log && exit 1)
kill_port 4173

echo "Testing miomock-web (dev)..."
(cd examples/miomock/web && pnpm dev > /tmp/miomock-web-dev.log 2>&1 &)
sleep 3
curl -sf http://localhost:10281 > /dev/null || (cat /tmp/miomock-web-dev.log && exit 1)
kill_port 10281

echo "All tests passed!"
