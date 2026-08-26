#!/bin/bash

# Miomock에서 sync가 잘 이루어지는지 검증하는 스크립트입니다.
# 먼저 모든 패키지가 빌드되어 있어야 합니다.

# miomock-api의 sonamu.lock 파일을 지우고 cli로 sync를 실행하여, 템플릿을 사용하여 파일들을 새로 만들도록 합니다.
rm examples/miomock/api/sonamu.lock && mise exec -- pnpm --filter miomock-api sonamu sync

# 만약 이 작업으로 인해 변경된 파일이 있다면, 이는 템플릿의 변경을 생성된 코드가 못 따라간 것이니 경고를 출력합니다.
CHANGED_FILES=$(git diff --name-only)
if [ -n "$CHANGED_FILES" ]; then
FILE_LIST=$(echo "$CHANGED_FILES" | sed 's/^/  - /' | paste -sd '\n' -)
echo "::warning::The following files in miomock-api were changed after sonamu sync:"$'\n'"$FILE_LIST"
fi
