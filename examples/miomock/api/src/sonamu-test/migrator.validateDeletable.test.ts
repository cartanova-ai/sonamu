import { Migrator } from "sonamu";
import type { MigrationStatus } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

bootstrap(vi, { forTesting: false });

describe("Migrator - validateDeletableCodes", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  const mockConns = [
    {
      status: 0,
      pending: [
        "20251206_add_column1[pending]",
        "20251206_alter_column2[pending]",
        "20251206_drop_column3[pending]",
      ],
    },
  ] as MigrationStatus["conns"];

  test("pending 상태인 파일은 검증 통과", () => {
    const result = migrator.validateDeletable(mockConns, [
      "20251206_add_column1[pending]",
      "20251206_alter_column2[pending]",
      "20251206_drop_column3[pending]",
    ]);

    expect(result.canDelete).toBe(true);
    expect(result.appliedCodes).toEqual([]);
  });

  test("applied 상태인 파일은 검증 불가", () => {
    const result = migrator.validateDeletable(mockConns, ["20251206_add_column1[applied]"]);

    expect(result.canDelete).toBe(false);
    expect(result.appliedCodes).toEqual(["20251206_add_column1[applied]"]);
  });

  test("mixed - 일부만 pending 상태인 경우", () => {
    const result = migrator.validateDeletable(mockConns, [
      "20251206_add_column1[applied]",
      "20251206_alter_column2[pending]",
    ]);

    expect(result.canDelete).toBe(false);
    expect(result.appliedCodes).toEqual(["20251206_add_column1[applied]"]);
  });

  test("여러 DB 중 하나라도 applied 상태인 경우", () => {
    const multiConns = [
      {
        status: 0,
        pending: ["20251206_add_column1[pending]"],
      },
      {
        status: 0,
        pending: [],
      }, // 여기선 applied
    ] as MigrationStatus["conns"];

    const result = migrator.validateDeletable(multiConns, ["20251206_add_column1[pending]"]);

    expect(result.canDelete).toBe(false);
    expect(result.appliedCodes).toEqual(["20251206_add_column1[pending]"]);
  });
});
