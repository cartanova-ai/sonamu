---
title: sonamu.lock 신뢰성 개선 — 무결성 추적 확장
type: feat
status: active
date: 2026-05-02
issue: SON-467
parent: SON-466
---

# sonamu.lock 신뢰성 개선 — 무결성 추적 확장

> SON-467 이슈 description은 이미 spec급이라 *무엇을·왜*는 거기 다 있다. 이 플랜은 그 위에 **(a) 1차 PR 스코프 고정**, **(b) 현장 검증으로 새로 발견한 함정 반영**, **(c) 단계별 검증 절차와 미해결 질문** 세 가지를 얹는다.

## Overview

`sonamu.lock`은 syncer가 추적하는 파일들의 SHA-1 체크섬 스냅샷인데, 두 가지 한계가 있다.

- **한계 1 — 추적 패턴이 좁다**: api 한정 단일 경로로 박혀 있어서 web 등 target 산출물이 추적 밖이다. miomock에서 출력물 다수가 lock 외부에 있음.
- **한계 2 — force sync가 비싸고 CLI도 없다**: dev 서버 `f` 핫키로만 돌릴 수 있고, 비용도 무거움(prettier 포매팅 + 매번 mtime 변경 → watcher 폭풍). git hook이나 CI에서 부르기 어렵다.

이번 사이클은 이걸 **A(추적 모델 통일) + B-1(write-if-different) + C-1(force sync CLI)** 세 묶음으로 푼다. B-2(포매팅 캐시), B-3(포매터 교체)는 **재측정 보고 별도 PR로 뺀다** — 1차 스코프에서는 빠짐.

## 현장 검증 (2026-05-02)

description이 짚은 콜사이트랑 fallback 경로가 실제 코드와 맞는지 확인. **결론: 다 맞는데 한 가지 함정이 빠져 있었음.**

| description 가정 | 실제 코드 | 상태 |
|---|---|---|
| `code-generator.ts:210` template 렌더 결과 writeFile | `await writeFile(dstFilePath, pathAndCode.code)` | ✅ |
| `fs-utils.ts:86` `copyFileWithReplaceCoreToShared` 내부 writeFile | `await writeFile(toPath, newFileContent)` | ✅ |
| `syncer.ts:257` sonamu.shared.ts 복사 writeFile | `await writeFile(destPath, convertedText)` | ⚠️ **함정 발견** |
| `bin/cli.ts:268` `f` 핫키 | `--on-key=f:shell(rm ${path.join(apiRoot, "sonamu.lock")}):restart:Force restart` | ✅ |
| `checksum.ts:92-99` 파싱 실패 fallback | try/catch에서 `[]` 반환 → 풀-싱크 트리거 | ✅ |
| `getChecksumPatternGroupInAbsolutePath()` 이미 존재 | `file-patterns.ts:44-51`, 절대경로 변환만 수행 | ✅ |

### ⚠️ 함정: syncer.ts:253-255

`syncer.ts:253-255`에 `if (await exists(destPath)) continue;`가 있다. sonamu.shared.ts는 **사용자가 자유롭게 커스터마이즈하는 파일**이라 최초 1회만 생성하고 이후엔 덮어쓰지 않는 분기다. 콜사이트 좌표 자체는 `syncer.ts:257`이 맞지만, 여기에 `writeFileIfChanged`를 그냥 끼워넣으면 의미가 어긋난다 — "1회만 생성"이라는 본래 의도가 깨질 수 있음.

**대응**: 이 콜사이트는 그냥 둔다. 1회만 실행되는 자리에 "변경됐는지 비교"를 끼우는 건 어색하니까. 1차 PR의 write-if-different 적용 대상은 **`code-generator.ts:210`과 `fs-utils.ts:86` 두 곳**으로 한정. description이 말한 "3곳"은 "2곳"으로 줄어든다.

## Scope

### In scope (1차 PR)

- **A. 추적 모델 통일** — `getChecksumPatternGroup()` 함수화 + 위치 카테고리 헬퍼(`api`/`targets`/`anywhere`) + appRoot 좌표계 + glob exclude 가드. `FileType`은 함수 반환 객체 키에서 `ReturnType` + `satisfies`로 자동 추론 (별도 enum/배열 동기화 불필요).
- **C-1. `sonamu sync --force` CLI + `f` 핫키 통합** — 핫키를 `pnpm sonamu sync --force`로 변경

### B-1 (write-if-different) — 시도 후 제외

이번 사이클에서 시도했으나 **성능 효과가 미미해 채택 안 함**. 자세한 내용은 아래 "Phase 5 결과" 섹션 참조.

요지: `writeFile`을 wrapper(`writeFileIfChanged`)로 감쌀 만한 가치는 측정 가능한 watcher-storm 억제 효과가 있어야 정당화되는데, miomock 기준 force sync wall time이 베이스라인 대비 ~2% 개선에 그침 (prettier 포매팅 비용이 대부분). `writeFile`의 직관성을 포기할 이유가 없다 — 별도 사이클에서 B-2/B-3로 본격 시도.

### Out of scope (별도 사이클로 분리)

- **B-2. 포매팅 캐시** — prettier 비용이 wall time의 대부분이라 캐시가 핵심. 본격 측정 후 결정.
- **B-3. prettier → oxfmt/dprint 교체** — SON-466의 oxlint/oxformat 항목과 시너지. 출력 diff가 크니까 별도로 분리.
- **검증 모드 `--check`/`--dry-run`** — force sync가 무거워도 git hook 자동화 가치는 살아있음. 별도 검증 CLI는 가치 적음.
- **lock 백업/복구** — "lock 사라지는 건 흔한 일"이라는 운영 모델과 안 맞으니 도입 안 함

## Architecture

### A. 추적 모델 통일

```ts
// modules/sonamu/src/syncer/file-patterns.ts
export function getChecksumPatternGroup(): GlobPattern<AppRelativePath> {
  const apiDir = Sonamu.config.api.dir;
  const targetDirs = Sonamu.config.sync.targets;

  const api      = (rest: string) => `${apiDir}/${rest}`;
  const targets  = (rest: string) => `{${targetDirs.join(",")}}/${rest}`;
  const anywhere = (rest: string) => `{${apiDir},${targetDirs.join(",")}}/${rest}`;

  return {
    // 입력 (사용자 작성)
    config:    api("src/sonamu.config.ts"),
    entity:    api("src/application/**/*.entity.json"),
    frame:     api("src/application/**/*.frame.ts"),
    functions: api("src/application/**/*.functions.ts"),
    model:     api("src/application/**/*.model.ts"),
    types:     api("src/application/**/*.types.ts"),
    workflow:  api("src/application/**/*.workflow.ts"),
    i18n:      api("src/i18n/**/!(sd.generated).ts"),

    // 출력 (sonamu 생성/복사)
    generated:     anywhere("src/**/*.generated.{ts,tsx,http,sso.ts}"),
    i18nGenerated: anywhere("src/i18n/**/sd.generated.ts"),
    i18nCopied:    targets("src/i18n/**/!(sd.generated).ts"),
    entryServer:   anywhere("src/entry-server.generated.tsx"),
  };
}
```

포인트:

- 위치 카테고리 헬퍼 3개 — `api`(api 한정) / `targets`(target 한정) / `anywhere`(어디서든)
- 패턴 본문은 단일 좌표계 `src/...`로 통일
- target 추가/이름 변경해도 코드 수정 0. `Sonamu.config.sync.targets` 따라감
- **i18n은 위치에 따라 의미가 다르다** — api 안의 `ko.ts/en.ts/ja.ts`는 사용자가 작성한 입력이고, target 안의 같은 파일은 api에서 복사된 산출물이다. 그래서 입력 패턴 `i18n`은 `api`로, 산출물 패턴 `i18nCopied`는 `targets`로 따로 잡는다
- 글롭 alternation으로 의도한 디렉토리만 정확히 매치 → 와일드카드가 줄어드니까 `node_modules` 같은 데 휘말릴 위험도 거의 사라짐

같이 해야 하는 것들:

- **타입**: `AppRelativePath` template literal alias를 `path-utils.ts`에 추가. 기존 `ApiRelativePath`는 그대로 — 두 좌표계가 자연스럽게 공존.
- **Lock 포맷**: `[{ path: AppRelativePath, checksum }]` — path는 appRoot 상대, **알파벳 안정 정렬** (PR diff 깔끔하라고).
- **Lock 위치**: `<apiRoot>/sonamu.lock` 그대로 (사용자 워크플로우상 api가 home base니까).
- **Glob ignore 가드**: `globAsync(pattern, { exclude: [...] })`. 가드 값 `["**/node_modules/**", "**/dist/**", "**/build/**", "**/.turbo/**"]`. Node 내장 `fs.glob`이 `exclude` 이미 지원함.
- **마이그레이션**: 별도 절차 없음. 옛 포맷 lock은 path 좌표계가 달라져서 전부 mismatch → 풀-싱크 → 새 포맷 자동 갱신. `checksum.ts:92-99`의 try/catch fallback과 같은 자연 복구 경로 (현장 검증 완료).

### B-1. write-if-different — ❌ 시도 후 제외

원래 의도: `writeFileIfChanged` wrapper로 colsite 두 곳을 감싸 mtime 보존 → watcher 폭풍 억제. 자세한 이유는 위 Scope 섹션 + 아래 Phase 5 결과 참조.

### C-1. force sync CLI + 핫키 통합

```ts
// modules/sonamu/src/syncer/syncer.ts (Syncer 클래스 메서드 추가)
async forceSync(): Promise<void> {
  const lockPath = path.join(Sonamu.apiRootPath, "sonamu.lock");
  if (await exists(lockPath)) await unlink(lockPath);
  await this.sync();
}
```

CLI 옵션 (`bin/cli.ts:232` `sync()` 함수 확장):

- `sonamu sync` — 평소 사용. 변경 있으면 sync, 없으면 noop (기존 동작 유지)
- `sonamu sync --force` — lock 무시하고 풀-싱크. git post-merge hook 등에서 호출

핫키 통합 (`bin/cli.ts:268`):

```diff
- `--on-key=f:shell(rm ${path.join(apiRoot, "sonamu.lock")}):restart:Force restart`,
+ `--on-key=f:shell(pnpm sonamu sync --force):restart:Force sync & restart`,
```

force sync 정의가 `--force` 한 군데로 모이고, B-1의 write-if-different 효과를 핫키도 그대로 받는다. `:restart`는 유지 — dev 서버 reload는 force sync의 정상 동작이니까.

**실패 안전성**: sync 도중 프로세스 죽어서 lock 없는 상태로 남아도 무해함. 다음 sync에서 lock 없으면 자연 풀-싱크 → 새 lock 작성. 백업/복구는 안 만든다 ("lock 사라지는 건 흔한 일" 운영 모델).

## Implementation Phases

### Phase 0 — 베이스라인 측정 (구현 시작 전 필수)

**책임**: 구현 워커가 가장 먼저 한다. 측정 없이는 진행 금지.

- miomock에서 `rm api/sonamu.lock; time pnpm sonamu sync` 3회 돌려서 평균 기록
- 기록 항목: 총 wall time, prettier 포매팅 비중, writeFile 횟수, mtime 변동 파일 수
- 결과를 PR description의 "Baseline" 표에 박아둔다 — Phase 5에서 비교할 기준선

### Phase 1 — A: 추적 모델 통일

영향 파일:

- `modules/sonamu/src/syncer/file-patterns.ts` (헬퍼 도입, 입력/출력 분리, 함수화)
- `modules/sonamu/src/syncer/checksum.ts` (lock 좌표계 변경, path 변환 — `getPreviousChecksums`/`saveChecksums` 양쪽)
- `modules/sonamu/src/utils/path-utils.ts` (`AppRelativePath` alias 추가)
- `modules/sonamu/src/utils/async-utils.ts` (`globAsync`에 `exclude` 옵션 추가)

검증:

- `pnpm --filter sonamu build`
- `pnpm --filter sonamu test:type`
- miomock에서 lock 삭제 후 sync → 새 포맷 lock 확인
- 추가된 출력물 7종 (`queries.generated.ts`, `sonamu.generated.sso.ts`, `sonamu.generated.http`, `web/entry-server.generated.tsx`, `web/i18n/{ko,en,ja}.ts`, `web/i18n/sd.generated.ts`, `web/services/services.generated.ts`, `web/services/sonamu.generated.ts`)이 lock에 모두 포함되는지 grep으로 확인

### Phase 2 — B-1: write-if-different (시도 후 제외)

플랜에는 있었으나 Phase 5 측정 결과 ~2% 개선에 그쳐 **채택 안 함**. 자세한 이유는 "Phase 5 결과" 참조. wrapper 도입으로 잃는 직관성에 비해 측정 가능한 효과가 약함.

### Phase 3 — C-1: force sync CLI + 핫키 통합

영향 파일:

- `modules/sonamu/src/syncer/syncer.ts` (`forceSync` 메서드 추가)
- `modules/sonamu/src/bin/cli.ts` (`--force` 옵션 추가, `f` 핫키 변경)

검증:

- `pnpm sonamu sync --force` 동작 확인 (lock 삭제 후 sync 실행)
- 도중 프로세스 강제 종료 후 다음 `pnpm sonamu sync`가 풀-싱크로 자연 복구되는지 확인
- dev 서버에서 `f` 핫키 → force sync + restart 흐름 확인

### Phase 4 — 영향 테스트 갱신

modules/sonamu/CLAUDE.md에 "Sonamu 내부 테스트가 제한적이라 miomock 통합 검증을 mandatory evidence로 선호한다"고 적혀 있다. 그래서 이 페이즈는 **(a) 의도된 동작 변경에 따른 갱신**과 **(b) 회귀**를 분리해서 PR description에 표로 정리한다.

영향 가능성 큰 영역:

- `modules/sonamu/src/syncer/__tests__/` syncer 단위 테스트 (패턴, lock 직렬화 가정 변경)
- `miomock-api` 통합 테스트 (sonamu sync 결과에 의존)
- HMR/watcher 동작 (mtime 변동 패턴이 달라지므로 `@sonamu-kit/hmr-*` 영향)
- lock 포맷 의존 테스트 (path 좌표계 변경 직접 영향)
- CLI 핫키 동작 (`f` 키 종료/재시작 흐름)

**1차 분류**는 구현 워커가, **2차 검증**은 리뷰어가 한다. (Open Question 3 참조)

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

## Validation Gate (modules/sonamu/CLAUDE.md mandatory)

PR 머지 전 모두 통과해야 함:

- [ ] `pnpm --filter sonamu build`
- [ ] `pnpm --filter sonamu test:type`
- [ ] `pnpm --filter miomock-api test` (mandatory integration evidence)
- [ ] miomock에서 `pnpm sonamu sync --force` 결과/생성 산출물 직접 확인
- [ ] root `pnpm check` (oxlint + oxfmt) — Cross-workspace gate
- [ ] HMR 영향 검토 (`@sonamu-kit/hmr-hook`, `@sonamu-kit/hmr-runner`, `@sonamu-kit/ts-loader`)

## Acceptance Criteria

- [ ] miomock 기준 force sync 평균 시간이 **베이스라인 대비 1/3 이하**
- [ ] syncer가 만드는 모든 출력물(api+target)이 lock에 자동 포함됨 — miomock 기준 추가 출력물 7종 모두 lock에 등장
- [ ] 누군가 generated 파일을 손으로 고치거나 누락시키면 다음 sync에서 즉시 검출됨 (수동 시나리오 테스트)
- [ ] `sonamu sync --force`가 git post-merge hook에서 매 pull 후 자동 실행할 수 있을 만큼 가벼움 (정성 평가)
- [ ] 영향 받은 테스트들이 모두 새 동작에 맞춰 갱신되어 통과
- [ ] PR description에 Baseline / After 측정 표, 그리고 갱신 vs 회귀 테스트 분류 표 포함

## Resolved Decisions

플랜 수립 단계 결정은 2026-05-02 초기 컨펌, 구현 결정은 같은 날 야간 자율 구현 중 추가.

### B-1 폐기 (2026-05-02 야간 측정 후)

- **B-1 (write-if-different)은 채택하지 않음.** Phase 5 측정 결과 force sync wall time 개선이 ~2%에 그쳐, `writeFile` → `writeFileIfChanged` wrapper로 인한 직관성 손실을 정당화하지 못함. 또한 wrapper 도입 시 기존 syncer 테스트가 `Naite.get("fs/promises:writeFile")`로 호출 추적을 하므로 `isTest()` 가드가 필요해지는 등 부수적 부담이 발생. 1차 PR은 **A + C-1**만 머지하고, 성능 개선은 B-2(포매팅 캐시) 또는 B-3(prettier→oxfmt 교체)을 별도 사이클로 본격 시도.

### 구현 단계 결정 (야간 자율 구현 중 발견)

- **`FileType` 단일 소스화** — `FILE_TYPES` 배열 중복 제거. `getChecksumPatternGroup` 반환 객체 키에서 `ReturnType` + `satisfies`로 자동 추론. 키 추가 시 함수 한 군데만 수정.
- **단일 멤버 alternation 가드** (`braceJoin` helper) — Node 내장 `fs.glob`이 `{web}` 같은 단일 멤버 brace expansion을 처리하지 못함. `dirs.length === 1`일 때 alternation 없이 직접 결합.
- **Lock 중복 path 제거** (`Set` based dedup) — `generated`(`*.generated.{ts,tsx,http,sso.ts}`)와 `i18nGenerated`(`**/sd.generated.ts`) 패턴이 둘 다 `sd.generated.ts`를 매치 → 같은 파일이 lock에 두 번 들어감. `getCurrentChecksums`에서 `Array.from(new Set(allPaths)).toSorted()`로 unique 처리.
- **Stale generated 파일도 lock에 추적** — anywhere 패턴이 광범위해서 syncer가 더 이상 만들지 않는 stale 파일도 자동 추적됨. 의도된 동작 (lock = 디스크 상태의 진실).
- **새 FileType 키(`i18nCopied`, `entryServer`, `i18nGenerated`)는 syncer 분기 추가 불필요** — 모두 산출물이라 사용자가 손으로 변경할 일이 없고, 변경되면 lock mismatch → 풀-싱크 → 다시 생성/복사로 자연 복구. 기존 분기(entity/types/model/frame/config/workflow/i18n/generated)의 동작에는 변화 없음.

### 플랜 단계 결정

- **베이스라인 측정은 구현 워커의 Phase 0 액션으로 위임.** 사람이 미리 측정해서 넘겨주지 않음.
- **테스트 갱신 vs 회귀 분류**: 구현 워커가 1차 분류, 리뷰어가 2차 검증.
- **`syncer.ts:257`은 write-if-different 대상에서 제외 (B-1 폐기로 무효화).**
- **Lock 알파벳 안정 정렬.** PR diff 깨끗하게 유지하려고.

## References

### Internal

- 부모 이슈: SON-466 (마지막 항목 분리)
- `modules/sonamu/src/syncer/file-patterns.ts:14-29` 현재 `checksumPatternGroup` 정의
- `modules/sonamu/src/syncer/checksum.ts:78-100` `getPreviousChecksums` + 파싱 fallback
- `modules/sonamu/src/syncer/code-generator.ts:196-218` `writeCodeToPathEachTarget`
- `modules/sonamu/src/utils/fs-utils.ts:60-88` `copyFileWithReplaceCoreToShared`
- `modules/sonamu/src/syncer/syncer.ts:245-263` sonamu.shared.ts 복사 (1회 생성 분기 ⚠️)
- `modules/sonamu/src/bin/cli.ts:232-234` `sync()` CLI entry
- `modules/sonamu/src/bin/cli.ts:268` `f` 핫키 정의
- `modules/sonamu/CLAUDE.md` Validation gate 정의
