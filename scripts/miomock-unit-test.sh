#!/bin/bash

# Miomock API의 유닛 테스트를 실행하는 스크립트입니다.
# Database를 띄우고, seed를 실행하고, fixture를 동기화하고, 테스트를 실행합니다.
# Docker가 설치되어 있어야 하며, 모든 패키지가 빌드되어 있어야 합니다.

(cd examples/miomock/api/database && docker compose up -d)

pnpm --filter miomock-api seed
pnpm --filter miomock-api sonamu fixture sync
pnpm --filter miomock-api test
