import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadAllEnvironmentSnapshots } from "../env";

describe("loadAllEnvironmentSnapshots", () => {
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

    const snapshots = loadAllEnvironmentSnapshots(rootPath, {
      NODE_ENV: "development",
      SONAMU_DB_PASSWORD: "shell_password",
    });

    expect(snapshots.development.SONAMU_DB_HOST).toBe("development.example.com");
    expect(snapshots.development.SONAMU_DB_PASSWORD).toBe("shell_password");
    expect(snapshots.staging.SONAMU_DB_HOST).toBe("staging.example.com");
    expect(snapshots.staging.SONAMU_DB_PASSWORD).toBe("shell_password");
    expect(snapshots.staging.SONAMU_DB_USER).toBe("base_user");
  });

  it("keeps exported environment variables over dotenv file values", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(
      path.join(rootPath, ".env.development"),
      "SONAMU_DB_HOST=file-host\nSONAMU_DB_PASSWORD=file-password\n",
    );

    const snapshots = loadAllEnvironmentSnapshots(rootPath, {
      SONAMU_DB_HOST: "runtime-host",
      SONAMU_DB_PASSWORD: "runtime-password",
    });

    expect(snapshots.development.SONAMU_DB_HOST).toBe("runtime-host");
    expect(snapshots.development.SONAMU_DB_PASSWORD).toBe("runtime-password");
    expect(snapshots.development.NODE_ENV).toBe("development");
  });
});
