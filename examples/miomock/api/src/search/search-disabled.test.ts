import { getSearchLifecycleStatus } from "@sonamu-kit/opensearch/sonamu";
import { DB } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

import { ProjectModel } from "../application/project/project.model";
import { getSearchHandles, isSearchEnabled } from "./index";
import { getSearchRuntime, SEARCH_LIFECYCLE_NAME } from "./runtime";
import { initializeSearchStore, startSearch, stopSearch } from "./startup";

bootstrap(vi);

describe("검색 비활성화", () => {
  test("검색이 꺼져 있으면 프로젝트 저장이 패키지 문장을 실행하지 않는다", async () => {
    vi.stubEnv("MIOMOCK_SEARCH_ENABLED", "false");
    const statements: string[] = [];
    const listener = (query: { sql: string }) => {
      statements.push(query.sql);
    };
    const db = DB.getDB("w");
    db.on("query", listener);
    try {
      const [projectId] = await ProjectModel.save([
        {
          name: "검색비활성프로젝트",
          status: "planning",
          description: null,
          budget: null,
          deadline: null,
          image_urls: null,
          employee_ids: [],
          tag_ids: [],
        },
      ]);
      expect(projectId).toBeGreaterThan(0);
    } finally {
      db.off("query", listener);
      vi.unstubAllEnvs();
    }

    // Proves the listener saw the save transaction before asserting on what it did not see.
    expect(statements.some((sql) => /insert into "projects"/i.test(sql))).toBe(true);
    expect(statements.filter((sql) => sql.includes("sonamu_search"))).toEqual([]);
    expect(isSearchEnabled()).toBe(false);
    expect(getSearchHandles()).toBeUndefined();
  });

  test("검색이 꺼져 있으면 서버 시작과 종료가 연결, 문장, 타이머를 만들지 않는다", async () => {
    vi.stubEnv("MIOMOCK_SEARCH_ENABLED", "false");
    vi.useFakeTimers();
    const statements: string[] = [];
    const listener = (query: { sql: string }) => {
      statements.push(query.sql);
    };
    const db = DB.getDB("w");
    db.on("query", listener);
    try {
      // Same order as sonamu.config.ts: onReady, onStart, onShutdown.
      await initializeSearchStore();
      await startSearch();
      expect(vi.getTimerCount()).toBe(0);
      await stopSearch();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      db.off("query", listener);
      vi.useRealTimers();
      vi.unstubAllEnvs();
    }
    expect(statements).toEqual([]);
    expect(getSearchRuntime()).toBeUndefined();
    expect(getSearchHandles()).toBeUndefined();
    // A lifecycle created and shut down would still report "stopped".
    expect(getSearchLifecycleStatus(SEARCH_LIFECYCLE_NAME)).toBeUndefined();
  });

  test("검색을 켰는데 OPENSEARCH_URL이 없어도 모듈 import는 실패하지 않고 시작 때 실패한다", async () => {
    vi.stubEnv("MIOMOCK_SEARCH_ENABLED", "true");
    vi.stubEnv("OPENSEARCH_URL", "");
    vi.stubEnv("MIOMOCK_SEARCH_CURSOR_SECRET", "");
    vi.resetModules();
    try {
      // The same import path tools such as sonamu sync take.
      const runtime = await import("./runtime");
      const startup = await import("./startup");
      expect(() => runtime.getSearchRuntime()).toThrow("OPENSEARCH_URL");
      await expect(startup.initializeSearchStore()).rejects.toThrow("OPENSEARCH_URL");
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
