# Miomock API

- Sonamu 프레임워크를 사용한 테스트용 API 서버입니다.
- Puri 쿼리 빌더의 다양한 기능을 테스트하기 위한 표준 데이터셋을 제공합니다.

## 개발

```bash
pnpm install          # 패키지 설치
pnpm dev              # 개발 서버 실행
pnpm build            # 프로덕션 빌드
pnpm start            # 빌드된 서버 실행
pnpm test             # 테스트 실행
pnpm test:watch       # 테스트 watch 모드
```

## Fixture 관리

### 스크립트

```bash
pnpm dump             # miomock_test → latest.sql 덤프 생성 (테스트 데이터 변경 후 실행)
pnpm seed             # latest.sql을 fixture DB에 적용한 뒤 test DB로 동기화
pnpm sync:dump        # seed, 승인된 Migration 실행, dump를 순서대로 실행
```

### 파일 구조

```
database/
├── fixtures/
│   └── init.sql                 ← Docker 초기화 (DB 생성)
├── dumps/
│   ├── .gitignore
│   └── miomock_test_latest.sql  ← 테스트 데이터 (Git 공유용)
└── scripts/
    ├── dump.sh                  ← miomock_test → latest.sql 덤프 생성
    └── seed.sh                  ← latest.sql 덤프 → fixture_remote DB 적용
```

### 워크플로우

#### 동료의 변경사항 받기

```bash
# 1. 최신 dump 파일 받기
git pull

# 2. dump를 fixture DB에 적용하고 test DB로 동기화
pnpm seed
```

#### 테스트 데이터 수정하기

```bash
# 1. TablePlus 등으로 miomock_test DB 직접 수정

# 2. 덤프 생성
pnpm dump

# 3. 커밋
git add database/dumps/miomock_test_latest.sql
git commit -m "feat: add test case for something"
git push
```
