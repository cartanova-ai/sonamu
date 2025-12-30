# Sonamu 프로젝트 AI 지침서

> 이 문서는 AI가 프로젝트에서 작업할 때 따라야 할 지침을 담고 있습니다.
> **살아있는 문서**로서, 의사결정 우선순위 변경이나 중요 사례 발생시 실시간으로 업데이트되어야 합니다.

---

## 핵심 원칙

### 절대 금지 사항
- **force push 금지**: 모든 변경사항은 복구 가능해야 합니다.
- **임의 판단/자체 추측 금지**: 불확실하면 코드, 커밋 로그 등 모든 리소스를 확인한 뒤에도 확신이 없다면 작업을 지체시키더라도 사용자에게 물어보십시오.
- **자동 생성 파일 직접 수정 금지**: `*.generated.ts`, `sonamu.generated.*` 등은 절대 직접 수정하지 마십시오.

### 작업 전 필수 준비
1. `git pull`로 최신 상태 유지
2. pull 후 **루트에서 `pnpm install && pnpm build`** 수행 (패키지 의존성과 코드가 바뀌어 있을 확률이 높음)
3. 작업 전 현재 상태로 돌아올 수 있는 수단 확보 (최소한 `git stash`)
4. 커밋 없이 장시간 삽질 중이라면 사용자에게 커밋 권장

### 이상한 문제 발생시
- 위 과정을 수행했는데도 무언가 이상하다면, 테스트용 DB 컨테이너를 내렸다가 다시 올리기
  ```bash
  cd examples/miomock/api/database
  docker compose down
  docker compose up -d
  ```

### 검증 단계
- 코드 수정 후: **타입 체크 + pnpm build** 필수 (대부분 빌드에 타입 체크 포함됨)
- 푸시 전: **pnpm test** 필수

---

## 커밋 규칙

```
[scope] type: 한국어 상세 설명
```

- scope: 변경된 모듈/패키지 (sonamu, miomock, workspace 등)
- type: feat, fix, refactor, chore, docs 등
- 설명: 맥락과 이유를 포함한 상세한 한국어 설명

예시:
```
[sonamu] fix: DB 연결이 성공할 때까지 1초 간격으로 최대 30번 루프를 돌게 해요
[sonamu/miomock] refactor: select에서 언더바 두개로 이어서 쓰는 대신 중첩 객체 구조로 구성하게 해요
```

---

## 브랜치 전략

- **master에 직접 커밋**이 기본입니다.
- 단, 빌드 성공 확인 후 커밋, 테스트 통과 확인 후 푸시

---

## 코딩 스타일

### 일반 원칙
- "예쁜" 아키텍처보다 **"한 눈에 파악되는" 투박한 코드**가 낫습니다.
- OOP적 기교는 사용하지 않습니다. 클래스는 함수와 상태를 함께 다룰 때 컨테이너 용도로만 사용합니다.
- 비슷한 일을 하는 코드들은 비슷한 위치에 있어야 합니다.
- 인지를 빠르게 할 수 있다면 코드의 순수성과 미감을 어느 정도 포기할 수 있습니다.

### 비동기 코드
- `async/await` 선호
- 불필요한 `return await`은 지양하되, 변수 대입이나 try 블록으로 변경할 때는 반드시 `await`을 붙여 콜스택이 잡히도록 해야 합니다.

### 주석 규칙
- **모든 주석은 존댓말**로 작성합니다.
- 코드가 하는 일을 그대로 서술하는 한 문장 미만의 주석은 효용이 떨어집니다.
- 주석은 코드에 드러나지 않는 **"왜"**를 다뤄야 합니다. 의사결정의 배경과 고민의 역사를 담으십시오.
- 불필요한 친절보다 명료함을 우선시합니다. 동어반복과 모호한 어휘는 지양합니다.
- **주석과 코드의 불일치는 중대한 문제**입니다. 발견시 즉시 해결하십시오.

### 에러 처리
- 원인을 반드시 노출시켜 에러 메시지가 발생 위치를 속이거나 원인을 덮는 경우를 방지합니다.
- 에러 자체 뿐만 아니라 맥락과 해결 힌트를 포함하여 **사람이 문제 해결에 도움이 될만한** 메시지를 출력합니다.

```typescript
// 나쁜 예
.catch(() => {
  console.error('오류가 발생했습니다');
});

// 좋은 예
.catch((e) => {
  console.error('Sonamu CLI를 실행하는 과정에 문제가 발생하였습니다.');
  console.error('보통은 dist/bin/cli.js 파일이 없는 경우입니다만, 아래 에러 메시지를 자세히 읽어보시면 힌트를 얻으실 수 있을 것입니다.');
  console.error(e);
});
```

### 로깅
- 애플리케이션 프로젝트(miomock-api)의 Model, Frame, Agent 등 기능구현 클래스 내부에서는 `this.logger` (logtape) 사용
- 그 외에는 `console.log` 사용
- 로그의 양은 최소한으로. 디버깅 필요시 한시적으로 추가

---

## 리팩토링 원칙

### 적극적 정리를 해야 합니다

인간에게 가장 해로운 것:
1. 이해하지 못한 AI-generated 코드가 쌓이는 것
2. AI의 "큰 그림을 못 보는" 코드가 쌓이는 것

AI는 이러한 약점을 인지해야 합니다. 함수, 파일 단위의 정합성과 구조 뿐만 아니라, 해당 개념이 연결된 모든 곳을 통합적으로 사고하여 일관되고 직관적인 구조를 유지해야 합니다.

### 요청에 따른 대응
- **구체적이고 한정적인 요청**: 요청을 따르되, 추가 문제나 변경 제안 발견시 사용자에게 알림
- **모호하고 불분명한 요청**: 질문을 통해 요청을 구체화한 후 플랜 수립, 이후 적극적 리팩토링

---

## 파일 관리

### 파일 분류: 실시간 동기화 vs 스캐폴딩

Sonamu는 두 종류의 자동 생성 파일이 있습니다:

#### 🔴 실시간 동기화 파일 (절대 수정 금지)

entity.json 등이 변경되면 **자동으로 덮어써지는** 파일들입니다. 수정해도 다음 동기화시 사라집니다.

**API 측 (`api/src/application/`)**
| 파일 | 설명 |
|------|------|
| `sonamu.generated.ts` | 모든 Entity의 타입, BaseSchema, Subset 정의 |
| `sonamu.generated.sso.ts` | SubsetQueries, LoaderQueries, FK 타입 |
| `sonamu.generated.http` | REST API 테스트용 HTTP 파일 |
| `queries.generated.ts` | 쿼리 정의 |

**Web 측 (`web/src/services/`)**
| 파일 | 설명 |
|------|------|
| `sonamu.shared.ts` | 코어에서 자동 복사 |
| `sonamu.generated.ts` | API에서 복사 |
| `sonamu.generated.sso.ts` | API에서 복사 |
| `services.generated.ts` | 서비스 클라이언트 |

#### 🟢 스캐폴딩 파일 (최초 생성 후 개발자가 SSoT로 수정)

**처음 한 번만 생성**되고, 이후 개발자가 자유롭게 수정하는 파일들입니다.

**API 측 (`api/src/application/{entity}/`)**
| 파일 | 설명 |
|------|------|
| `{entity}.entity.json` | Entity 정의 (진짜 SSoT, Sonamu UI로 수정) |
| `{entity}.types.ts` | ListParams, SaveParams 등 타입 확장 |
| `{entity}.model.ts` | 비즈니스 로직 구현 |
| `{entity}.model.test.ts` | 테스트 코드 |
| `{entity}.workflow.ts` | 워크플로우 정의 |
| `{entity}.functions.ts` | 커스텀 API 함수 |

**Web 측 (`web/src/services/{entity}/`)**
| 파일 | 설명 |
|------|------|
| `**/form.ts` | 폼 컴포넌트 |
| `**/list.ts` | 리스트 컴포넌트 |
| `**/*Select.tsx` | 선택 컴포넌트 |
| `**/*Dropdown.tsx` | 드롭다운 컴포넌트 |
| `**/*SearchInput.tsx` | 검색 입력 컴포넌트 |
| `**/*OrderBy.tsx` | 정렬 컴포넌트 |

### sonamu.lock의 역할

체크섬 관리 파일입니다. 다음 파일들의 변경을 감지하여 파생 파일 재생성을 트리거합니다:
- `sonamu.config.ts`, `*.entity.json`, `*.model.ts`, `*.types.ts`
- `*.frame.ts`, `*.functions.ts`, `*.workflow.ts`

**재생성이 필요할 때:**
```bash
rm api/sonamu.lock
pnpm sonamu sync
```

### 파일 생성/삭제
- 확신이 있을 때에만 수행
- 아무짝에도 쓸모 없어진 파일은 제거 가능

---

## 의존성 관리

패키지 추가시:
1. `pnpm-workspace.yaml`을 확인하고 정말 필요한지 재고
2. 한 곳에서만 참조하더라도 미래를 위해 `pnpm-workspace.yaml`의 catalog에 추가
3. 패키지 업데이트가 프로젝트 내 다른 모듈에도 영향을 미친다는 점 인지

---

## Sonamu 프레임워크 핵심 개념

### Single Source of Truth
Sonamu는 Single Source of Truth를 극단적으로 활용합니다. `entity.json`과 같은 중심 파일이 바뀌면 파생 파일들이 생성/변경됩니다.

**중요**: `entity.json` 등 핵심 파일의 변경을 감지하고 업데이트하는 주체는 `pnpm dev`로 띄운 개발 서버입니다. 대부분의 경우 사용자가 이 개발 서버를 띄워둡니다.

- 포트 충돌로 개발 서버 실행 여부 확인 가능
- `entity.json` 수정시 `sonamu.lock` 포함 많은 파일에 변화가 발생함을 인지

### Entity, Migration 작업
- `entity.json` 수정, DB 마이그레이션은 대부분 사용자가 **Sonamu UI**(GUI)로 직접 수행
- AI가 이들을 수정해야 하는 상황이 오면 사용자에게 직접 처리하도록 안내

---

## 작업 방식

### 플랜 먼저
새로운 기능이나 변경을 구현할 때는 플랜을 먼저 세우고 사용자 확인을 받습니다.

### 문제 발생시
1. 아무 것도 건드리지 말고 사용자에게 솔직하게 보고
2. 향후 해결책을 제시하고 검토 받기
3. **작업 착수 전 현재 상태로 돌아올 수 있는 수단 확보가 핵심**

---

## 프로젝트 구조

```
sonamu/
├── modules/
│   ├── sonamu/          # 프레임워크 코어
│   ├── hmr-hook/        # HMR 관련 (수정 신중)
│   ├── hmr-runner/      # HMR 관련 (수정 신중)
│   ├── ts-loader/       # TypeScript 로더 (수정 신중)
│   ├── react-sui/       # React UI 컴포넌트
│   ├── react-components/ # React 컴포넌트
│   └── tasks/           # 태스크 관리
├── examples/
│   └── miomock/         # 예제/테스트 프로젝트
│       ├── api/         # 백엔드 API
│       └── web/         # 프론트엔드
└── docs/                # 문서
```

---

## 테스트 실행

테스트는 `miomock-api`를 대상으로 실행됩니다.

### 사전 준비
1. **PostgreSQL 실행**: `cd examples/miomock/api/database && docker compose up -d`
   - 포트 충돌시 기존 컨테이너를 중지하고 다시 시도
2. **마이그레이션**: `pnpm sonamu migrate run`
3. **Seed & Fixture**: `pnpm seed`
4. **테스트 실행**: `pnpm test`

상세 내용은 `.github/workflows/`와 `scripts/miomock-unit-test.sh` 참조

### 테스트 코드 작성
`sonamu/test`의 `bootstrap`, `test`, `testAs` 패턴을 따릅니다.

```typescript
import { bootstrap, test, testAs } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);
describe("UserModel", () => {
  test("테스트 케이스", async () => {
    // ...
  });
});
```

---

## 자율주행 모드 (무인 실행)

### 유인/무인 판단 기준

다음 조건 중 하나라도 해당하면 **무인 실행**으로 판단합니다:
- "[자율주행]" 키워드가 있는 경우.
- "사용자에게 묻지 말고 끝까지 진행"하라는 명시가 있는 경우.

### 무인 실행시 규칙

1. **중간에 사용자에게 묻지 않고 최대한 끝까지 진행**
2. **절대 금지 사항은 여전히 적용** (force push 금지, generated 파일 수정 금지 등)
3. 의문점/불확실한 부분은 작업을 중단하지 말고 **적절한 산출물에 "검토 필요 사항"으로 기록** (PR 설명, 커밋 메시지, 별도 문서 등)
4. 빌드/타입체크 실패시에도 멈추지 말고, 해결 시도 후 결과를 기록
5. 확신이 60% 이상이면 진행, 미만이면 "검토 필요"로 남기고 다음 작업으로

---

## 문서 업데이트 원칙

이 문서는 **살아있는 상태**를 유지해야 합니다:
- 의사결정 우선순위 변경시 반영
- 중요 사례 발생시 반영
- 무한정 추가보다는 기존 내용 업데이트/최신화 우선

---

## 하위 문서

**중요**: `modules/*` 또는 `examples/*` 하위 패키지에서 작업할 때는 **반드시** 해당 패키지의 CLAUDE.md를 먼저 읽으십시오. 대화가 길어지면 이 문서의 내용도 요약되어 세부 지침이 손실될 수 있으므로, 하위 패키지 작업 시작 시점에 매번 해당 CLAUDE.md를 다시 읽어야 합니다.

- [modules/sonamu/CLAUDE.md](modules/sonamu/CLAUDE.md) - 프레임워크 코어 작업 지침
- [examples/miomock/CLAUDE.md](examples/miomock/CLAUDE.md) - 예제 프로젝트 작업 지침
