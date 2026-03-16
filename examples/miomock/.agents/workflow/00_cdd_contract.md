# CDD Shared Contract

CDD 워크플로우의 모든 프롬프트에 공통 적용되는 정책.

## 권위 순서

Contract > Spec > Code. 충돌 시 상위가 우선이다.

## CDD 정책 원본

모든 서브에이전트는 작업 시작 전 아래 문서를 반드시 읽어야 한다:
- `../../api/contract/cdd.md`

## 역할 삼분법

| 역할 | 담당 | 설명 |
|---|---|---|
| LLM | 실행 | 단일 액션 수행 (코드 작성, 명세 작성, 검증 수행) |
| CLI | 판단 | 검증 + 다음 행동 결정 (gate 검증, 상태 전이) |
| Spec 문서 | 기억 | 상태 + 명세 + 히스토리 + 계획 |

## 서브에이전트 공통 규칙

- leaf worker로서 다른 서브에이전트를 스폰할 수 없다.
- 할당된 단계의 범위를 넘어서 작업하지 않는다.
- 작업 완료 후 결과를 구조화된 형태로 반환한다.
- Contract 파일은 읽기만 가능하다. 수정이 필요하면 오케스트레이터에 보고한다.
- `cdd advance --commit`을 직접 실행하지 않는다. 오케스트레이터가 전이를 관리한다.

## CLI 실행 컨텍스트

- 작업 디렉토리: `examples/miomock/api`
- CDD CLI는 `cdd` 명령으로 실행한다.
- `cdd status`로 현재 상태를 확인한다.
- 테스트 실행: `pnpm sonamu test -s`로 준비 상태 확인 후 `pnpm sonamu test` 또는 `pnpm test`

## 커밋 정책

- 한국어, scope-first bracket conventional 형식: `[scope] type: 제목`
- Spec 변경과 코드 변경은 가능하면 분리 커밋한다.
- Co-Authored-By 트레일러를 추가하지 않는다.

## TypeScript 정책

- `as any`, `as unknown as T` 사용 금지.
- 적절한 타입 어노테이션, 제네릭, 타입 내로잉으로 해결한다.

## 검증 기준

- `pnpm check` (Biome): 워크스페이스 루트 + 영향받는 서브프로젝트
- 빌드: `pnpm build`
- 테스트: `pnpm sonamu test` 또는 `pnpm test`
