# 🌲Sonamu — TypeScript Fullstack API Framework

- [Sonamu Documentation (test-docs, outdated)](https://rurruur.github.io/test-docs/)

Sonamu는 Node.js/TypeScript 기반의 풀스택 프레임워크입니다.

Sonamu는 E2E Type-safety, 효율적인 서브셋 쿼리, 스캐폴딩을 통한 반복작업 자동화 등 프론트엔드와 백엔드가 타입스크립트라는 동일한 언어를 사용한다는 장점을 최대화합니다.

## 프로젝트 셋업

### 0. 개발 환경

다음 환경이 필요합니다:

- [mise](https://mise.jdx.dev/)
- Docker CLI(`docker` 명령어 실행 가능)

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

워크스페이스 내 모든 package들의 의존성이 최상단 `.pnpm/cache` 디렉토리에 설치됩니다.

프로젝트 실행에 필요한 도구들(`@sonamu-kit/ts-loader`, `@sonamu-kit/hmr-hook`, `@sonamu-kit/hmr-runner` 등)이 준비(build)되어야 하기 때문에 최초 한 번은 `mise run build`를 실행해주어야 합니다.

### 3. 예제 프로젝트 실행

데이터베이스를 docker로 올려줍니다;

```bash
# 클론받은 sonamu 저장소 루트 기준입니다.
cd examples/miomock/api/database
docker compose up -d
```

API 서버를 실행합니다;

```bash
# 클론받은 sonamu 저장소 루트 기준입니다.
cd examples/miomock/api
mise exec -- pnpm dev
```

API 개발 서버가 제공하는 Sonamu UI를 엽니다: <http://localhost:34900/sonamu-ui>

Web 서버를 실행합니다;

```bash
# 클론받은 sonamu 저장소 루트 기준입니다.
cd examples/miomock/web
mise exec -- pnpm dev
```

## 기타

### 변동이 잦음

큰 breaking change가 진행중입니다. 프로젝트가 불안정할 수 있습니다.
