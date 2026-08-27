import { Migrator, Naite, Sonamu } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";
import { z } from "zod";

bootstrap(vi, { forTesting: false });

describe("Migrator - getStatus", () => {
  let migrator: Migrator;
  beforeAll(async () => {
    migrator = new Migrator();
    expect(migrator).toBeDefined();
  });

  test("마이그레이션 최신 상태 확인", async () => {
    const status = await migrator.getStatus();

    // codes 검증
    expect(Naite.get("migrator:getMigrationCodes:results").first()).toBeDefined();
    expect(status.codes).toBeDefined();
    expect(status.codes[0]).toHaveProperty("name");
    expect(status.codes[0]).toHaveProperty("path");

    // 각 DB 상태 검증
    const statuses = Naite.get("migrator:getStatus:status").result();
    expect(statuses).toHaveLength(5);
    statuses.forEach((statusValue) => expect(z.number().safeParse(statusValue).success).toBe(true));

    // conns 구조 검증
    expect(status.conns).toHaveLength(5);
    status.conns.forEach((conn) => {
      expect(conn).toHaveProperty("name");
      expect(conn).toHaveProperty("connKey");
      expect(conn).toHaveProperty("connString");
      expect(conn).toHaveProperty("currentVersion");
      expect(conn).toHaveProperty("status");
      expect(conn).toHaveProperty("pending");
      expect(Array.isArray(conn.pending)).toBe(true);
    });

    // preparedCodes 검증 (Entity와 DB 일치 시 빈 배열)
    expect(status.preparedCodes).toEqual([]);
  });

  test("분리된 조회 API가 기존 전체 상태와 같은 결과를 반환", async () => {
    const connections = migrator.getConnections();
    const codes = await migrator.getMigrationCodes();
    const connectionStatus = await migrator.getConnectionStatus("test");
    const legacyStatus = await migrator.getStatus();
    const legacyTestStatus = legacyStatus.conns.find((conn) => conn.connKey === "test");

    expect(connections.map((conn) => conn.connKey)).toEqual([
      "test",
      "fixture",
      "development",
      "staging",
      "production",
    ]);
    connections.forEach((conn) => {
      // SAFETY: 테스트 픽스처가 대상 API의 입력 타입과 일치하도록 구성되었습니다.
      const configured = Sonamu.dbConfig[conn.connKey].connection as {
        host?: string;
        port?: number;
        database?: string;
      };
      const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

      expect(Object.keys(conn).toSorted()).toEqual([
        "connKey",
        "database",
        "host",
        "name",
        "port",
        "remote",
        "requiresApproval",
      ]);
      expect(conn).toMatchObject({
        name: conn.connKey,
        host: configured.host,
        port: configured.port ?? 5432,
        database: configured.database,
        remote: !localHosts.has((configured.host ?? "localhost").toLowerCase()),
        requiresApproval: Sonamu.config.slackConfirm?.targets.includes(conn.connKey) ?? false,
      });
    });

    expect(codes).toEqual(legacyStatus.codes);
    expect(legacyTestStatus).toBeDefined();
    expect(connectionStatus).toMatchObject({
      connKey: "test",
      currentVersion: legacyTestStatus?.currentVersion,
      pending: legacyTestStatus?.pending,
      status: legacyTestStatus?.status,
      latencyMs: expect.any(Number),
    });
    expect(connectionStatus.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("readonly 커넥션은 마이그레이션 조회 대상으로 허용하지 않음", async () => {
    await expect(migrator.getConnectionStatus("test_readonly")).rejects.toThrow();
  });

  test("일부 DB 미적용 상태 확인", async () => {
    // given: test DB에 미적용 마이그레이션 코드가 있는 상태

    const status = await migrator.getStatus();

    const statuses = Naite.get("migrator:getStatus:status").result();
    expect(statuses).toHaveLength(5);
    statuses.forEach((statusValue) => expect(z.number().safeParse(statusValue).success).toBe(true));

    // pending이 있는 DB 확인
    const pendingConns = status.conns.filter((conn) => conn.pending.length > 0);
    if (pendingConns.length > 0) {
      pendingConns.forEach((conn) => {
        expect(z.number().safeParse(conn.status).success).toBe(true);
        expect(conn.status).not.toBe(0);
        expect(Array.isArray(conn.pending)).toBe(true);
      });
    }
  });

  test("각 db의 connections 확인", async () => {
    await migrator.getStatus();

    const dbUser = Sonamu.config.database.defaultOptions?.connection?.user ?? "root";
    expect(Naite.get("migrator:getStatus:conns").first()).toMatchObject([
      // 이거 아래에 나타나는 순서가 중요한 테스트입니다!
      // 이 순서는 Sonamu UI의 DB Migration 탭에 표시되는 순서와 동일합니다.
      {
        connKey: "test",
        connString: `pg://${dbUser}@127.0.0.1:5432/miomock_test`,
        currentVersion: expect.any(String),
        name: "test",
        pending: [],
        status: 0,
      },
      {
        connKey: "fixture",
        connString: `pg://${dbUser}@127.0.0.1:5432/miomock_fixture`,
        currentVersion: expect.any(String),
        name: "fixture",
        pending: [],
        status: 0,
      },
      {
        connKey: "development",
        connString: `pg://${dbUser}@127.0.0.1:5432/miomock_development`,
        currentVersion: expect.any(String),
        name: "development",
        pending: [],
        status: 0,
      },
      {
        connKey: "staging",
        connString: `pg://${dbUser}@127.0.0.1:5432/miomock_staging`,
        currentVersion: expect.any(String),
        name: "staging",
        pending: expect.any(Array),
        status: expect.any(Number),
      },
      {
        connKey: "production",
        connString: `pg://${dbUser}@127.0.0.1:5432/miomock_production`,
        currentVersion: expect.any(String),
        name: "production",
        pending: expect.any(Array),
        status: expect.any(Number),
      },
    ]);

    // test, fixture, development, staging, production
    expect(Naite.get("migrator:getStatus:conns").first()).toHaveLength(5);
  });
});
