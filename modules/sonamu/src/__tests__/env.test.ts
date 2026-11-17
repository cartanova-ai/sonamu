import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyCurrentSnapshotToProcessEnv,
  ensureServerEnvironment,
  ensureSonamuEnvironment,
  readAllEnvironmentSnapshots,
  readEnvironmentSnapshot,
  resolveSonamuEnvironment,
} from "../env";

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

  it("lets environment dotenv values override common dotenv values", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(path.join(rootPath, ".env"), "SONAMU_DB_HOST=common.example.com\n");
    await writeFile(path.join(rootPath, ".env.production"), "SONAMU_DB_HOST=prod.example.com\n");

    const snapshot = readEnvironmentSnapshot(rootPath, "production");

    expect(snapshot.SONAMU_DB_HOST).toBe("prod.example.com");
    expect(snapshot.NODE_ENV).toBe("production");
  });

  it("does not let preloaded common dotenv values override environment dotenv values", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-test-"));
    tempRoots.push(rootPath);

    await writeFile(
      path.join(rootPath, ".env"),
      "SONAMU_DB_HOST=common.example.com\nSONAMU_DB_USER=common_user\n",
    );
    await writeFile(path.join(rootPath, ".env.production"), "SONAMU_DB_HOST=prod.example.com\n");

    const snapshot = readEnvironmentSnapshot(rootPath, "production", {
      SONAMU_DB_HOST: "common.example.com",
      SONAMU_DB_USER: "shell_user",
    });

    expect(snapshot.SONAMU_DB_HOST).toBe("prod.example.com");
    expect(snapshot.SONAMU_DB_USER).toBe("shell_user");
    expect(snapshot.NODE_ENV).toBe("production");
  });
});

describe("서버/빌드 환경 판정", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true, force: true })),
    );
  });

  async function createRoot(files: Record<string, string> = {}): Promise<string> {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "sonamu-env-resolve-"));
    tempRoots.push(rootPath);
    await Promise.all(
      Object.entries(files).map(([name, content]) => writeFile(path.join(rootPath, name), content)),
    );
    return rootPath;
  }

  it.each([undefined, ""])(
    "NODE_ENV가 %j이고 dotenv에도 없으면 fallback을 쓴다",
    async (nodeEnv) => {
      const rootPath = await createRoot();

      expect(resolveSonamuEnvironment(rootPath, "production", { NODE_ENV: nodeEnv })).toBe(
        "production",
      );
    },
  );

  it("런타임 NODE_ENV가 dotenv와 fallback보다 우선한다", async () => {
    const rootPath = await createRoot({ ".env": "NODE_ENV=production\n" });

    expect(resolveSonamuEnvironment(rootPath, "production", { NODE_ENV: "staging" })).toBe(
      "staging",
    );
  });

  it("런타임 NODE_ENV가 없으면 .env의 NODE_ENV로 판정한다", async () => {
    const rootPath = await createRoot({ ".env": "NODE_ENV=production\n" });

    expect(resolveSonamuEnvironment(rootPath, "development", {})).toBe("production");
  });

  it(".env.local의 NODE_ENV가 .env보다 우선한다", async () => {
    const rootPath = await createRoot({
      ".env": "NODE_ENV=production\n",
      ".env.local": "NODE_ENV=staging\n",
    });

    expect(resolveSonamuEnvironment(rootPath, "development", {})).toBe("staging");
  });

  it("dotenv의 지원하지 않는 NODE_ENV를 거부한다", async () => {
    const rootPath = await createRoot({ ".env": "NODE_ENV=preview\n" });

    expect(() => resolveSonamuEnvironment(rootPath, "production", {})).toThrow(
      'Invalid NODE_ENV "preview"',
    );
  });

  it("ensureSonamuEnvironment는 판정한 환경을 env.NODE_ENV에 기록한다", async () => {
    const rootPath = await createRoot();
    const env: NodeJS.ProcessEnv = {};

    expect(ensureSonamuEnvironment(rootPath, "production", env)).toBe("production");
    expect(env.NODE_ENV).toBe("production");
  });

  it("빌드 산출물 서버는 NODE_ENV가 없으면 production으로 판정한다", async () => {
    const rootPath = await createRoot();
    const env: NodeJS.ProcessEnv = {};

    expect(ensureServerEnvironment(rootPath, env)).toBe("production");
    expect(env.NODE_ENV).toBe("production");
  });

  it.each([{ HOT: "yes" }, { VITEST: "true" }])(
    "소스 실행(%j) 서버는 NODE_ENV가 없으면 development로 판정한다",
    async (runtimeEnv) => {
      const rootPath = await createRoot();
      const env: NodeJS.ProcessEnv = { ...runtimeEnv };

      expect(ensureServerEnvironment(rootPath, env)).toBe("development");
    },
  );

  it("빌드 산출물 서버도 명시한 NODE_ENV는 그대로 쓴다", async () => {
    const rootPath = await createRoot();

    expect(ensureServerEnvironment(rootPath, { NODE_ENV: "development" })).toBe("development");
  });

  it("applyCurrentSnapshotToProcessEnv는 .env의 NODE_ENV로 환경을 고른다", async () => {
    const rootPath = await createRoot({
      ".env": "NODE_ENV=production\n",
      ".env.production": "SONAMU_ENV_RESOLVE_PROBE=production\n",
      ".env.development": "SONAMU_ENV_RESOLVE_PROBE=development\n",
    });
    vi.stubEnv("NODE_ENV", "");
    vi.stubEnv("SONAMU_ENV_RESOLVE_PROBE", undefined);

    try {
      const snapshot = applyCurrentSnapshotToProcessEnv(rootPath);

      expect(snapshot.SONAMU_ENV_RESOLVE_PROBE).toBe("production");
      expect(process.env.NODE_ENV).toBe("production");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
