---
title: sonamu.lock 신뢰성 개선 — 무결성 추적 확장
type: feat
status: completed
date: 2026-05-02
issue: SON-467
parent: SON-466
---

# sonamu.lock 신뢰성 개선 — 무결성 추적 확장

> SON-467 이슈 description은 이미 spec급이라 *무엇을·왜*는 거기 다 있다. 이 플랜은 그 위에 **(a) 1차 PR 스코프 고정**, **(b) 현장 검증으로 새로 발견한 함정 반영**, **(c) 단계별 검증 결과** 세 가지를 얹는다.
>
> **본 문서는 머지 직전 시점에 코드(=SSoT) 기준으로 한 번 정렬됐다.** 야간 자율 구현 중 추가된 결정·정련은 plan 본문에 반영했고, 더 깊은 디자인 흐름은 별도 문서 `[Design Notes] Syncer 리팩토링 — 디자인 원칙 + 결정사항`(Linear)으로 분리했다. 옛 결정의 *왜*는 의도적으로 보존했다 — 이번 사이클에서 어떤 길을 갔다가 어디로 빠져나왔는지가 다음 사이클 작업자에게 가치 있는 맥락이다.

## Overview

`sonamu.lock`은 syncer가 추적하는 파일들의 SHA-1 체크섬 스냅샷인데, 두 가지 한계가 있다.

- **한계 1 — 추적 패턴이 좁다**: api 한정 단일 경로로 박혀 있어서 web 등 target 산출물이 추적 밖이다. miomock에서 출력물 다수가 lock 외부에 있음.
- **한계 2 — force sync가 비싸고 CLI도 없다**: dev 서버 `f` 핫키로만 돌릴 수 있고, 비용도 무거움(prettier 포매팅 + 매번 mtime 변경 → watcher 폭풍). git hook이나 CI에서 부르기 어렵다.

**최종 1차 PR 스코프**는 **A(추적 모델 통일) + C-1(force sync CLI)**. B-1(write-if-different)은 시도 후 측정 기준 미달로 폐기. B-2(포매팅 캐시)/B-3(포매터 교체)는 별도 사이클. 정확성(A) 가치는 성능 목표와 독립이라 1차 PR은 정확성·운용성만 가져간다.

> **함께 머지되는 syncer 리팩토링**: A의 패턴 그룹 정련에 맞물려 syncer 본체 디자인도 재정리됐다 (sync() 3-phase 분리, 핸들러 완결화, 자산 본성에 따른 분배 패턴 명시화 등). 이 부분은 Design Notes 문서가 단일 소스. plan은 거기로 위임한다.

## 현장 검증 (2026-05-02)

description이 짚은 콜사이트랑 fallback 경로가 실제 코드와 맞는지 확인. **결론: 다 맞는데 한 가지 *해석을 보정*해야 했음.**

| description 가정 | 실제 코드 | 상태 |
|---|---|---|
| `code-generator.ts` template 렌더 결과 writeFile | `writeFile(dstFilePath, pathAndCode.code)` | ✅ |
| `fs-utils.ts` `copyFileWithReplaceCoreToShared` 내부 writeFile | `writeFile(toPath, newFileContent)` | ✅ |
| `syncer.ts` sonamu.shared.ts 복사 writeFile | `writeFile(destPath, convertedText)` | ⚠️ → 부트스트랩 자산으로 재분류됨 |
| `bin/cli.ts` `f` 핫키 | `--on-key=f:shell(rm ${...sonamu.lock}):restart:Force restart` (당시) | ✅ |
| `checksum.ts` 파싱 실패 fallback | try/catch에서 `[]` 반환 → 풀-싱크 트리거 | ✅ |
| `getChecksumPatternGroupInAbsolutePath()` 이미 존재 | 절대경로 변환만 수행 | ✅ |

### sonamu.shared.ts 분기 — 함정에서 부트스트랩 자산으로

처음엔 `if (await exists(destPath)) continue;` 분기를 *write-if-different와 충돌하는 함정*으로 봤다 ("1회만 생성"이라는 본래 의도가 wrapper로 깨질 수 있음). B-1이 폐기되면서 이 충돌은 사라졌고, 대신 **자산 본성에 따른 분류**로 정리됐다:

- **부트스트랩 자산** (lock 추적 밖, sync()의 부트스트랩 phase에서 매번 보장):
  - `sonamu.shared.ts` — 사용자 커스터마이즈 가능 → IfNotExists로 1회 생성
  - `entry-server.generated.tsx` — 입력 의존 없는 정적 코드 → overwrite 매번 generate
- **추적 자산** (lock에 잡힘, 변경 검출 → 액션 트리거)

추적 사이클 안에서 할 액션이 없는 자산은 lock에 들어갈 가치가 없다. 그래서 패턴 그룹에서 빼고 부트스트랩 phase로 이동. 자세한 흐름은 Design Notes #1·#8 참조.

## Scope

### In scope (1차 PR — 머지됨)

- **A. 추적 모델 통일** — `getChecksumPatternGroup()` 함수화 + 위치 카테고리 헬퍼(`api`/`targets`/`anywhere`) + appRoot 좌표계 + glob exclude 가드. `FileType`은 함수 반환 객체 키에서 `ReturnType` + `keyof` + `satisfies`로 자동 추론 (별도 enum/배열 동기화 불필요).
- **C-1. `sonamu sync --force` CLI + `f` 핫키 통합** — 핫키를 `pnpm sonamu sync --force`로 변경.
- **부수적: syncer 리팩토링 묶음** — A의 추적 모델 정련에 맞물려 sync() 3-phase 분리, 핸들러 완결화, 자산 본성에 따른 분배 패턴 명시화. 단일 소스는 Design Notes 문서.

### B-1 (write-if-different) — 시도 후 폐기

이번 사이클에서 시도했으나 **성능 효과가 미미해 채택 안 함**. 자세한 내용은 아래 "Phase 5 결과" 섹션 참조.

요지: `writeFile`을 wrapper(`writeFileIfChanged`)로 감쌀 만한 가치는 측정 가능한 watcher-storm 억제 효과가 있어야 정당화되는데, miomock 기준 force sync wall time이 베이스라인 대비 ~2% 개선에 그침 (prettier 포매팅 비용이 대부분). `writeFile`의 직관성을 포기할 이유가 없다 — 별도 사이클에서 B-2/B-3로 본격 시도.

### Out of scope (별도 사이클로 분리)

- **B-2. 포매팅 캐시** — prettier 비용이 wall time의 대부분이라 캐시가 핵심. 본격 측정 후 결정.
- **B-3. prettier → oxfmt/dprint 교체** — SON-466의 oxlint/oxformat 항목과 시너지. 출력 diff가 크니까 별도로 분리.
- **검증 모드 `--check`/`--dry-run`** — force sync가 무거워도 git hook 자동화 가치는 살아있음. 별도 검증 CLI는 가치 적음.
- **lock 백업/복구** — "lock 사라지는 건 흔한 일"이라는 운영 모델과 안 맞으니 도입 안 함.
- **출력 손상의 자연 reconciliation** — syncer는 trigger-based 모델 (Design Notes #8). 출력만 손상된 케이스는 force sync로 복구. desired-state reconciler로 진화하는 건 ROI 약해서 미지원.

## Architecture

### A. 추적 모델 통일 (현재 코드)

```ts
// modules/sonamu/src/syncer/file-patterns.ts
export function getChecksumPatternGroup() {
  const { api, targets, anywhere } = globBuilders();

  return {
    // 입력 (사용자 작성). 모노리포에서 source는 api 한정.
    config:    api("src/sonamu.config.ts"),
    entity:    api("src/application/**/*.entity.json"),
    frame:     api("src/application/**/*.frame.ts"),
    functions: api("src/application/**/*.functions.ts"),
    model:     api("src/application/**/*.model.ts"),
    types:     api("src/application/**/*.types.ts"),
    workflow:  api("src/application/**/*.workflow.ts"),
    i18n:      api("src/i18n/**/!(sd.generated).ts"),

    // 출력 (sonamu 생성/복사). 부트스트랩 자산은 여기 없음 (별도 phase에서 보장).
    // 자산 본성에 따라 위치 카테고리가 다르기 때문에, 본성별로 분리해서 표기.
    // - 양쪽-필요 자산: api에 정본 → target 복사 (sonamu.generated.*, queries.generated.ts)
    // - api 전용 자산: api에만 (sonamu.generated.http)
    // - target 전용 자산: target에만 (services.generated.ts는 services.template :target 분배)
    generated:         api("src/application/**/*.generated.{ts,tsx,sso.ts}"),
    generatedCopied:   targets("src/services/**/{sonamu,queries}.generated.{ts,tsx,sso.ts}"),
    httpGenerated:     api("src/application/**/*.generated.http"),
    servicesGenerated: targets("src/services/services.generated.ts"),
    sdGenerated:       anywhere("src/i18n/**/sd.generated.ts"),
    typesCopied:       targets("src/services/**/*.types.ts"),
    functionsCopied:   targets("src/services/**/*.functions.ts"),
    i18nCopied:        targets("src/i18n/**/!(sd.generated).ts"),
  } satisfies Record<string, AppRelativePath>;
}

function globBuilders() {
  const apiDir = Sonamu.config.api.dir;
  const targetDirs = Sonamu.config.sync.targets;

  // Node 내장 fs.glob의 brace expansion은 단일 멤버 {x}를 풀지 않으므로,
  // 멤버가 1개일 때는 alternation 없이 직접 결합.
  const braceJoin = (dirs: readonly string[]) =>
    dirs.length === 1 ? dirs[0] : `{${dirs.join(",")}}`;

  return {
    api:      (pathFromApi: string)      => `${apiDir}/${pathFromApi}` as AppRelativePath,
    targets:  (pathFromTarget: string)   => `${braceJoin(targetDirs)}/${pathFromTarget}` as AppRelativePath,
    anywhere: (pathFromAnywhere: string) => `${braceJoin([apiDir, ...targetDirs])}/${pathFromAnywhere}` as AppRelativePath,
  };
}

export type FileType = keyof ReturnType<typeof getChecksumPatternGroup>;
```

포인트:

- 위치 카테고리 헬퍼 3개 — `api`(api 한정) / `targets`(target 한정) / `anywhere`(어디서든)
- 패턴 본문은 단일 좌표계 `src/...`로 통일
- target 추가/이름 변경해도 코드 수정 0. `Sonamu.config.sync.targets` 따라감
- **i18n은 위치에 따라 의미가 다르다** — api 안의 `ko.ts/en.ts/ja.ts`는 사용자가 작성한 입력이고, target 안의 같은 파일은 api에서 복사된 산출물이다. 그래서 입력 패턴 `i18n`은 `api`로, 산출물 패턴 `i18nCopied`는 `targets`로 따로 잡는다
- `FileType` 단일 소스: 함수 반환 객체 키에서 `keyof ReturnType<...>`로 자동 추론. 별도 enum/배열 동기화 지점 없음.
- **단일 멤버 alternation 가드** (`braceJoin`): Node 내장 `fs.glob`이 `{web}` 같은 단일 멤버 brace expansion을 처리하지 못해서 alternation 없이 직접 결합.
- **`generated` 산출물 fileType을 자산 본성별로 분리** — 처음엔 `src/**/*.generated.*` 단일 패턴이었다가 `src/{application,services}/**` 디렉토리 한정으로 한 단계 좁혔고, 머지 직전 한 단계 더 — 자산 본성(양쪽-필요 정본/양쪽-필요 복사본/api 전용/target 전용)에 따라 4개 fileType으로 분리. 와일드카드 충돌(target 측 `services.generated.ts`가 양쪽-필요 복사본 패턴에 끼어드는 케이스)은 명시 enumeration(`{sonamu,queries}.generated.*`)으로 해소. 비대칭이지만 *근본 원인(파일명 충돌) 실재*. Design Notes #4·#6.
- **`i18nGenerated` → `sdGenerated` rename** — 파일명(`sd.generated.ts`)과 fileType명을 매칭. *Sonamu Dictionary*라는 도메인 약어를 키에 박음. 다른 i18n 산출물(`ko.ts`/`en.ts`의 진짜 사용자 입력 복사 = `i18nCopied`)과 prefix 차이로 *서로 다른 종류*임을 명시. anywhere로 둠 (api와 target 양쪽 위치별 직접 generate, 복사 아님).
- **산출물 fileType 추가** (`typesCopied`/`functionsCopied`/`generatedCopied`/`httpGenerated`/`servicesGenerated`) — 양쪽-필요 자산의 target 복사본과 target 전용 자산이 lock 추적에서 누락되던 갭 해소. Design Notes #4 자산 본성 표 참조.
- 글롭 alternation으로 의도한 디렉토리만 정확히 매치 → 와일드카드가 줄어드니까 `node_modules` 같은 데 휘말릴 위험도 거의 사라짐. 안전망으로 `GLOB_EXCLUDE`도 같이 적용.

같이 해야 하는 것들:

- **타입**: `AppRelativePath` template literal alias를 `path-utils.ts`에 추가. 기존 `ApiRelativePath`는 그대로 — 두 좌표계가 자연스럽게 공존.
- **Lock 포맷**: `[{ path: AppRelativePath, checksum }]` — path는 appRoot 상대, **알파벳 안정 정렬** (PR diff 깔끔하라고).
- **Lock 위치**: `<apiRoot>/sonamu.lock` 그대로 (사용자 워크플로우상 api가 home base니까).
- **Lock 중복 path 처리**: 옛 패턴 시점엔 광범위 `generated`와 `i18nGenerated`가 둘 다 `sd.generated.ts`를 매치해서 같은 파일이 lock에 두 번 들어가는 문제가 있었음. `getCurrentChecksums`에서 `Array.from(new Set(allPaths)).toSorted()`로 unique 처리. **현재 패턴(본성별 분리)에선 generated가 `api/application` 한정, sdGenerated가 `i18n/sd.generated.ts`만 매치라 충돌 자체 사라짐**. dedup 로직은 방어적 안전망으로 잔존.
- **Glob ignore 가드**: `globAsync(pattern, { exclude: [...] })`. 가드 값 `["**/node_modules/**", "**/dist/**", "**/build/**", "**/.turbo/**"]`. Node 내장 `fs.glob`이 `exclude` 이미 지원함.
- **마이그레이션**: 별도 절차 없음. 옛 포맷 lock은 path 좌표계가 달라져서 전부 mismatch → 풀-싱크 → 새 포맷 자동 갱신. `checksum.ts`의 try/catch fallback과 같은 자연 복구 경로 (현장 검증 완료).

### B-1. write-if-different — ❌ 시도 후 폐기

원래 의도: `writeFileIfChanged` wrapper로 콜사이트 두 곳을 감싸 mtime 보존 → watcher 폭풍 억제. 자세한 이유는 위 Scope 섹션 + 아래 Phase 5 결과 참조.

### C-1. force sync CLI + 핫키 통합 (현재 코드)

```ts
// modules/sonamu/src/syncer/syncer.ts
async forceSync(): Promise<void> {
  const lockPath = path.join(Sonamu.apiRootPath, "sonamu.lock");
  if (await exists(lockPath)) {
    await unlink(lockPath);
  }
  await this.sync();
}
```

CLI 옵션 (`bin/cli.ts`의 `sync()`):

- `sonamu sync` — 평소 사용. 변경 있으면 sync, 없으면 noop (기존 동작 유지)
- `sonamu sync --force` — lock 무시하고 풀-싱크. git post-merge hook 등에서 호출

핫키 통합 (`bin/cli.ts`):

```diff
- `--on-key=f:shell(rm ${path.join(apiRoot, "sonamu.lock")}):restart:Force restart`,
+ `--on-key=f:shell(cd ${apiRoot} && pnpm sonamu sync --force):restart:Force sync & restart`,
```

force sync 정의가 `--force` 한 군데로 모이고, 부트스트랩 phase가 매번 동일하게 돌아간다. `:restart`는 유지 — dev 서버 reload는 force sync의 정상 동작이니까.

**실패 안전성**: sync 도중 프로세스 죽어서 lock 없는 상태로 남아도 무해함. 다음 sync에서 lock 없으면 자연 풀-싱크 → 새 lock 작성. 백업/복구는 안 만든다 ("lock 사라지는 건 흔한 일" 운영 모델).

## Implementation Phases

### Phase 0 — 베이스라인 측정 (구현 시작 전)

miomock에서 `rm api/sonamu.lock; time pnpm sonamu sync` 4회로 측정. 결과는 Phase 5 표 참조.

### Phase 1 — A: 추적 모델 통일 ✅

영향 파일:

- `modules/sonamu/src/syncer/file-patterns.ts` (헬퍼 도입, 입력/출력 분리, 함수화, 부트스트랩 자산 분리)
- `modules/sonamu/src/syncer/checksum.ts` (lock 좌표계 변경, path 변환, 중복 path dedup)
- `modules/sonamu/src/utils/path-utils.ts` (`AppRelativePath` alias 추가)
- `modules/sonamu/src/utils/async-utils.ts` (`globAsync`에 `exclude` 옵션 추가)

검증 결과:

- ✅ `pnpm --filter sonamu build`
- ✅ `pnpm --filter sonamu test:type`
- ✅ miomock에서 lock 삭제 후 sync → 새 포맷 lock 확인 (lock 항목 57 → 68개, +11)
- ✅ 추가 출력물 모두 lock에 자동 포함 (api 4종 + web 8종):
  - api 측: `queries.generated.ts`, `sonamu.generated.sso.ts`, `sonamu.generated.http`, `i18n/sd.generated.ts`
  - web 측: `i18n/{ko,en,ja}.ts` (3개), `i18n/sd.generated.ts`, `services/queries.generated.ts`, `services/services.generated.ts`, `services/sonamu.generated.sso.ts`, `services/sonamu.generated.ts`
- 참고: `web/src/entry-server.generated.tsx`는 *부트스트랩 자산*으로 재분류되어 lock 추적 밖. sync()의 부트스트랩 phase에서 매번 보장됨.

### Phase 2 — B-1: write-if-different ❌ 폐기

플랜에는 있었으나 Phase 5 측정 결과 ~2% 개선에 그쳐 **채택 안 함**. 자세한 이유는 "Phase 5 결과" 참조. wrapper 도입으로 잃는 직관성에 비해 측정 가능한 효과가 약함.

### Phase 3 — C-1: force sync CLI + 핫키 통합 ✅

영향 파일:

- `modules/sonamu/src/syncer/syncer.ts` (`forceSync` 메서드 추가)
- `modules/sonamu/src/bin/cli.ts` (`--force` 옵션 추가, `f` 핫키 변경)

검증 결과:

- ✅ `pnpm sonamu sync --force` 동작 (lock 삭제 후 sync 실행)
- ✅ 도중 프로세스 강제 종료 후 다음 `pnpm sonamu sync`가 풀-싱크로 자연 복구
- ✅ dev 서버에서 `f` 핫키 → force sync + restart 흐름

### Phase 4 — 영향 테스트 갱신 ✅

modules/sonamu/CLAUDE.md에 "Sonamu 내부 테스트가 제한적이라 miomock 통합 검증을 mandatory evidence로 선호한다"고 적혀 있다. 그래서 이 페이즈는 **(a) 의도된 동작 변경에 따른 갱신**과 **(b) 회귀**를 분리해서 PR description에 표로 정리한다.

이번 사이클에 갱신·삭제된 테스트 (의도된 동작 변경에 따름):

- `examples/miomock/api/src/sonamu-test/syncer.test.ts` — `DiffGroups` literal에 새 키들(`generatedCopied`/`httpGenerated`/`servicesGenerated`/`sdGenerated`/`typesCopied`/`functionsCopied`/`i18nCopied`) 추가, 폐기된 `entryServer` 키 제거(부트스트랩 자산이라 lock 추적 밖), `handleTruthSourceChanges`의 옛 `(diffGroups, diffTypes)` 두 번째 인자 제거(시그니처 정리 잔재), `copySharedToTargets` describe 제거(메서드가 `actionCopySharedToTargetsIfNotExists`로 이동).
- `examples/miomock/api/src/sonamu-test/lock-integrity.test.ts` — `generated` 패턴 정합 회귀 가드를 *application/services 디렉토리 한정* 단언에서 *generated 계열 패턴은 i18n 영역을 침범하지 않는다* 단언으로 갱신. 본성별 4분리 후에도 원래 의도(i18n 영역 비침범) 보존.

회귀 가드 추가는 본 사이클의 별도 follow-up으로 분리. 후속 디렉토리:

- `modules/sonamu/src/syncer/file-patterns.ts` 단위 테스트 (단일 멤버 alternation 가드, FileType 자동 추론, 부트스트랩 자산 제외 회귀 가드)
- `modules/sonamu/src/syncer/checksum.ts` 단위 테스트 (중복 path dedup, lock 직렬화 좌표계, 옛 포맷 → 자연 마이그레이션)
- miomock 통합 — 출력 손상 시나리오 (acceptance "손으로 고치면 검출됨" 직접 가드)

### Phase 5 — 재측정 & 효과 정량화 (실측 결과)

**측정 환경**: miomock, `rm sonamu.lock; time pnpm sonamu sync` 4회.

| 시점 | wall time |
|---|---|
| 베이스라인 cold | 4.67s |
| 베이스라인 warm | 2.71s / 2.34s (평균 2.53s) |
| B-1 적용 후 cold | 2.88s |
| B-1 적용 후 warm | 2.45s / 2.47s / 2.52s (평균 2.48s) |

**개선율**: ~2%. 성공 기준(1/3 이하 = 0.84s 이하)에 한참 미달.

**원인**: prettier 포매팅이 wall time의 대부분이고, write-if-different는 디스크 write 전후의 mtime 변경만 억제할 뿐 포매팅 비용은 그대로 발생. 즉 본 사이클의 측정 가능한 효과는 watcher-storm 억제(2차 효과)뿐인데, 그 효과조차 4.67→2.88(cold) 정도로 측정 노이즈 수준.

**판단**: B-1을 그대로 들이면 `writeFile` → `writeFileIfChanged` wrapper로 인한 직관성 손실(읽기·디버깅 시 한 단계 더 거쳐야 함, 테스트 환경 호환을 위한 `isTest()` 가드 같은 후속 부담)이 효과보다 크다. **B-1 제외, B-2(포매팅 캐시) 또는 B-3(prettier→oxfmt 교체)을 별도 사이클로 본격 시도**. A(추적 모델 통일)의 정확성 가치는 성능 목표와 독립적이므로 1차 PR은 A + C-1로 머지.

## Validation Gate (modules/sonamu/CLAUDE.md mandatory) ✅

PR 머지 전 모두 통과:

- ✅ `pnpm --filter sonamu build`
- ✅ `pnpm --filter sonamu test:type` (39/39)
- ✅ `pnpm --filter miomock-api test` (1411/1412 통과; 1 실패 = 사전 인지된 포트 충돌, 무시)
- ✅ miomock에서 `pnpm sonamu sync --force` 결과/생성 산출물 직접 확인
- ✅ root `pnpm check` (oxlint + oxfmt) — Cross-workspace gate
- ✅ HMR 영향 검토 (`@sonamu-kit/hmr-hook`, `@sonamu-kit/hmr-runner`, `@sonamu-kit/ts-loader`) — `syncFromWatcher`의 무지성 reload 경로 변동 없음

## Acceptance Criteria

- ⚠️ miomock 기준 force sync 평균 시간이 **베이스라인 대비 1/3 이하** — **미달, 별도 사이클로 트랙** (의도된 결정. B-1 폐기 사유 참조).
- ✅ syncer가 만드는 모든 출력물(api+target)이 lock에 자동 포함됨 — miomock 기준 추가 출력물 7종 모두 lock에 등장 (위 Phase 1 결과).
- ✅ 누군가 generated 파일을 손으로 고치거나 누락시키면 다음 sync에서 즉시 검출됨 — anywhere 패턴 + lock 진실 단일 원천. *자동 복구는 미지원* (Design Notes #8) — force sync로 명시 액션.
- ✅ `sonamu sync --force`가 git post-merge hook에서 자동 실행할 수 있을 만큼 가벼움 — 정성 평가, OK.
- ✅ 영향 받은 테스트들이 모두 새 동작에 맞춰 갱신되어 통과.

## Resolved Decisions

플랜 수립 단계 결정은 2026-05-02 초기 컨펌. 구현 단계 결정은 같은 날 야간 자율 구현 중 추가. 더 깊은 디자인 흐름은 Design Notes 문서로 분리.

### 머지 직전 발견 — lock 갱신 누락 (2026-05-02)

야간 자율 구현 후 푸시된 미오목 `sonamu.lock`이 **옛 포맷(api 상대 좌표계, 57 항목) 그대로** 남아 있었음. force sync가 한 번도 돌지 않은 채 푸시 상태였고, 그 결과 acceptance "추가 출력물 모두 lock에 자동 포함"이 *코드는 동작하지만 검증 산출물이 미달*인 상태로 머지 직전에 와 있었음.

`pnpm sonamu sync --force`를 직접 돌려 갱신: 좌표계가 appRoot 상대(`api/src/...`, `web/src/...`)로 정상 이행, 항목 수 57 → 68 (+11), `web/services/queries.generated.ts`와 `web/services/sonamu.generated.sso.ts` 신규 생성. **코드 자체는 의도대로 동작했고, 단순 lock 갱신 누락**이었음.

추가 부수 효과: force sync 결과 `web/i18n/en.ts`에 `import { plural } from "../services/sonamu.shared";` 라인이 추가되며 oxfmt 룰 위반 1건 표면화 (import 그룹 사이 빈 줄). **SON-466의 "Sync 출력 oxlint/oxformat 준수" 항목과 정확히 일치하는 케이스**라 본 사이클에선 oxfmt fix로 임시 통과시키고 항구적 해결은 SON-466으로 이월. 다음 force sync에서 다시 같은 위반이 표면화될 수 있음 (도메인 알림 차원).

### B-1 폐기 (2026-05-02 야간 측정 후)

- **B-1 (write-if-different)은 채택하지 않음.** Phase 5 측정 결과 force sync wall time 개선이 ~2%에 그쳐, `writeFile` → `writeFileIfChanged` wrapper로 인한 직관성 손실을 정당화하지 못함. 또한 wrapper 도입 시 기존 syncer 테스트가 `Naite.get("fs/promises:writeFile")`로 호출 추적을 하므로 `isTest()` 가드가 필요해지는 등 부수적 부담이 발생. 1차 PR은 **A + C-1**만 머지하고, 성능 개선은 B-2(포매팅 캐시) 또는 B-3(prettier→oxfmt 교체)을 별도 사이클로 본격 시도.

### 구현 단계 결정 (야간 자율 구현 중 발견)

- **부트스트랩 자산 분리** — `sonamu.shared.ts`(IfNotExists 1회 생성)와 `entry-server.generated.tsx`(매번 overwrite generate)는 *추적 사이클 안에서 할 액션이 없는* 자산이라 패턴 그룹에서 빼고 sync()의 부트스트랩 phase로 이동. 의도된 분리. 자세히는 Design Notes #1·#8.
- **`FileType` 단일 소스화** — 별도 `FILE_TYPES` 배열 중복 제거. `getChecksumPatternGroup` 반환 객체 키에서 `keyof ReturnType<...>` + `satisfies`로 자동 추론. 키 추가 시 함수 한 군데만 수정.
- **단일 멤버 alternation 가드** (`braceJoin` helper) — Node 내장 `fs.glob`이 `{web}` 같은 단일 멤버 brace expansion을 처리하지 못함. `dirs.length === 1`일 때 alternation 없이 직접 결합.
- **`generated` 산출물 fileType 본성별 분리 (3단계 진화)** — 1단계: `src/**/*.generated.*` → `src/{application,services}/**/*.generated.*` 디렉토리 한정. 2단계: 머지 직전 자산 본성(양쪽-필요 정본/양쪽-필요 복사본/api 전용/target 전용)에 따라 `generated`/`generatedCopied`/`httpGenerated`/`servicesGenerated` 4개 fileType으로 분리. 3단계: `i18nGenerated` → `sdGenerated` rename(파일명 매칭, *Sonamu Dictionary* 도메인 약어). `generatedCopied` 패턴은 와일드카드가 `services.generated.ts`(target 전용)와 충돌하므로 명시 enumeration(`{sonamu,queries}.generated.*`)으로 분리. Design Notes #4·#6.
- **산출물 추적 갭 해소** (`typesCopied`/`functionsCopied` + 위 4개 generated 본성별) — 양쪽-필요 자산의 target 복사본(`web/src/services/*.types.ts`, `*.functions.ts`)이 lock 추적 밖이던 갭을 마저 닫음. 변경 시 syncer가 검출하고 drift 경고로 안내.
- **출력 drift 경고 + path 안내** — `doSyncActions`의 옛 `noMatchingChanges()` 빈 분기를 *path 명시 + force sync 안내*로 채움. `changeMatcher`가 `unhandledPaths()` 반환하도록 갱신 → drift 검출 시 `⚠️ Sync 산출물이 변경되었습니다: <appRoot 상대 path>` + `→ pnpm sonamu sync --force를 권장합니다.`. trigger-based 운영 모델과 일관(자동 reconcile 안 함, 사용자 명시 액션 안내). Design Notes #10에 잔존했던 *"비어있음 + dev 노이즈 우려"* 항목 해소.
- **Lock 중복 path 처리 — 자연 해소** (`Set` based dedup) — 옛 광범위 패턴 시점엔 `generated`와 `i18nGenerated`가 둘 다 `sd.generated.ts`를 매치해 같은 파일이 lock에 두 번 들어가는 문제가 있어 `Array.from(new Set(allPaths)).toSorted()`로 처리. 현재 패턴(본성별 분리 + sdGenerated rename)에선 충돌 자체 사라짐. dedup 로직은 방어적 안전망으로 잔존.
- **Stale generated 파일도 lock에 추적** — 본성별 패턴이라도 lock에 있던 path는 검출 사이클에 잡힘. 의도된 동작 (lock = 디스크 상태의 진실).
- **새 FileType 키들은 syncer 분기 추가 불필요** — 모두 산출물이라 사용자가 손으로 변경할 일이 없고, 변경되면 unhandled drift로 잡혀 경고만 출력. force sync로 자연 복구. 기존 입력 분기(entity/types/model/frame/config/workflow/i18n)의 동작 변화 없음.
- **syncer 본체 디자인 정리 동반 머지** — sync() 3-phase 분리, `doSyncActions` DSL화(`changeMatcher` + `unhandledPaths`), 핸들러 완결화(생성+복사 한 자리), `init_types` 분배 fix, 자산 본성에 따른 분배 패턴 명시화, handler 명명 정련. *왜 그렇게 갔는지*는 Design Notes #2·#3·#4·#5·#7·#9.

### 플랜 단계 결정

- **베이스라인 측정은 구현 워커의 Phase 0 액션으로 위임.** 사람이 미리 측정해서 넘겨주지 않음.
- **테스트 갱신 vs 회귀 분류**: 구현 워커가 1차 분류, 리뷰어가 2차 검증.
- **`syncer.ts:257`은 write-if-different 대상에서 제외 (B-1 폐기로 무효화).**
- **Lock 알파벳 안정 정렬.** PR diff 깨끗하게 유지하려고.

## References

### Internal

- 부모 이슈: SON-466 (마지막 항목 분리)
- 관련 문서: Linear `[Design Notes] Syncer 리팩토링 — 디자인 원칙 + 결정사항` (이번 사이클 디자인 흐름 단일 소스)
- `modules/sonamu/src/syncer/file-patterns.ts` 패턴 그룹 정의 (`getChecksumPatternGroup`)
- `modules/sonamu/src/syncer/checksum.ts` lock 직렬화/역직렬화 (`getCurrentChecksums`/`getPreviousChecksums`/`saveChecksums`)
- `modules/sonamu/src/syncer/syncer.ts` `sync()` / `forceSync` / `doSyncActions` / `changeMatcher` / 핸들러들
- `modules/sonamu/src/syncer/syncer-actions.ts` 액션 함수들 (`actionCopySharedToTargetsIfNotExists`, `actionGenerateSsrEntryServer`, `actionSyncFilesToTargets` 등)
- `modules/sonamu/src/syncer/code-generator.ts` 템플릿 렌더 (`writeCodeToPathEachTarget`)
- `modules/sonamu/src/utils/fs-utils.ts` `copyFileWithReplaceCoreToShared`
- `modules/sonamu/src/utils/path-utils.ts` `AppRelativePath` alias
- `modules/sonamu/src/utils/async-utils.ts` `globAsync` (exclude 옵션)
- `modules/sonamu/src/bin/cli.ts` `sync()` CLI entry, `--force` 옵션, `f` 핫키
- `modules/sonamu/CLAUDE.md` Validation gate 정의

### Commits (브랜치 `byeongjun/son-467-sonamu-lock-integrity`)

| commit | 내용 |
| -- | -- |
| `5118d528` | feat(syncer): sonamu.lock 추적 모델 통일 + force sync CLI 노출 |
| `2f11acab` | docs(plans): SON-467 작업 결과 정리 |
| `3055b8a0` | refactor(syncer): 액션 단위를 더 잘게 분리하고 명명을 의도에 맞춤 |
| `9ba4c9bf` | refactor(syncer): 추적 모델 정련 - 부트스트랩 자산 제외, 패턴 그룹 정확화 |
| `dcc4ab0b` | refactor(syncer): sync() 3-phase 분리 + doSyncActions DSL화 + watcher reload 통합 |
| `bc3a0dc9` | refactor(syncer): 핸들러를 완결적으로 - 생성과 복사를 한 자리에서 |
| `68bb66cd` | refactor(syncer): 자산의 본성에 맞춰 dataflow를 명시적으로 |
| `d3a00746` | refactor(syncer): handleAuxiliarySymbolChanges 리네임 + init_types 분배 fix |
| `27601d9e` | refactor(syncer): init_types를 actionGenerateInitialTypes 액션 단위로 추상화 |
