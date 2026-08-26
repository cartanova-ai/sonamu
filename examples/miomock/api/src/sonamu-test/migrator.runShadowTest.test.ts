import { Migrator, type MigrationProgressEvent } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi, { forTesting: false });

describe("Migrator - runShadowTest", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  test(
    "Shadow DB 생성 및 마이그레이션 테스트 결과 확인",
    async () => {
      const progressEvents: MigrationProgressEvent[] = [];

      // when
      const result = await migrator.runShadowTest({
        onProgress: (event) => {
          progressEvents.push(event);

          // 진행률 observer 오류가 이미 시작한 마이그레이션과 정리를 중단하면 안 됩니다.
          if (event.type === "target-complete") {
            throw new Error("의도적인 진행률 observer 오류");
          }
        },
      });

      expect(result[0]).toMatchObject({
        applied: expect.any(Array),
        batchNo: expect.any(Number),
        connKey: "shadow",
      });
      expect(progressEvents.at(-1)).toEqual({
        type: "target-complete",
        action: "shadow",
        connKey: "shadow",
        batchNo: result[0]?.batchNo,
        files: result[0]?.applied,
      });
    },
    {
      timeout: 0,
    },
  );
});
