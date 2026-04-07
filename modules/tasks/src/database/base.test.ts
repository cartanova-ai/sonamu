import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { createMigrationSource } from "./base";

describe("createMigrationSource", () => {
  test("preserves emitted migration filenames for knex identity", async () => {
    const migrationsDir = await mkdtemp(path.join(tmpdir(), "sonamu-tasks-migrations-"));

    try {
      await Promise.all([
        writeFile(
          path.join(migrationsDir, "20251212000000_0_init.js"),
          "export const up = async () => {}; export const down = async () => {};",
        ),
        writeFile(path.join(migrationsDir, "20251212000000_0_init.d.ts"), "export {};"),
        writeFile(
          path.join(migrationsDir, "20251212000000_1_tables.ts"),
          "export const up = async () => {}; export const down = async () => {};",
        ),
        writeFile(path.join(migrationsDir, "20251212000000_2_fk.js.map"), "{}"),
      ]);

      const migrationSource = createMigrationSource(migrationsDir);
      const migrations = await migrationSource.getMigrations([]);

      expect(migrations.map((migration) => migration.fileName)).toStrictEqual([
        "20251212000000_0_init.js",
        "20251212000000_1_tables.ts",
      ]);
      expect(
        migrations.map((migration) => migrationSource.getMigrationName(migration)),
      ).toStrictEqual(["20251212000000_0_init.js", "20251212000000_1_tables.ts"]);
    } finally {
      await rm(migrationsDir, { recursive: true, force: true });
    }
  });
});
