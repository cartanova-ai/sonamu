# Sonamu 코어 모듈 AI 지침서

> 이 문서는 `modules/sonamu` 디렉토리에서 작업할 때의 추가 지침을 담고 있습니다.
> 루트의 [CLAUDE.md](../../CLAUDE.md)를 먼저 숙지하십시오.

---

## 모듈 개요

Sonamu는 TypeScript 기반 풀스택 프레임워크의 코어입니다. 이 모듈의 변경은 **모든 Sonamu 프로젝트에 영향**을 미칩니다.

### 주요 디렉토리 구조

```
modules/sonamu/
├── src/
│   ├── api/             # API 관련 (config, controller 등)
│   ├── database/        # DB 관련 (puri, base-model, migrator 등)
│   ├── entity/          # Entity 정의 및 코드 생성
│   ├── syncer/          # 파일 동기화 및 템플릿
│   ├── testing/         # 테스트 유틸리티 (bootstrap, test, testAs)
│   ├── ai/              # AI 관련 기능
│   ├── cache/           # 캐시 기능
│   ├── storage/         # 스토리지 드라이버
│   ├── ssr/             # SSR 지원
│   └── bin/             # CLI 진입점
├── ui-web/              # Sonamu UI (웹 인터페이스)
└── dist/                # 빌드 출력
```

---

## 핵심 개념

### Puri 쿼리 빌더
- `src/database/puri.ts`: Knex를 래핑한 타입 안전 쿼리 빌더
- `src/database/puri.types.ts`: 타입 추론 로직
- 중첩 객체 구조와 nullability 추론이 핵심

### Entity 시스템
- `entity.json`이 Single Source of Truth
- Entity 변경시 자동으로 타입, 쿼리, API 코드 생성
- `src/entity/entity.ts`: 코드 생성 로직

### Template 시스템
- `src/syncer/template*.ts`: 코드 생성 템플릿
- 템플릿 변경은 생성되는 모든 코드에 영향

### BaseModel
- `src/database/base-model.ts`: 모든 Model의 기반 클래스
- `hydrate` 함수로 flat 결과를 nested 객체로 변환

---

## 수정시 주의사항

### 자유롭게 수정 가능하나...
- 변경이 모든 Sonamu 프로젝트에 영향을 미침을 인지
- 타입 시그니처 변경시 하위 호환성 고려
- 템플릿 변경시 기존 프로젝트의 생성 코드에 미치는 영향 고려

### 테스트
- sonamu 자체 테스트는 극히 드묾
- **대부분의 테스트는 `miomock-api`에서 수행**
- sonamu 수정 후 반드시 miomock-api 테스트로 검증

```bash
# sonamu 빌드
cd modules/sonamu && pnpm build

# miomock-api 테스트
cd examples/miomock/api && pnpm test
```

---

## 파일별 주의사항

### `src/database/puri.ts`, `puri.types.ts`
- 타입 추론 로직이 복잡함
- nullability 추론 변경시 영향 범위 넓음
- 문서: `docs/puri-hierarchical-select.md` 참조

### `src/syncer/template*.ts`
- 코드 생성 템플릿
- 변경시 `sonamu.lock` 삭제 후 `pnpm sonamu sync`로 재생성 필요
- miomock에서 결과 확인 필수

### `src/database/migrator.ts`
- 마이그레이션 로직
- DB 스키마 변경에 직접 영향
- 변경시 매우 신중하게

### `src/api/config.ts`
- 설정 로드 로직
- 런타임 vs 개발 환경 경로 차이 주의

### `bin/cli.js`
- CLI 진입점
- pnpm의 bin 링킹 특성 주의 (빌드 후 생성되는 파일)

---

## 빌드 및 배포

```bash
# 빌드
pnpm build

# 빌드 출력
# - dist/: 트랜스파일된 JS 및 타입 선언
# - ui-web/dist/: Sonamu UI 빌드
```

### exports 구조
```json
{
  ".": "./dist/index.js",
  "./ai": "./dist/ai/index.js",
  "./vector": "./dist/vector/index.js",
  "./storage": "./dist/storage/index.js",
  "./ssr": "./dist/ssr/index.js",
  "./test": "./dist/testing/index.js",
  "./cache": "./dist/cache/index.js"
}
```

---

## HMR 관련 모듈 (수정 신중)

`hmr-hook`, `hmr-runner`, `ts-loader`는 HMR(Hot Module Replacement) 시스템의 핵심입니다.

- 변경시 HMR 시스템 전체에 대한 이해 필요
- 가급적 수정 자제
- 수정이 필요하다면 사용자에게 먼저 확인

---

## 디버깅 팁

### 개발 서버 확인
```bash
# 포트 사용 확인
lsof -i :10280

# 개발 서버가 떠 있어야 entity.json 변경이 반영됨
```

### 생성 코드 확인
- `sonamu.lock`: 생성된 파일의 체크섬
- `sonamu.generated.ts`: 생성된 타입
- `sonamu.generated.sso.ts`: 생성된 서브셋 쿼리

---

## 문서 업데이트

이 문서는 sonamu 코어 개발 경험이 축적됨에 따라 업데이트되어야 합니다:
- 새로운 패턴 발견시 추가
- 함정(gotcha) 발견시 경고 추가
- API 변경시 반영
