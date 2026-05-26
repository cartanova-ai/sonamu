import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readAllEnvironmentSnapshots, readEnvironmentSnapshot } from "../env";

describe("readAllEnvironmentSnapshots", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  it("does not reuse the current environment dotenv values as other environments' base values", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await mkdir(rootPath, { recursive: true });
    await writeFile(path.join(rootPath, ".env"), "SONAMU_DB_USER=base_user\n");
    await writeFile(
      path.join(rootPath, ".env.development"),
      "SONAMU_DB_HOST=development.example.com\nSONAMU_DB_PASSWORD=development_password\n",
    );
    await writeFile(path.join(rootPath, ".env.staging"), "SONAMU_DB_HOST=staging.example.com\n");

    const snapshots = readAllEnvironmentSnapshots(rootPath, {
      NODE_ENV: "development",
      SONAMU_DB_PASSWORD: "shell_password",
    });

    expect(snapshots.development.SONAMU_DB_HOST).toBe("development.example.com");
    expect(snapshots.development.SONAMU_DB_PASSWORD).toBe("shell_password");
    expect(snapshots.staging.SONAMU_DB_HOST).toBe("staging.example.com");
    expect(snapshots.staging.SONAMU_DB_PASSWORD).toBe("shell_password");
    expect(snapshots.staging.SONAMU_DB_USER).toBe("base_user");
  });

  it("throws when both common and environment dotenv files are missing", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(path.join(rootPath, ".env.local"), "SONAMU_DB_HOST=local.example.com\n");

    expect(() => readAllEnvironmentSnapshots(rootPath)).toThrow(
      /Missing Sonamu dotenv file.*\.env.*\.env\.test/,
    );
  });

  it("allows environment snapshots when only the common dotenv file exists", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(path.join(rootPath, ".env"), "SONAMU_DB_HOST=common.example.com\n");

    const snapshots = readAllEnvironmentSnapshots(rootPath);

    expect(snapshots.development.SONAMU_DB_HOST).toBe("common.example.com");
    expect(snapshots.production.SONAMU_DB_HOST).toBe("common.example.com");
  });

  it("allows an environment snapshot when only the environment dotenv file exists", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(path.join(rootPath, ".env.development"), "SONAMU_DB_HOST=dev.example.com\n");

    const snapshot = readEnvironmentSnapshot(rootPath, "development");

    expect(snapshot.SONAMU_DB_HOST).toBe("dev.example.com");
  });

  it("keeps exported environment variables over dotenv file values", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(
      path.join(rootPath, ".env.development"),
      "SONAMU_DB_HOST=file-host\nSONAMU_DB_PASSWORD=file-password\n",
    );

    const snapshot = readEnvironmentSnapshot(rootPath, "development", {
      SONAMU_DB_HOST: "runtime-host",
      SONAMU_DB_PASSWORD: "runtime-password",
    });

    expect(snapshot.SONAMU_DB_HOST).toBe("runtime-host");
    expect(snapshot.SONAMU_DB_PASSWORD).toBe("runtime-password");
    expect(snapshot.NODE_ENV).toBe("development");
  });
});
