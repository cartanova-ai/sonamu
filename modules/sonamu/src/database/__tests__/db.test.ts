import { afterEach, describe, expect, it } from "vitest";

import { type EnvironmentSnapshots } from "../../env";
import { DBClass, DEFAULT_STATEMENT_TIMEOUT_MS, withDefaultStatementTimeout } from "../db";

describe("DBClass.generateDBConfig", () => {
  const originalEnv = { ...process.env };
  const emptySnapshots: EnvironmentSnapshots = {
    test: {},
    development: {},
    staging: {},
    production: {},
  };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("keeps defaultOptions.connection values when matching SONAMU_DB env vars are absent", () => {
    delete process.env.SONAMU_DB_HOST;
    delete process.env.SONAMU_DB_PORT;
    delete process.env.SONAMU_DB_USER;
    delete process.env.SONAMU_DB_PASSWORD;
    delete process.env.SONAMU_DB_NAME;

    const dbConfig = new DBClass().generateDBConfig(
      {
        database: "pg",
        defaultOptions: {
          connection: {
            host: "default-host",
            port: 15432,
            user: "default-user",
            password: "default-password",
          },
        },
      },
      "Miomock",
    );

    expect(dbConfig.development!.connection).toMatchObject({
      host: "default-host",
      port: 15432,
      user: "default-user",
      password: "default-password",
      database: "miomock_development",
    });
  });

  it("derives database names from projectName even when defaultOptions.connection.database is set", () => {
    const dbConfig = new DBClass().generateDBConfig(
      {
        database: "pg",
        defaultOptions: {
          connection: {
            database: "legacy_database",
          },
        },
      },
      "Miomock",
      emptySnapshots,
    );

    expect(dbConfig.development!.connection).toMatchObject({
      database: "miomock_development",
    });
    expect(dbConfig.production!.connection).toMatchObject({
      database: "miomock_production",
    });
  });

  it("fails fast when legacy database.name or database.environments keys are present", () => {
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const legacyConfig = {
      database: "pg",
      name: "miomock",
      environments: {
        production: {},
      },
    } as Parameters<DBClass["generateDBConfig"]>[0];

    expect(() => new DBClass().generateDBConfig(legacyConfig, "Miomock")).toThrow(
      /database\.name and database\.environments were removed/,
    );
  });

  it("lets readonly env vars override only the readonly connection fields", () => {
    process.env.SONAMU_DB_HOST = "writer-host";
    process.env.SONAMU_DB_USER = "writer-user";
    process.env.SONAMU_DB_PASSWORD = "writer-password";
    process.env.SONAMU_DB_READONLY_HOST = "readonly-host";

    const dbConfig = new DBClass().generateDBConfig(
      {
        database: "pg",
        defaultOptions: {
          connection: {
            port: 15432,
          },
        },
      },
      "Miomock",
    );

    expect(dbConfig.development_readonly!.connection).toMatchObject({
      host: "readonly-host",
      port: 15432,
      user: "writer-user",
      password: "writer-password",
      database: "miomock_development",
    });
  });

  it("does not let current process connection values leak into other environment snapshots", () => {
    const dbConfig = new DBClass().generateDBConfig(
      {
        database: "pg",
        defaultOptions: {
          connection: {
            host: "development-host",
            port: 15432,
            user: "development-user",
            password: "development-password",
            ssl: true,
          },
        },
      },
      "Miomock",
      {
        ...emptySnapshots,
        staging: {
          SONAMU_DB_HOST: "staging-host",
        },
      },
    );

    expect(dbConfig.staging!.connection).toMatchObject({
      host: "staging-host",
      port: 5432,
      user: "postgres",
      database: "miomock_staging",
      ssl: true,
    });
    expect(dbConfig.staging!.connection).not.toMatchObject({
      password: "development-password",
    });
  });

  it("does not reuse SONAMU_DB_NAME as the fixture database name", () => {
    const dbConfig = new DBClass().generateDBConfig(
      {
        database: "pg",
        defaultOptions: {},
      },
      "Miomock",
      {
        ...emptySnapshots,
        test: {
          SONAMU_DB_NAME: "miomock_test",
        },
      },
    );

    expect(dbConfig.test!.connection).toMatchObject({
      database: "miomock_test",
    });
    expect(dbConfig.fixture!.connection).toMatchObject({
      database: "miomock_fixture",
    });
  });
});

describe("withDefaultStatementTimeout", () => {
  it("connection.options에 세션 수준 statement_timeout을 넣는다", () => {
    const config = withDefaultStatementTimeout({ client: "pg", connection: { host: "h" } });

    expect(config.connection).toEqual({
      host: "h",
      options: `-c statement_timeout=${DEFAULT_STATEMENT_TIMEOUT_MS}`,
    });
  });

  it("기존 connection.options는 유지하고 뒤에 둔다", () => {
    const config = withDefaultStatementTimeout(
      { client: "pg", connection: { options: "-c search_path=app" } },
      500,
    );

    expect(config.connection).toEqual({
      options: "-c statement_timeout=500 -c search_path=app",
    });
  });

  it("사용자가 statement_timeout을 지정했으면 덮어쓰지 않는다", () => {
    const byField = { client: "pg", connection: { statement_timeout: false as const } };
    const byOptions = { client: "pg", connection: { options: "-c statement_timeout=0" } };

    expect(withDefaultStatementTimeout(byField)).toBe(byField);
    expect(withDefaultStatementTimeout(byOptions)).toBe(byOptions);
  });

  it("잘못된 타임아웃 값은 거부한다", () => {
    expect(() => withDefaultStatementTimeout({ client: "pg", connection: {} }, Number.NaN)).toThrow(
      "Invalid statement timeout",
    );
    expect(() => withDefaultStatementTimeout({ client: "pg", connection: {} }, 0)).toThrow(
      "Invalid statement timeout",
    );
  });
});

describe("DBClass.getDB 런타임 풀 statement_timeout", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("요청 처리용 w/r 풀에만 기본 statement_timeout을 적용하고 마이그레이션용 프리셋은 제외한다", async () => {
    process.env.NODE_ENV = "production";
    const db = new DBClass();
    db.setConfig(db.generateDBConfig({ database: "pg", defaultOptions: {} }, "Miomock"));

    try {
      const expected = `-c statement_timeout=${DEFAULT_STATEMENT_TIMEOUT_MS}`;

      expect(db.getDB("w").client.config.connection).toMatchObject({ options: expected });
      expect(db.getDB("r").client.config.connection).toMatchObject({ options: expected });
      expect(db.getDB("production").client.config.connection).not.toHaveProperty("options");
    } finally {
      await db.destroy();
    }
  });
});
