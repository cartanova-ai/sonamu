// setup-mocks.ts가 `fs/promises`를 mock해서 writeFile이 실제 디스크에 안 씀
// (Naite trace만 남김). 우리 테스트는 lock 파일을 실제 변조해야 검증이 의미를 가지므로
// mock되지 않은 `fs`의 sync 버전을 사용한다. setup-mocks는 `fs/promises`만 잡고 `fs`는 그대로.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "path";

import { Sonamu } from "sonamu";
import { bootstrap } from "sonamu/test";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { findChangedFilesUsingChecksums } from "../../../../../modules/sonamu/dist/syncer/checksum";
import { getChecksumPatternGroup } from "../../../../../modules/sonamu/dist/syncer/file-patterns";

// forTesting: true — syncer init/watcher 생략. 우리 테스트는 file-patterns/checksum
// 모듈 함수만 직접 호출하므로 syncer 인스턴스 불필요. watcher가 떠 있으면
// 테스트가 lock 파일을 변조하는 순간 자동 복원되어 검증이 무의미해짐.
bootstrap(vi, { forTesting: true });

describe("sonamu.lock 무결성 추적", () => {
  let lockPath: string;
  let lockBackup: string;

  beforeAll(async () => {
    lockPath = join(Sonamu.apiRootPath, "sonamu.lock");
    lockBackup = readFileSync(lockPath, "utf-8");
  });

  afterAll(async () => {
    writeFileSync(lockPath, lockBackup, "utf-8");
  });

  describe("패턴 그룹 정합", () => {
    // 부트스트랩 자산(sonamu.shared.ts, entry-server.generated.tsx)은 추적 사이클에서
    // 할 액션이 없는 자산이라 패턴 그룹에 없음. 회귀 가드.
    test("부트스트랩 자산은 패턴 그룹에 포함되지 않는다", () => {
      const group = getChecksumPatternGroup();
      const keys = Object.keys(group);

      expect(keys).not.toContain("entryServer");
      expect(keys).not.toContain("shared");

      const allPatterns = Object.values(group).join(" ");
      expect(allPatterns).not.toMatch(/sonamu\.shared/);
      expect(allPatterns).not.toMatch(/entry-server\.generated/);
    });

    // generated 계열 패턴은 i18n 영역을 침범하지 않아야 함. 광범위 패턴이
    // sdGenerated/i18nCopied 영역을 침범하던 문제를 정리한 결과의 회귀 가드.
    test("generated 계열 패턴은 i18n 영역을 침범하지 않는다", () => {
      const group = getChecksumPatternGroup();
      const generatedKeys = [
        "generated",
        "generatedCopied",
        "httpGenerated",
        "servicesGenerated",
      ] as const;
      for (const key of generatedKeys) {
        expect(group[key]).not.toContain("i18n");
      }
    });

    // Node 내장 fs.glob의 brace expansion은 단일 멤버 {x}를 풀지 않음.
    // miomock의 sync.targets는 ["web"] 단일 멤버라 alternation 없이 직접 결합되어야 함.
    test("단일 멤버 targets는 alternation 없이 결합된다", () => {
      const { i18nCopied } = getChecksumPatternGroup();
      expect(i18nCopied).not.toContain("{web}");
      expect(i18nCopied).toMatch(/^web\//);
    });
  });

  describe("lock 직렬화", () => {
    // appRoot 상대 좌표계로 직렬화. 옛 포맷(api 상대)에서 이행한 결과의 회귀 가드.
    test("lock의 모든 path는 appRoot 상대 좌표계 (api/ 또는 web/ prefix)", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const content = JSON.parse(readFileSync(lockPath, "utf-8")) as Array<{ path: string }>;
      expect(content.length).toBeGreaterThan(0);

      for (const entry of content) {
        expect(entry.path).toMatch(/^(api|web)\//);
      }
    });

    // 알파벳 안정 정렬 (PR diff 깨끗함 가드).
    test("lock은 알파벳 순으로 정렬되어 있다", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const content = JSON.parse(readFileSync(lockPath, "utf-8")) as Array<{ path: string }>;
      const paths = content.map((e) => e.path);
      const sorted = paths.toSorted((a, b) => a.localeCompare(b));
      expect(paths).toStrictEqual(sorted);
    });

    // 동일 파일이 여러 패턴에 매치되어도 lock에 한 번만 등장. Set 기반 dedup의 회귀 가드.
    test("lock에 동일 path가 두 번 이상 등장하지 않는다", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const content = JSON.parse(readFileSync(lockPath, "utf-8")) as Array<{ path: string }>;
      const paths = content.map((e) => e.path);
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });
  });

  describe("acceptance — 출력 손상/누락 검출", () => {
    // 옛 포맷(api 상대 path)은 새 코드에서 좌표계 mismatch를 일으켜
    // 풀-싱크 트리거 → 새 포맷 자동 갱신. 별도 마이그레이션 절차 없는 자연 복구.
    test("옛 포맷(api 상대) lock → 풀-싱크 트리거 (자연 마이그레이션)", async () => {
      const oldFormatLock = JSON.stringify(
        [
          {
            path: "src/application/account/account.entity.json",
            checksum: "deadbeef",
          },
        ],
        null,
        2,
      );

      try {
        writeFileSync(lockPath, oldFormatLock, "utf-8");
        const changed = await findChangedFilesUsingChecksums();
        expect(changed.length).toBeGreaterThan(50);
      } finally {
        writeFileSync(lockPath, lockBackup, "utf-8");
      }
    });

    // JSON 파싱 실패 시 빈 배열 반환 → 풀-싱크 트리거. checksum.ts try/catch 회귀 가드.
    test("lock JSON 손상 시 풀-싱크 트리거 (fallback)", async () => {
      try {
        writeFileSync(lockPath, "{ this is broken JSON", "utf-8");
        const changed = await findChangedFilesUsingChecksums();
        expect(changed.length).toBeGreaterThan(50);
      } finally {
        writeFileSync(lockPath, lockBackup, "utf-8");
      }
    });

    // plan acceptance: "누군가 generated 파일을 손으로 누락시키면 다음 sync에서 즉시 검출됨".
    // lock에서 항목 제거 → 디스크엔 있는데 lock엔 없음 → changed로 잡혀야.
    test("lock에 없는 추적 파일이 있으면 변경으로 검출된다 (출력 누락 acceptance)", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const original = JSON.parse(lockBackup) as Array<{ path: string; checksum: string }>;
      const targetIdx = original.findIndex((e) =>
        e.path.endsWith("services/services.generated.ts"),
      );
      // 미오목 환경에 services.generated.ts가 lock에 있어야 함 (Phase 1 결과).
      expect(targetIdx).toBeGreaterThanOrEqual(0);

      const reduced = original.filter((_, i) => i !== targetIdx);

      try {
        writeFileSync(lockPath, JSON.stringify(reduced, null, 2), "utf-8");
        const changed = await findChangedFilesUsingChecksums();
        const changedPaths = changed.map((p) => p.toString());
        expect(changedPaths.some((p) => p.endsWith("services.generated.ts"))).toBe(true);
      } finally {
        writeFileSync(lockPath, lockBackup, "utf-8");
      }
    });

    // plan acceptance: "누군가 generated 파일을 손으로 고치면 다음 sync에서 즉시 검출됨".
    // lock의 checksum을 다른 값으로 바꾸면 디스크 checksum과 mismatch → changed로 잡혀야.
    test("lock의 checksum이 디스크와 다르면 변경으로 검출된다 (출력 변조 acceptance)", async () => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const original = JSON.parse(lockBackup) as Array<{ path: string; checksum: string }>;
      const targetIdx = original.findIndex((e) =>
        e.path.endsWith("services/services.generated.ts"),
      );
      expect(targetIdx).toBeGreaterThanOrEqual(0);

      const tampered = original.map((entry, i) =>
        i === targetIdx
          ? { ...entry, checksum: "0000000000000000000000000000000000000000" }
          : entry,
      );

      try {
        writeFileSync(lockPath, JSON.stringify(tampered, null, 2), "utf-8");
        const changed = await findChangedFilesUsingChecksums();
        const changedPaths = changed.map((p) => p.toString());
        expect(changedPaths.some((p) => p.endsWith("services.generated.ts"))).toBe(true);
      } finally {
        writeFileSync(lockPath, lockBackup, "utf-8");
      }
    });
  });
});
