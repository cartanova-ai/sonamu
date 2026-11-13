import { describe, expect, it, vi } from "vitest";

// client.ts builds its query handle on import and validates the signing key (32 bytes or more), so set it first.
vi.hoisted(() => {
  process.env.SEARCH_CURSOR_SECRET = Buffer.alloc(32, 1).toString("base64");
});

import { chatMessagesSonamuSearch } from "../../examples/application/chat-message.sonamu-search";
import {
  isTransactionConflict,
  withTransactionRetry,
} from "../../examples/application/transaction-retry";
import {
  createChatSearchMonitor,
  exactBacklogByTarget,
} from "../../examples/search/administration";
import { chatMessagesSearch } from "../../examples/search/chat-messages.definition";
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  highlightClause,
  splitHighlight,
} from "../../examples/search/highlight";
import { searchHealth, shutdownSearch } from "../../examples/search/worker";
import {
  createWorkerEventListener,
  type SearchLogger,
  type SearchMetrics,
} from "../../examples/search/worker-events";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchUnavailable,
} from "../../src/errors";
import { type IndexerEvent } from "../../src/postgres";

// Runs every documented example that needs no container.

function conflict(reason: "serialization-failure" | "deadlock"): SearchUnavailable {
  return new SearchUnavailable(
    {
      key: "pg.transactionConflict",
      params: { sqlstate: reason === "deadlock" ? "40P01" : "40001" },
    },
    { details: { sqlstate: reason === "deadlock" ? "40P01" : "40001", reason } },
  );
}

describe("examples/application/transaction-retry.ts", () => {
  it("패키지의 충돌 오류가 두 번 나면 트랜잭션 전체를 세 번째에 성공시킨다", async () => {
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(conflict("serialization-failure"))
      .mockRejectedValueOnce(conflict("deadlock"))
      .mockResolvedValueOnce("committed");
    await expect(withTransactionRetry(run)).resolves.toBe("committed");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("충돌이 아닌 오류는 메시지와 무관하게 다시 실행하지 않는다", async () => {
    const connectionLost = new SearchUnavailable(
      { key: "pg.unavailable", params: { sqlstate: "08006" } },
      { details: { reason: "connection" } },
    );
    const uninitialized = new SearchConfigurationError(
      { key: "sync.storeIdentityUninitialized" },
      { retryable: true, details: { reason: "store-identity-uninitialized" } },
    );
    // Only code and reason count, not a message mentioning serialization.
    const misleading = new Error("serialization failure 40001");
    for (const error of [connectionLost, uninitialized, misleading]) {
      expect(isTransactionConflict(error)).toBe(false);
      const run = vi.fn<() => Promise<string>>().mockRejectedValue(error);
      await expect(withTransactionRetry(run)).rejects.toBe(error);
      expect(run).toHaveBeenCalledTimes(1);
    }
  });
});

// Collects log lines, counters and gauges.
function recorder() {
  const lines: [string, string, Record<string, string | number>][] = [];
  const counters: [string, number, Record<string, string> | undefined][] = [];
  const gauges = new Map<string, number>();
  const log: SearchLogger = {
    info: (message, fields) => lines.push(["info", message, fields]),
    warn: (message, fields) => lines.push(["warn", message, fields]),
    error: (message, fields) => lines.push(["error", message, fields]),
  };
  const metrics: SearchMetrics = {
    increment: (name, value, labels) => counters.push([name, value, labels]),
    gauge: (name, value) => gauges.set(name, value),
  };
  return { lines, counters, gauges, log, metrics };
}

describe("examples/search/worker-events.ts", () => {
  it("모든 이벤트 종류를 안정된 필드로만 로그와 카운터로 바꾼다", () => {
    const r = recorder();
    const listener = createWorkerEventListener(r.log, r.metrics);
    const report = {
      claimed: 0,
      indexed: 0,
      superseded: 0,
      retried: 0,
      quarantined: 0,
      released: 0,
      leaseLost: 0,
      skippedLocked: 0,
      abandoned: 0,
      unsupportedTargets: [],
      cooldownRemainingMs: 0,
      elapsedMs: 10,
    };
    const events: IndexerEvent[] = [
      {
        type: "drain",
        outcome: "processed",
        report: { ...report, outcome: "processed", claimed: 3, indexed: 2, retried: 1 },
      },
      { type: "drain", outcome: "empty", report: { ...report, outcome: "empty" } },
      {
        type: "drain",
        outcome: "cooldown",
        report: { ...report, outcome: "cooldown", cooldownRemainingMs: 500 },
      },
      { type: "state", previous: "idle", state: "running", reason: "started" },
      { type: "state", previous: "running", state: "degraded", reason: "drain-failed" },
      { type: "quarantined", targetId: "t1", documentId: "42", revision: 3, errorClass: "mapping" },
      { type: "target-paused", targetId: "t1", reason: "mapping" },
      { type: "hash-mismatch", targetId: "t1", documentId: "42", revision: 3 },
      { type: "hash-version-mismatch", targetId: "t1", documentId: "43", revision: 1 },
      { type: "lease-reclaimed", count: 2 },
      {
        type: "target-fence-lost",
        targetId: "t1",
        class: "behind",
        localEpoch: 4,
        remoteEpoch: 5,
      },
      { type: "error", code: "SEARCH_UNAVAILABLE" },
      { type: "error", code: "SEARCH_STORE_MISMATCH", reason: "store-origin-changed" },
    ];
    for (const event of events) listener(event);

    expect(r.counters).toEqual([
      ["search_worker_drains", 1, { outcome: "processed" }],
      ["search_worker_indexed", 2, undefined],
      ["search_worker_retried", 1, undefined],
      ["search_worker_quarantined", 0, undefined],
      ["search_worker_drains", 1, { outcome: "empty" }],
      ["search_worker_indexed", 0, undefined],
      ["search_worker_retried", 0, undefined],
      ["search_worker_quarantined", 0, undefined],
      ["search_worker_drains", 1, { outcome: "cooldown" }],
      ["search_worker_indexed", 0, undefined],
      ["search_worker_retried", 0, undefined],
      ["search_worker_quarantined", 0, undefined],
      ["search_worker_quarantined_documents", 1, { errorClass: "mapping" }],
      ["search_worker_target_paused", 1, { reason: "mapping" }],
      ["search_worker_hash_mismatch", 1, undefined],
      ["search_worker_hash_version_mismatch", 1, undefined],
      ["search_worker_lease_reclaimed", 2, undefined],
      ["search_worker_target_fence_lost", 1, { class: "behind" }],
      ["search_worker_drain_errors", 1, { code: "SEARCH_UNAVAILABLE" }],
      ["search_worker_store_mismatch", 1, { reason: "store-origin-changed" }],
    ]);
    expect(r.lines.map(([level, message]) => `${level}: ${message}`)).toEqual([
      // Only a cooldown drain warns; an empty drain does not.
      "warn: search worker cooling down",
      "info: search worker state changed",
      "warn: search worker degraded",
      "error: search document quarantined",
      "error: search target paused",
      "error: search projection hash mismatch",
      "warn: search hash version mismatch",
      "warn: search leases reclaimed",
      "error: search target fence lost",
      "error: search drain failed",
      "error: search store binding mismatch",
    ]);
    expect(r.lines.at(-1)?.[2]).toEqual({ reason: "store-origin-changed" });
    expect(r.lines[0]?.[2]).toEqual({ cooldownMs: 500 });
    expect(r.lines[1]?.[2]).toEqual({ previous: "idle", state: "running", reason: "started" });
    expect(r.lines[2]?.[2]).toEqual({ previous: "running", reason: "drain-failed" });
    expect(r.lines[6]?.[2]).toEqual({ targetId: "t1", documentId: "43", revision: 1 });
    // The target id goes to the log only; the counter label is the class.
    expect(r.lines[8]?.[2]).toEqual({
      targetId: "t1",
      class: "behind",
      localEpoch: 4,
      remoteEpoch: 5,
    });
    // The last state event was degraded.
    expect(Object.fromEntries(r.gauges)).toEqual({
      search_worker_degraded: 1,
      search_worker_running: 1,
    });
  });
});

describe("examples/application/chat-message.sonamu-search.ts", () => {
  it("Sonamu 형태의 정의는 defineSearch 형태와 fingerprint가 같다", () => {
    expect(chatMessagesSonamuSearch.key).toBe(chatMessagesSearch.key);
    expect(chatMessagesSonamuSearch.fingerprint).toBe(chatMessagesSearch.fingerprint);
  });
});

describe("examples/search/highlight.ts", () => {
  it("사용 영역 문자로 감싼 구간을 잘라 텍스트로 돌려주고, 조각 안의 HTML은 텍스트 그대로 남긴다", () => {
    expect(highlightClause(["doc.body"])).toEqual({
      pre_tags: ["\uE000"],
      post_tags: ["\uE001"],
      fields: { "doc.body": {} },
    });
    const fragment = `<img src=x onerror=alert(1)> ${HIGHLIGHT_START}검색${HIGHLIGHT_END}어 ${HIGHLIGHT_START}<b>강조</b>${HIGHLIGHT_END}`;
    expect(splitHighlight(fragment)).toEqual([
      { text: "<img src=x onerror=alert(1)> ", highlighted: false },
      { text: "검색", highlighted: true },
      { text: "어 ", highlighted: false },
      { text: "<b>강조</b>", highlighted: true },
    ]);
    expect(splitHighlight("일치 없음")).toEqual([{ text: "일치 없음", highlighted: false }]);
  });
});

describe("examples/search/worker.ts", () => {
  it("상태 점검은 이름으로 lifecycle 상태를 읽고, 종료는 워커를 멈춘 뒤 애플리케이션의 쿼리 클라이언트를 닫는다", async () => {
    // Importing only creates the lifecycle; nothing has started.
    expect(searchHealth()).toEqual({ ready: false, state: "idle", fenceLostTargets: [] });
    await shutdownSearch();
    expect(searchHealth()).toMatchObject({ ready: false, state: "stopped" });
  });
});

describe("examples/search/administration.ts", () => {
  it("클라이언트 없는 관리 핸들은 원격 작업을 데이터베이스에 닿기 전에 search-client-not-configured로 거부한다", async () => {
    const database = vi.fn(() => {
      throw new Error("데이터베이스에 닿으면 안 됩니다.");
    });
    const monitor = createChatSearchMonitor(database);
    const refused = monitor.beginRebuild(
      { logicalKey: chatMessagesSearch.key, fingerprint: chatMessagesSearch.fingerprint },
      { operationId: "op-1", actor: "tester", reason: "예제" },
    );
    await expect(refused).rejects.toBeInstanceOf(SearchAdminPreconditionFailed);
    await expect(refused).rejects.toMatchObject({
      details: { reason: "search-client-not-configured" },
    });
    expect(database).not.toHaveBeenCalled();
  });

  it("정확한 대기열 수치는 counts: exact로 읽는다", async () => {
    const inspect = vi.fn().mockResolvedValue({
      targets: [
        { targetId: "t1", backlog: { pending: 3, exact: true } },
        { targetId: "t2", backlog: null },
      ],
    });
    const report = await exactBacklogByTarget({ inspect });
    expect(inspect).toHaveBeenCalledWith(chatMessagesSearch.key, { counts: "exact" });
    expect([...report]).toEqual([["t1", { pending: 3, exact: true }]]);
  });
});

describe("examples/sonamu.config.ts", () => {
  it("검색 CLI 플러그인을 등록하고, 명령이 돌 때에야 설정 모듈을 불러 그 정의의 key로 판단한다", async () => {
    const config = await (await import("../../examples/sonamu.config")).default;
    const plugin = config.cli?.plugins?.find((candidate) => candidate.name === "search");
    const inspect = plugin?.commands.find((command) => command.path.join(" ") === "search inspect");
    if (inspect === undefined) throw new Error("search inspect가 등록되지 않았습니다.");
    // An undefined key is refused before any database access, after load built the setup.
    await expect(
      Promise.resolve(
        inspect.run(
          { arguments: { logicalKey: "other" }, options: {}, dryRun: false },
          { command: "search.inspect", json: true, interactive: false },
        ),
      ),
    ).rejects.toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
      details: { reason: "logical-key-unknown", keys: chatMessagesSearch.key },
    });
  });
});
