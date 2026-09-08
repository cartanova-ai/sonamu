# 🌲Sonamu — TypeScript Fullstack API Framework

- [Sonamu Documentation](https://sonamu.cartanova.ai/ko)

Sonamu는 Node.js/TypeScript 기반의 풀스택 프레임워크입니다.

Sonamu는 E2E Type-safety, 효율적인 서브셋 쿼리, 스캐폴딩을 통한 반복작업 자동화 등 프론트엔드와 백엔드가 타입스크립트라는 동일한 언어를 사용한다는 장점을 최대화합니다.

## 프로젝트 셋업

### 0. 개발 환경

다음 환경이 필요합니다:

- [mise](https://mise.jdx.dev/)
- Docker Engine과 Docker Compose(`docker compose` 명령어 실행 가능, Docker 실행 중)
- 테스트 데이터 준비 시 PostgreSQL 클라이언트 도구(`psql`, `pg_dump`, `pg_restore`; 예제 DB와 같은 PostgreSQL 18 버전)

### 1. 프로젝트 클론

```bash
git clone https://github.com/cartanova-ai/sonamu.git
cd sonamu
```

### 2. 의존성과 패키지들 준비

```bash
mise trust # 저장소의 mise 설정 신뢰
mise install --locked # Node.js와 pnpm 설치
mise exec -- pnpm install # 의존성 패키지 설치
mise run build # 모노레포 내 패키지들 빌드
```

프로젝트 실행에 필요한 도구들(`@sonamu-kit/ts-loader`, `@sonamu-kit/hmr-hook`, `@sonamu-kit/hmr-runner` 등)이 준비(build)되어야 하기 때문에 최초 한 번은 `mise run build`를 실행해주어야 합니다.

### 3. 예제 프로젝트 실행

저장소 루트에서 예제 API 디렉토리로 이동한 뒤 데이터베이스를 실행합니다. 이후 명령도 이 디렉토리에서 실행합니다.

```bash
cd examples/miomock/api
docker compose -f database/docker-compose.yml up -d
```

Docker 초기화는 데이터베이스 생성까지만 수행합니다. PostgreSQL이 연결을 받을 준비가 되면 개발 DB에 마이그레이션을 적용하여 테이블을 생성합니다.

```bash
mise exec -- pnpm sonamu migrate apply development --execute --confirm
```

테스트 데이터를 준비하려면 다음 명령을 실행합니다. `seed`는 저장소의 덤프를 fixture DB에 복원한 뒤 test DB로 복사하므로, 기존 fixture·test DB 데이터를 교체합니다. 개발 DB에는 테스트 데이터를 복사하지 않습니다.

```bash
mise exec -- pnpm seed
mise exec -- pnpm sonamu migrate apply fixture test --execute --confirm
```

API와 웹 개발 서버를 함께 실행합니다.

```bash
mise exec -- pnpm dev
```

- 예제 웹: <http://localhost:10280>
- Sonamu UI: <http://localhost:10280/sonamu-ui>

접속 포트는 `examples/miomock/api/src/sonamu.config.ts`의 서버 설정을 따릅니다.

## 기타

### 버전 호환성

안정화 전 단계로, 버전 업데이트 시 호환성이 깨질 수 있습니다.
