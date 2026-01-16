import { Migrator } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi, { forTesting: false });

describe("Migrator - runShadowTest", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  test("Shadow DB 생성 및 마이그레이션 테스트 결과 확인", async () => {
    // when
    const result = await migrator.runShadowTest();

    expect(result[0]).toMatchObject({
      applied: expect.any(Array),
      batchNo: expect.any(Number),
      connKey: "shadow",
    });
  });
});
