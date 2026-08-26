#!/bin/bash

# Miomock이 제대로 실행되는지 검증하는 스크립트입니다.
# 테스트 대상은 miomock-api입니다. (miomock-web은 이제 api와 통합되므로 제외함)
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

# 프로세스 생존 확인 및 HTTP 응답 대기
# 최대 10초(50회 × 0.2초) 동안 반복합니다:
# - 프로세스가 죽었을 경우 즉시 실패합니다
# - HTTP 응답이 2xx일 경우 즉시 성공합니다
# - 프로세스가 살아있는 동안 계속 확인하므로 부트업 시간이 길어도 문제없습니다
wait_for_http() {
  local PID=$1
  local URL=$2
  local LOG_FILE=$3
  
  for i in {1..50}; do
    # 프로세스가 죽었으면 실패
    if ! kill -0 $PID 2>/dev/null; then
      echo "Process terminated unexpectedly"
      cat $LOG_FILE
      exit 1
    fi
    
    # HTTP 응답 확인 (2xx만 성공)
    HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" $URL 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
      return 0
    fi
    
    sleep 0.2
  done
  
  # 10초 내에 응답이 안 왔거나 non-2xx 응답
  echo "HTTP request failed or non-2xx response (code: $HTTP_CODE)"
  cat $LOG_FILE
  exit 1
}

echo "Testing miomock-api (start)..."
cd examples/miomock/api && mise exec -- pnpm start > /tmp/miomock-api-start.log 2>&1 & PID=$!
wait_for_http $PID http://localhost:10280/api/user/getMyIP /tmp/miomock-api-start.log
kill_port 10280

echo "Testing miomock-api (dev)..."
cd examples/miomock/api && mise exec -- pnpm dev > /tmp/miomock-api-dev.log 2>&1 & PID=$!
wait_for_http $PID http://localhost:10280/api/user/getMyIP /tmp/miomock-api-dev.log
kill_port 10280

echo "All tests passed!"
