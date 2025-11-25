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
pnpm dump             # miomock_test → latest.sql 덤프 생성 (initial-test-data.sql 수정 시 실행)
pnpm seed             # latest.sql → miomock_fixture_remote 적용 (최신 dump pull 받은 후 실행)
```

### 파일 구조

```
database/
├── fixtures/
│   ├── init.sql                 ← Docker 초기화 (DB 생성)
│   └── initial-test-data.sql    ← 표준 테스트 데이터 (원천)
├── dumps/
│   ├── .gitignore
│   └── miomock_test_latest.sql  ← 자동 생성 (Git 공유용)
└── scripts/
    ├── dump.sh                  ← miomock_test → latest.sql 덤프 생성
    └── seed.sh                  ← latest.sql 덤프 → fixture_remote DB 적용
```

### 원칙

1. **테스트 데이터 수정은 항상 `initial-test-data.sql`에서**
2. **덤프로 `latest.sql` 자동 생성**
3. **두 파일 모두 Git에 커밋**

### 워크플로우

#### 테스트 데이터 변경사항 적용

```bash
# 1. 최신 dump 파일 받기
git pull

# 2. pull 받은 dump를 miomock_fixture_remote에 적용
pnpm seed

# 3. miomock_fixture_remote 데이터를 miomock_test로 동기화
pnpm sonamu fixture sync
```

#### 테스트 데이터 추가/수정

```bash
# 1. initial-test-data.sql 편집
code database/fixtures/initial-test-data.sql

# 2. miomock_test에 적용
mysql -h0.0.0.0 -P3306 -uroot -pmiomock123 miomock_test < database/fixtures/initial-test-data.sql

# 3. 덤프 생성
pnpm dump

# 4. 커밋 (두 파일 모두)
git add database/fixtures/initial-test-data.sql database/dumps/miomock_test_latest.sql
git commit -m "feat: add test case for something"
git push
```
