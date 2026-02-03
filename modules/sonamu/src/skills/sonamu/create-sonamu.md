---
name: create-sonamu
description: pnpm create sonamu CLI 옵션 레퍼런스. 프로젝트 생성 시 참조.
---

# create-sonamu CLI

## 기본 사용법

```bash
pnpm create sonamu [프로젝트명]
```

## 빠른 생성 (권장)

모든 옵션을 기본값으로 사용:

```bash
pnpm create sonamu [프로젝트명] --yes
```

## CLI 옵션

### 일반 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--yes`, `-y` | 모든 옵션 기본값 사용 | - |
| `--skip-pnpm` | pnpm install 스킵 | false |
| `--skip-docker` | Docker 설정 스킵 | false |
| `--pnpm y/n` | pnpm 설치 여부 | y |
| `--docker y/n` | Docker 설정 여부 | y |

### Docker/DB 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--docker-project` | Docker 프로젝트명 | `[프로젝트명]-docker` |
| `--container-name` | 컨테이너명 | `[프로젝트명]-container` |
| `--db-name` | 데이터베이스명 | `[프로젝트명]` |
| `--db-user` | DB 사용자 | `postgres` |
| `--db-password` | DB 비밀번호 | `1234` |

## 사용 예시

### 기본값으로 빠르게 생성

```bash
pnpm create sonamu my_project --yes
```

### Docker 없이 생성

```bash
pnpm create sonamu my_project --skip-docker
```

### DB 설정 커스텀

```bash
pnpm create sonamu my_project \
  --db-name my_db \
  --db-user admin \
  --db-password secret123
```

### 전체 커스텀

```bash
pnpm create sonamu my_project \
  --docker-project my-docker \
  --container-name my-container \
  --db-name my_database \
  --db-user postgres \
  --db-password 1234
```

## 생성 후 구조

```
[프로젝트명]/
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── application/   # Entity, Model, API
│   │   │   ├── migrations/
│   │   │   └── sonamu.config.ts
│   │   ├── database/
│   │   │   └── docker-compose.yml
│   │   └── .env
│   └── web/
│       └── src/
├── pnpm-workspace.yaml
└── package.json
```

## 생성 후 다음 단계

1. DB 컨테이너 실행 (Docker 설정한 경우)
   ```bash
   cd [프로젝트명]/packages/api/
   pnpm docker:up
   ```
   > 포트 충돌 오류 발생 시 → `database.md` 참조

2. Skills 동기화
   ```bash
   cd [프로젝트명]/packages/api
   pnpm sonamu skills sync
   ```
   > sonamu가 npm 버전이면 실패함. 아래 "Sonamu 링크 설정" 참조

3. 개발 서버 실행
   ```bash
   cd [프로젝트명]/packages/api
   pnpm dev
   ```

4. Entity 설계 진행 → `entity-basic.md` 참조

## Sonamu 링크 설정

**Skills 동기화는 sonamu가 로컬 링크로 참조되어야 동작합니다.**

### 확인 방법

`packages/api/package.json`에서 sonamu 의존성 확인:

```json
// ✓ 링크 참조 (Skills 동기화 가능)
"sonamu": "link:/path/to/sonamu/modules/sonamu"

// ✗ npm 버전 (Skills 동기화 불가)
"sonamu": "^0.7.47"
```

### 링크로 변경하는 방법

1. `packages/api/package.json`에서 sonamu 버전을 링크로 변경:
   ```json
   "dependencies": {
     "sonamu": "link:/path/to/sonamu/modules/sonamu"
   }
   ```

2. `pnpm install` 실행

3. `pnpm sonamu skills sync` 다시 실행

### 링크 경로 예시

| sonamu 위치 | 링크 경로 |
|------------|----------|
| `~/Development/sonamu` | `link:~/Development/sonamu/modules/sonamu` |
| 프로젝트와 같은 디렉토리 | `link:../../sonamu/modules/sonamu` |
