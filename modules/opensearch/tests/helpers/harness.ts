import { randomBytes } from "node:crypto";

import { type Client } from "@opensearch-project/opensearch";
import knexFactory, { type Knex } from "knex";
import { Client as PgClient } from "pg";
import { afterAll, afterEach, beforeAll, inject } from "vitest";

import { PHYSICAL_INDEX_PREFIX } from "../../src/definition/names";
import { type TestEnvironment, TEST_ENVIRONMENT_KEY } from "./env";
import { createOpenSearchClient } from "./opensearch-container";
import { deleteIndicesWithPrefix } from "./opensearch-ops";
import { openPgSessions, type PgSessions, type PgSessionsOptions } from "./pg-sessions";
import { installSampleDomain, type SampleChat } from "./sample-domain";
import { identifier, passwordLiteral, qualified, sql, tokenList } from "./sql";

export type HarnessOptions = {
  opensearch?: boolean;
  sampleDomain?: boolean;
};

export type TestRole = {
  name: string;
  password: string;
  url: string;
};

export type IntegrationHarness = {
  readonly id: string;
  readonly env: TestEnvironment;
  readonly knex: Knex;
  readonly opensearch: Client;
  readonly searchSchema: string;
  readonly appSchema: string;
  readonly namespace: string;
  readonly indexPrefix: string;
  readonly sample: SampleChat;
  indexName(suffix: string): string;
  connectionString(applicationName?: string): string;
  openSessions<const L extends string>(
    labels: readonly L[],
    options?: PgSessionsOptions,
  ): Promise<PgSessions<L>>;
  createRole(suffix: string): Promise<TestRole>;
  onCleanup(cleanup: () => Promise<void>): void;
};

const SUFFIX_PATTERN = /^[a-z0-9][a-z0-9_-]{0,40}$/;

export function readTestEnvironment(): TestEnvironment {
  const environment = inject(TEST_ENVIRONMENT_KEY);
  if (environment === undefined) {
    throw new Error(
      "통합 테스트 환경이 없습니다. vitest --project integration 또는 sonamu로 실행하세요 (tests/global-setup.ts).",
    );
  }
  return environment;
}

function withApplicationName(url: string, applicationName: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("application_name", applicationName);
  return parsed.toString();
}

async function runAll(steps: readonly (readonly [string, () => Promise<void>])[]): Promise<void> {
  const failures: Error[] = [];
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (error) {
      failures.push(new Error(`정리 단계 "${name}" 실패`, { cause: error }));
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `하네스 정리 실패: ${failures.map((failure) => failure.message).join("; ")}`,
    );
  }
}

function ready<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new Error(`하네스의 ${what}은 beforeAll 이후, afterAll 이전에만 쓸 수 있습니다.`);
  }
  return value;
}

/**
 * Fixtures really commit (workers cannot see uncommitted rows), so no test transaction is used. Every cleanup step
 * runs even if an earlier one fails; the failures are thrown together.
 */
export function useIntegrationHarness(options: HarnessOptions = {}): IntegrationHarness {
  const wantsOpenSearch = options.opensearch ?? true;
  const wantsSampleDomain = options.sampleDomain ?? true;
  const id = randomBytes(4).toString("hex");
  const searchSchema = `ss_${id}`;
  const appSchema = `app_${id}`;
  const namespace = `t-${id}`;
  const indexPrefix = `${PHYSICAL_INDEX_PREFIX}${namespace}-`;
  const applicationTag = `h:${id}`;

  let environment: TestEnvironment | null = null;
  let knex: Knex | null = null;
  let opensearch: Client | null = null;
  let sample: SampleChat | null = null;
  const sessionGroups = new Set<PgSessions<string>>();
  const roles: string[] = [];
  const cleanups: (() => Promise<void>)[] = [];

  const connectionString = (applicationName = "client"): string =>
    withApplicationName(
      ready(environment, "env").postgres.url,
      `${applicationTag}:${applicationName}`,
    );

  const truncateSchemas = async (): Promise<void> => {
    const db = ready(knex, "knex");
    const { rows } = await db.raw<{ rows: { schema: string; name: string }[] }>(
      "SELECT schemaname AS schema, tablename AS name FROM pg_tables WHERE schemaname IN (?, ?) ORDER BY 1, 2",
      [searchSchema, appSchema],
    );
    if (rows.length === 0) {
      return;
    }
    const tables = tokenList(rows.map((row) => qualified(row.schema, row.name)));
    await db.transaction(async (trx) => {
      // A connection a test leaked may still hold a lock; fail instead of waiting forever.
      await trx.raw("SET LOCAL lock_timeout = '10s'");
      await trx.raw(sql`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    });
  };

  const closeSessions = async (): Promise<void> => {
    const groups = [...sessionGroups];
    sessionGroups.clear();
    const results = await Promise.allSettled(groups.map((group) => group.close()));
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, "세션 정리 실패");
    }
  };

  const deleteIndices = async (): Promise<void> => {
    if (opensearch !== null) {
      await deleteIndicesWithPrefix(opensearch, indexPrefix);
    }
  };

  beforeAll(async () => {
    environment = readTestEnvironment();
    if (wantsOpenSearch && environment.opensearch === null) {
      throw new Error(
        "이 프로젝트의 globalSetup은 OpenSearch를 띄우지 않았습니다. integration 프로젝트에서 실행하세요.",
      );
    }
    knex = knexFactory({
      client: "pg",
      connection: connectionString("knex"),
      pool: { min: 0, max: 10 },
    });
    await knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(appSchema)} CASCADE`);
    await knex.raw(sql`DROP SCHEMA IF EXISTS ${identifier(searchSchema)} CASCADE`);
    if (wantsSampleDomain) {
      sample = await installSampleDomain(knex, appSchema);
    }
    if (wantsOpenSearch && environment.opensearch !== null) {
      opensearch = createOpenSearchClient(environment.opensearch.url);
      await deleteIndices();
    }
  });

  afterEach(async () => {
    await runAll([
      ["세션 닫기", closeSessions],
      ["테이블 비우기", truncateSchemas],
      ["인덱스 지우기", deleteIndices],
    ]);
  });

  afterAll(async () => {
    const env = environment;
    if (env === null) {
      return;
    }
    await runAll([
      ["세션 닫기", closeSessions],
      [
        "등록된 정리 작업",
        async () => {
          await runAll(
            cleanups
              .toReversed()
              .map((cleanup, position) => [`cleanup #${position}`, cleanup] as const),
          );
        },
      ],
      ["인덱스 지우기", deleteIndices],
      [
        "OpenSearch 클라이언트 닫기",
        async () => {
          await opensearch?.close();
          opensearch = null;
        },
      ],
      [
        "Knex 풀 닫기",
        async () => {
          await knex?.destroy();
          knex = null;
        },
      ],
      [
        "스키마와 역할 지우기",
        async () => {
          const client = new PgClient({
            connectionString: env.postgres.url,
            application_name: "harness-cleanup",
          });
          client.on("error", () => {});
          await client.connect();
          try {
            await client.query(
              // Connections this file left open would hold locks and block DROP.
              "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND application_name LIKE $1",
              [`${applicationTag}:%`],
            );
            await client.query("SET lock_timeout = '10s'");
            await client.query(sql`DROP SCHEMA IF EXISTS ${identifier(appSchema)} CASCADE`);
            await client.query(sql`DROP SCHEMA IF EXISTS ${identifier(searchSchema)} CASCADE`);
            for (const role of roles) {
              await client.query(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1",
                [role],
              );
              const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
                role,
              ]);
              if (exists.rowCount !== 0) {
                await client.query(sql`DROP OWNED BY ${identifier(role)} CASCADE`);
                await client.query(sql`DROP ROLE ${identifier(role)}`);
              }
            }
          } finally {
            await client.end();
          }
        },
      ],
    ]);
    environment = null;
    sample = null;
  });

  return {
    id,
    searchSchema,
    appSchema,
    namespace,
    indexPrefix,
    get env() {
      return ready(environment, "env");
    },
    get knex() {
      return ready(knex, "knex");
    },
    get opensearch() {
      if (!wantsOpenSearch) {
        throw new Error("opensearch: false로 만든 하네스입니다.");
      }
      return ready(opensearch, "opensearch");
    },
    get sample() {
      if (!wantsSampleDomain) {
        throw new Error("sampleDomain: false로 만든 하네스입니다.");
      }
      return ready(sample, "sample");
    },
    indexName(suffix) {
      if (!SUFFIX_PATTERN.test(suffix)) {
        throw new Error(`인덱스 접미사가 올바르지 않습니다: ${suffix}`);
      }
      return `${indexPrefix}${suffix}`;
    },
    connectionString,
    async openSessions(labels, sessionOptions = {}) {
      const group = await openPgSessions(connectionString(`sessions`), labels, {
        applicationNamePrefix: `${applicationTag}:pgs`,
        searchPath: `${appSchema}, public`,
        ...sessionOptions,
      });
      sessionGroups.add(group);
      return group;
    },
    async createRole(suffix) {
      if (!/^[a-z0-9_]{1,30}$/.test(suffix)) {
        throw new Error(`역할 접미사가 올바르지 않습니다: ${suffix}`);
      }
      const name = `h_${id}_${suffix}`;
      const password = randomBytes(12).toString("hex");
      roles.push(name);
      await ready(knex, "knex").raw(
        sql`CREATE ROLE ${identifier(name)} LOGIN PASSWORD ${passwordLiteral(password)}`,
      );
      const url = new URL(ready(environment, "env").postgres.url);
      url.username = name;
      url.password = password;
      url.searchParams.set("application_name", `${applicationTag}:role`);
      return { name, password, url: url.toString() };
    },
    onCleanup(cleanup) {
      cleanups.push(cleanup);
    },
  };
}
