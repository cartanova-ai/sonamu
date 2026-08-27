import { afterEach, describe, expect, it } from "vitest";

import { type EnvironmentSnapshots } from "../../env";
import { DBClass } from "../db";

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
