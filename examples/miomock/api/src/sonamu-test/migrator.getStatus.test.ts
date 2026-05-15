import { Migrator, Naite, Sonamu } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, vi } from "vitest";

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
    expect(statuses[0]).toBe(0); // test
    expect(statuses[1]).toBe(0); // fixture_remote
    expect(statuses[2]).toBe(0); // development
    expect(statuses[3]).toBe(0); // production

    // conns 구조 검증
    expect(status.conns).toHaveLength(4);
    status.conns.forEach((conn) => {
      expect(conn).toHaveProperty("name");
      expect(conn).toHaveProperty("connKey");
      expect(conn).toHaveProperty("connString");
      expect(conn).toHaveProperty("currentVersion");
      expect(conn).toHaveProperty("status");
      expect(conn).toHaveProperty("pending");
      expect(conn.status).toBe(0);
      expect(conn.pending).toEqual([]);
    });

    // preparedCodes 검증 (Entity와 DB 일치 시 빈 배열)
    expect(status.preparedCodes).toEqual([]);
  });

  test("일부 DB 미적용 상태 확인", async () => {
    // given: test DB에 미적용 마이그레이션 코드가 있는 상태

    const status = await migrator.getStatus();

    // statuses 스냅샷
    expect(Naite.get("migrator:getStatus:status").result()).toMatchSnapshot();

    // pending이 있는 DB 확인
    const pendingConns = status.conns.filter((conn) => conn.pending.length > 0);
    if (pendingConns.length > 0) {
      pendingConns.forEach((conn) => {
        expect(conn.status).toBeGreaterThan(0);
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
        connString: `pg://${dbUser}@0.0.0.0:5432/miomock_test`,
        currentVersion: expect.any(String),
        name: "test",
        pending: [],
        status: 0,
      },
      {
        connKey: "fixture",
        connString: `pg://${dbUser}@0.0.0.0:5432/miomock_fixture`,
        currentVersion: expect.any(String),
        name: "fixture",
        pending: [],
        status: 0,
      },
      {
        connKey: "development",
        connString: `pg://${dbUser}@0.0.0.0:5432/miomock_development`,
        currentVersion: expect.any(String),
        name: "development",
        pending: [],
        status: 0,
      },
      {
        connKey: "staging",
        connString: `pg://${dbUser}@0.0.0.0:5432/miomock_staging`,
        currentVersion: expect.any(String),
        name: "staging",
        pending: [],
        status: 0,
      },
      {
        connKey: "production",
        connString: `pg://${dbUser}@0.0.0.0:5432/miomock_production`,
        currentVersion: expect.any(String),
        name: "production",
        pending: [],
        status: 0,
      },
    ]);

    // test, fixture, development, staging, production
    expect(Naite.get("migrator:getStatus:conns").first()).toHaveLength(5);
  });
});
