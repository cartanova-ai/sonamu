import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type DatabaseConfig, type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type SonamuDBConfig, type SonamuDBPreset } from "../../database/db";
import { setSDConfig } from "../../dict/sd";
import { type MigrationResult, Migrator } from "../../migration/migrator";
import { type MigrationConnectionStatus, type MigrationTarget } from "../../migration/types";
import { registerMigrationsApi } from "../migrations-api";
import { createConfig, createDBConfig, setupSonamu } from "./ui-test-helpers";

// 운영 자격증명이 있는 dev 머신처럼 production preset이 원격 운영 DB를 가리키게 둡니다.
// 테스트는 이 주소에 연결하지 않으며, 연결을 시도하면 거부 대신 타임아웃이 나므로 회귀가 드러납니다.
function presetConfig(preset: SonamuDBPreset): DatabaseConfig {
  return {
    client: "postgresql",
    connection: preset.startsWith("production")
      ? { host: "prod-db.invalid", user: "prod_user", database: "app_production" }
      : { host: "localhost", database: preset },
  };
}

const dbConfig: SonamuDBConfig = {
  test: presetConfig("test"),
  fixture: presetConfig("fixture"),
  development: presetConfig("development"),
  staging: presetConfig("staging"),
  production: presetConfig("production"),
  test_readonly: presetConfig("test_readonly"),
  development_readonly: presetConfig("development_readonly"),
  staging_readonly: presetConfig("staging_readonly"),
  production_readonly: presetConfig("production_readonly"),
};

const config: SonamuConfig = {
  projectName: "sonamu-test",
  api: { dir: "src", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en"] },
  sync: { targets: [] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
};

const PENDING_FILE = "20260101000000_create__posts";
const APPLIED_FILE = "20251201000000_create__users";

type SlackCall = { url: string; body: string };

/** Slack API를 흉내 내고 호출 내역과 승인 상태를 조절할 수 있는 fetch 대역입니다. */
function stubSlack() {
  const calls: SlackCall[] = [];
  const state = { approved: false, nextTs: 1 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      calls.push({ url: input, body });
      if (input.startsWith("https://slack.com/api/reactions.get")) {
        return Response.json({
          ok: true,
          message: {
            reactions: state.approved ? [{ name: "white_check_mark", users: ["U1"] }] : [],
          },
        });
      }
      const ts = `${state.nextTs}.000100`;
      state.nextTs += 1;
      return Response.json({ ok: true, channel: "C123", ts });
    }),
  );
  const posted = () =>
    calls
      .filter(({ url }) => url === "https://slack.com/api/chat.postMessage")
      .map(({ body }) => body);
  return { calls, state, posted };
}

function readyStatus(connKey: MigrationTarget): MigrationConnectionStatus {
  return {
    connKey,
    currentVersion: APPLIED_FILE,
    status: 1,
    pending: [PENDING_FILE],
    latencyMs: 1,
  };
}

describe("Sonamu UI 마이그레이션 API의 production 대상 제외", () => {
  const originalEnv = { ...process.env };
  let server: FastifyInstance;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    Sonamu.dbConfig = dbConfig;
    Sonamu.config = config;
    setSDConfig(config.i18n);
    server = Fastify();
    await registerMigrationsApi(server);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("커넥션 목록에 production이 없고 운영 DB 접속 정보도 노출하지 않는다", async () => {
    const response = await server.inject({ method: "GET", url: "/api/migrations/connections" });

    expect(response.statusCode).toBe(200);
    const body: { connections: { connKey: string }[] } = response.json();
    // SON-620의 UI 허용 목록이 staging도 제외하므로 개발용 DB만 남습니다.
    expect(body.connections.map(({ connKey }) => connKey)).toEqual([
      "test",
      "fixture",
      "development",
    ]);
    expect(response.body).not.toContain("prod-db.invalid");
  });

  it.each([
    "/api/migrations/apply",
    "/api/migrations/rollback",
    "/api/migrations/request-approval",
  ])("%s는 production 대상을 400으로 거부한다", async (url) => {
    const response = await server.inject({
      method: "POST",
      url,
      payload: { targets: ["production"] },
    });

    expect(response.statusCode).toBe(400);
  });

  it("레거시 runAction 경로도 production 대상을 거부한다", async () => {
    const responses = await Promise.all(
      (["apply", "rollback"] as const).map((action) =>
        server.inject({
          method: "POST",
          url: "/api/migrations/runAction",
          payload: { action, targets: ["production"] },
        }),
      ),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(400);
    }
  });

  it("production 단일 상태 조회와 비교 코드 조회는 DB 연결 전에 실패한다", async () => {
    const responses = await Promise.all([
      server.inject({ method: "GET", url: "/api/migrations/status?connKey=production" }),
      server.inject({
        method: "GET",
        url: "/api/migrations/prepared-codes?compareConnKey=production",
      }),
      server.inject({
        method: "POST",
        url: "/api/migrations/generatePreparedCodes",
        payload: { compareConnKey: "production" },
      }),
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.body).toContain("Migration target is not allowed");
    }
  });
});

// 이 describe는 Migrator.prototype 스파이를 복원하지 않으므로 실제 Migrator로 거부를 확인하는 위 describe보다 뒤에 둡니다.
describe("Sonamu UI 마이그레이션 API", () => {
  let app: ReturnType<typeof Fastify>;
  let cleanup: () => Promise<void>;
  const applySpy = vi.spyOn(Migrator.prototype, "apply");
  const rollbackSpy = vi.spyOn(Migrator.prototype, "rollback");

  async function start(options: { slackTargets?: MigrationTarget[]; remoteDevelopment?: boolean }) {
    ({ cleanup } = await setupSonamu(
      createConfig(options.slackTargets),
      createDBConfig(
        options.remoteDevelopment === true ? { development: "db.internal.example" } : {},
      ),
    ));
    app = Fastify();
    await registerMigrationsApi(app);
  }

  beforeEach(() => {
    vi.spyOn(Migrator.prototype, "getConnectionStatus").mockImplementation(async (connKey) =>
      readyStatus(connKey),
    );
    vi.spyOn(Migrator.prototype, "getLatestAppliedBatch").mockResolvedValue({
      batchNo: 3,
      files: [APPLIED_FILE],
    });
    const result = (targets: MigrationTarget[], files: string[]): MigrationResult =>
      targets.map((connKey) => ({ connKey, batchNo: 3, applied: files }));
    applySpy.mockImplementation(async (targets) => result(targets, [PENDING_FILE]));
    rollbackSpy.mockImplementation(async (targets) => result(targets, [APPLIED_FILE]));
  });

  afterEach(async () => {
    await app.close();
    await cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("운영 계열 DB 대상 거부", () => {
    beforeEach(async () => {
      await start({});
    });

    it("연결 목록에 staging·production을 노출하지 않는다", async () => {
      const res = await app.inject({ method: "GET", url: "/api/migrations/connections" });

      expect(res.statusCode).toBe(200);
      expect(res.json().connections.map(({ connKey }: { connKey: string }) => connKey)).toEqual([
        "test",
        "fixture",
        "development",
      ]);
    });

    it.each([
      ["/api/migrations/rollback", { targets: ["production"] }],
      ["/api/migrations/rollback", { targets: ["test", "staging"] }],
      ["/api/migrations/apply", { targets: ["production"] }],
      ["/api/migrations/request-approval", { targets: ["production"] }],
      ["/api/migrations/runAction", { action: "rollback", targets: ["production"] }],
      ["/api/migrations/runAction", { action: "apply", targets: ["staging"] }],
      ["/api/migrations/rollback", { targets: "production" }],
    ])("%s 요청이 %j 이면 400으로 거부하고 실행하지 않는다", async (url, payload) => {
      const res = await app.inject({ method: "POST", url, payload });

      expect(res.statusCode).toBe(400);
      expect(applySpy).not.toHaveBeenCalled();
      expect(rollbackSpy).not.toHaveBeenCalled();
    });

    it("허용된 로컬 DB는 승인 설정이 없으면 바로 rollback한다", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/migrations/rollback",
        payload: { targets: ["test"] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('"type":"complete"');
      expect(rollbackSpy).toHaveBeenCalledWith(["test"], expect.anything());
    });
  });

  describe("rollback 승인", () => {
    beforeEach(async () => {
      await start({ slackTargets: ["development"], remoteDevelopment: true });
    });

    it("승인 요청 없이 승인 대상 DB를 rollback하면 거부한다", async () => {
      const slack = stubSlack();

      const res = await app.inject({
        method: "POST",
        url: "/api/migrations/rollback",
        payload: { targets: ["development"] },
      });

      expect(res.statusCode).toBe(400);
      expect(rollbackSpy).not.toHaveBeenCalled();
      expect(slack.posted()).toHaveLength(0);
    });

    it("rollback 승인 요청을 보내고 승인된 뒤에만 rollback한다", async () => {
      const slack = stubSlack();

      const requested = await app.inject({
        method: "POST",
        url: "/api/migrations/request-approval",
        payload: { targets: ["development"], action: "rollback" },
      });
      expect(requested.json()).toMatchObject({ type: "pending", channel: "C123" });
      expect(slack.posted()[0]).toContain("롤백 승인 요청");
      expect(slack.posted()[0]).toContain(`[rollback:development#3] ${APPLIED_FILE}`);

      const whilePending = await app.inject({
        method: "POST",
        url: "/api/migrations/rollback",
        payload: { targets: ["development"] },
      });
      expect(whilePending.statusCode).toBe(400);
      expect(rollbackSpy).not.toHaveBeenCalled();

      slack.state.approved = true;
      const approved = await app.inject({
        method: "POST",
        url: "/api/migrations/rollback",
        payload: { targets: ["development"] },
      });
      expect(approved.statusCode).toBe(200);
      expect(approved.body).toContain('"type":"complete"');
      expect(rollbackSpy).toHaveBeenCalledTimes(1);
      expect(slack.posted().at(-1)).toContain("롤백 완료");
    });

    it("apply 승인으로는 rollback을 실행할 수 없다", async () => {
      const slack = stubSlack();
      await app.inject({
        method: "POST",
        url: "/api/migrations/request-approval",
        payload: { targets: ["development"] },
      });
      slack.state.approved = true;

      const res = await app.inject({
        method: "POST",
        url: "/api/migrations/rollback",
        payload: { targets: ["development"] },
      });

      expect(res.statusCode).toBe(400);
      expect(rollbackSpy).not.toHaveBeenCalled();
    });

    it("이전 runAction rollback도 승인 요청만 만들고 실행하지 않는다", async () => {
      const slack = stubSlack();

      const res = await app.inject({
        method: "POST",
        url: "/api/migrations/runAction",
        payload: { action: "rollback", targets: ["development"], force: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ type: "pending" });
      expect(rollbackSpy).not.toHaveBeenCalled();
      expect(slack.posted()[0]).toContain("롤백 승인 요청");
    });
  });

  describe("--deploy 모드(SONAMU_DEPLOY=yes)", () => {
    const originalDeployEnv = process.env.SONAMU_DEPLOY;

    afterEach(() => {
      if (originalDeployEnv === undefined) {
        delete process.env.SONAMU_DEPLOY;
      } else {
        process.env.SONAMU_DEPLOY = originalDeployEnv;
      }
    });

    it("연결 목록에 staging·production을 노출하고 readonly는 계속 제외한다", async () => {
      process.env.SONAMU_DEPLOY = "yes";
      await start({});

      const res = await app.inject({ method: "GET", url: "/api/migrations/connections" });

      expect(res.statusCode).toBe(200);
      expect(res.json().connections.map(({ connKey }: { connKey: string }) => connKey)).toEqual([
        "test",
        "fixture",
        "development",
        "staging",
        "production",
      ]);
    });

    it("staging과 production 대상의 apply·rollback을 허용한다", async () => {
      process.env.SONAMU_DEPLOY = "yes";
      await start({});

      const applyRes = await app.inject({
        method: "POST",
        url: "/api/migrations/apply",
        payload: { targets: ["staging", "production"] },
      });
      const rollbackRes = await app.inject({
        method: "POST",
        url: "/api/migrations/rollback",
        payload: { targets: ["staging"] },
      });

      expect(applyRes.statusCode).toBe(200);
      expect(applyRes.body).toContain('"type":"complete"');
      expect(applySpy).toHaveBeenCalledWith(["staging", "production"], expect.anything());
      expect(rollbackRes.statusCode).toBe(200);
      expect(rollbackRes.body).toContain('"type":"complete"');
      expect(rollbackSpy).toHaveBeenCalledWith(["staging"], expect.anything());
    });

    it("deploy 모드에서도 원격 production 승인 설정이 있으면 승인 없이 실행할 수 없다", async () => {
      process.env.SONAMU_DEPLOY = "yes";
      // production은 createDBConfig에서 로컬이므로 원격 호스트를 지정해 승인 경로를 검증합니다.
      ({ cleanup } = await setupSonamu(
        createConfig(["production"]),
        createDBConfig({ production: "prod-db.internal.example" }),
      ));
      app = Fastify();
      await registerMigrationsApi(app);
      const slack = stubSlack();

      const res = await app.inject({
        method: "POST",
        url: "/api/migrations/apply",
        payload: { targets: ["production"] },
      });

      expect(res.statusCode).toBe(400);
      expect(applySpy).not.toHaveBeenCalled();
      expect(slack.calls).toHaveLength(0);
    });

    it.each(["", "no", "true", "1"])(
      "SONAMU_DEPLOY=%j 는 deploy 모드로 인정하지 않아 staging·production을 숨긴다",
      async (value) => {
        process.env.SONAMU_DEPLOY = value;
        await start({});

        const res = await app.inject({ method: "GET", url: "/api/migrations/connections" });

        expect(res.statusCode).toBe(200);
        expect(res.json().connections.map(({ connKey }: { connKey: string }) => connKey)).toEqual([
          "test",
          "fixture",
          "development",
        ]);
      },
    );
  });
});
