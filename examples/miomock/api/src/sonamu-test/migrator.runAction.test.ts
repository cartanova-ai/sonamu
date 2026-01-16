import { Migrator, Naite } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi, { forTesting: false });

describe.skip("Migrator - runAction", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  describe("apply", () => {
    test("단일(test)DB에 마이그레이션 적용", async () => {
      // apply 실행 (test DB)
      const result = await migrator.runAction("apply", ["test"]);
      expect(Naite.get("migrator:runAction:action").first()).toBe("apply");
      expect(Naite.get("migrator:runAction:targets").first()).toEqual(["test"]);

      // then
      expect(result[0]?.connKey).toBe("test");
      expect(result[0]?.batchNo).toBe(3);
    });

    test("다중 DB 동시 적용", async () => {
      // when: 여러 DB에 병렬 적용, 각 DB별 독립적 결과
      const result = await migrator.runAction("apply", [
        "test",
        "fixture",
        "development_master",
        "production_master",
      ]);

      // development와 production은 동일한 DB를 가리키고 있기 때문에 총 3개의 DB가 적용되어야 함
      expect(result).toHaveLength(3);
      expect(result[0]?.connKey).toBe("test");
      expect(result[0]?.batchNo).toBeGreaterThan(1);

      expect(result[1]?.connKey).toBe("fixture_remote");
      expect(result[1]?.batchNo).toBeGreaterThan(1);

      expect(result[2]?.connKey).toBe("development_master");
      expect(result[2]?.batchNo).toBeGreaterThan(1);
    });
  });
});
