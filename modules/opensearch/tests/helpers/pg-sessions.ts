import { Client as PgClient, DatabaseError, type QueryResult, type QueryResultRow } from "pg";

/**
 * Concurrency test driver: one connection per session, one statement at a time. Each step declares whether it must not
 * wait (run, expectError) or must wait on a lock (block); an observer connection polls pg_stat_activity to confirm it,
 * never elapsed time. run cancels and fails on an observed lock wait; block returns only once the wait is observed.
 * A BlockedStatement must be collected (settle, expectSuccess, expectError) or close() fails.
 */
export type PgParam =
  | string
  | number
  | bigint
  | boolean
  | null
  | Date
  | Buffer
  | readonly (string | number | null)[];

export type PgSessionsOptions = {
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  applicationNamePrefix?: string;
  searchPath?: string;
};

export type RunOptions = {
  lockWait?: "forbid" | "allow";
};

export type BlockOptions = {
  blockedBy?: PgSession | readonly PgSession[];
};

export type PgStatementError = {
  code: string;
  message: string;
  error: Error;
};

export type StatementOutcome<R extends QueryResultRow = QueryResultRow> =
  | { status: "ok"; result: QueryResult<R> }
  | { status: "error"; error: PgStatementError };

export type HeldLock = {
  locktype: string;
  mode: string;
  granted: boolean;
  relation: string | null;
};

type ActivityRow = {
  state: string | null;
  wait_event_type: string | null;
  wait_event: string | null;
  query: string;
  blocking_pids: number[];
};

const DEFAULT_WAIT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 5;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function toStatementError(error: Error): PgStatementError {
  if (error instanceof DatabaseError && error.code !== undefined) {
    return { code: error.code, message: error.message, error };
  }
  return { code: "(no-sqlstate)", message: error.message, error };
}

function asError(cause: Error | string): Error {
  return cause instanceof Error ? cause : new Error(cause);
}

function describeOutcome(outcome: StatementOutcome): string {
  return outcome.status === "ok"
    ? `성공(${outcome.result.command} ${outcome.result.rowCount ?? 0}행)`
    : `오류 ${outcome.error.code}: ${outcome.error.message}`;
}

class InFlight<R extends QueryResultRow> {
  settled: StatementOutcome<R> | null = null;
  readonly outcome: Promise<StatementOutcome<R>>;

  constructor(
    readonly sql: string,
    execution: Promise<QueryResult<R>>,
  ) {
    this.outcome = execution.then(
      (result): StatementOutcome<R> => {
        this.settled = { status: "ok", result };
        return this.settled;
      },
      (cause: Error): StatementOutcome<R> => {
        this.settled = { status: "error", error: toStatementError(asError(cause)) };
        return this.settled;
      },
    );
  }
}

export class BlockedStatement<R extends QueryResultRow = QueryResultRow> {
  private consumed = false;

  constructor(
    private readonly session: PgSession,
    private readonly flight: InFlight<R>,
  ) {}

  async expectStillBlocked(): Promise<void> {
    const activity = await this.session.readActivity();
    if (this.flight.settled !== null) {
      throw new Error(
        `[${this.session.label}] 아직 막혀 있어야 할 문장이 이미 끝났습니다: ${describeOutcome(this.flight.settled)}\n${this.flight.sql}`,
      );
    }
    if (!isWaitingOnLock(activity, this.flight.sql)) {
      throw new Error(
        `[${this.session.label}] 문장이 더 이상 잠금을 기다리지 않습니다 (state=${activity?.state}, wait=${activity?.wait_event_type}/${activity?.wait_event}).`,
      );
    }
  }

  async settle(): Promise<StatementOutcome<R>> {
    if (this.consumed) {
      throw new Error(`[${this.session.label}] 막힌 문장의 결과를 두 번 회수했습니다.`);
    }
    this.consumed = true;
    try {
      return await this.session.awaitCompletion(this.flight, "allow");
    } finally {
      this.session.finishBlocked(this);
    }
  }

  async expectSuccess(): Promise<QueryResult<R>> {
    const outcome = await this.settle();
    if (outcome.status === "error") {
      throw new Error(
        `[${this.session.label}] 풀린 문장이 성공해야 했지만 ${outcome.error.code}로 실패했습니다: ${outcome.error.message}`,
        { cause: outcome.error.error },
      );
    }
    return outcome.result;
  }

  async expectError(sqlstate: string): Promise<PgStatementError> {
    const outcome = await this.settle();
    if (outcome.status === "ok") {
      throw new Error(
        `[${this.session.label}] 풀린 문장이 ${sqlstate}로 실패해야 했지만 성공했습니다.`,
      );
    }
    if (outcome.error.code !== sqlstate) {
      throw new Error(
        `[${this.session.label}] 풀린 문장이 ${sqlstate}로 실패해야 했지만 ${outcome.error.code}였습니다: ${outcome.error.message}`,
        { cause: outcome.error.error },
      );
    }
    return outcome.error;
  }

  get isConsumed(): boolean {
    return this.consumed;
  }
}

// The backend reported idle before the previous result arrived, so an active row whose query is a prefix of this
// statement (track_activity_query_size truncates) is this statement.
function isWaitingOnLock(activity: ActivityRow | null, sql: string): boolean {
  return (
    activity !== null &&
    activity.state === "active" &&
    activity.wait_event_type === "Lock" &&
    activity.query.length > 0 &&
    sql.startsWith(activity.query)
  );
}

export class PgSession {
  private busy: InFlight<QueryResultRow> | null = null;
  private readonly unconsumed = new Set<BlockedStatement<QueryResultRow>>();

  constructor(
    readonly label: string,
    readonly pid: number,
    private readonly client: PgClient,
    private readonly observer: Observer,
    private readonly timing: { waitTimeoutMs: number; pollIntervalMs: number },
  ) {}

  async run<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly PgParam[] = [],
    options: RunOptions = {},
  ): Promise<QueryResult<R>> {
    const outcome = await this.complete(this.start<R>(sql, params), options.lockWait ?? "forbid");
    if (outcome.status === "error") {
      throw new Error(
        `[${this.label}] 문장이 ${outcome.error.code}로 실패했습니다: ${outcome.error.message}\n${sql}`,
        {
          cause: outcome.error.error,
        },
      );
    }
    return outcome.result;
  }

  async expectError(
    sql: string,
    sqlstate: string,
    params: readonly PgParam[] = [],
    options: RunOptions = {},
  ): Promise<PgStatementError> {
    const outcome = await this.complete(this.start(sql, params), options.lockWait ?? "forbid");
    if (outcome.status === "ok") {
      throw new Error(`[${this.label}] 문장이 ${sqlstate}로 실패해야 했지만 성공했습니다.\n${sql}`);
    }
    if (outcome.error.code !== sqlstate) {
      throw new Error(
        `[${this.label}] 문장이 ${sqlstate}로 실패해야 했지만 ${outcome.error.code}였습니다: ${outcome.error.message}\n${sql}`,
        { cause: outcome.error.error },
      );
    }
    return outcome.error;
  }

  async block<R extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: readonly PgParam[] = [],
    options: BlockOptions = {},
  ): Promise<BlockedStatement<R>> {
    const flight = this.start<R>(sql, params);
    const expectedBlockers = options.blockedBy === undefined ? [] : [options.blockedBy].flat();
    const deadline = Date.now() + this.timing.waitTimeoutMs;
    let last: ActivityRow | null = null;
    while (Date.now() < deadline) {
      if (flight.settled !== null) {
        this.busy = null;
        throw new Error(
          `[${this.label}] 잠금을 기다려야 할 문장이 대기 없이 끝났습니다: ${describeOutcome(flight.settled)}\n${sql}`,
        );
      }
      last = await this.readActivity();
      if (
        isWaitingOnLock(last, flight.sql) &&
        expectedBlockers.every((blocker) => last?.blocking_pids.includes(blocker.pid) === true)
      ) {
        const blocked = new BlockedStatement<R>(this, flight);
        this.unconsumed.add(blocked);
        return blocked;
      }
      await delay(this.timing.pollIntervalMs);
    }
    await this.observer.cancel(this.pid);
    const outcome = await flight.outcome;
    this.busy = null;
    const blockers = expectedBlockers
      .map((blocker) => `${blocker.label}(${blocker.pid})`)
      .join(", ");
    throw new Error(
      `[${this.label}] ${this.timing.waitTimeoutMs}ms 안에 ${blockers === "" ? "" : `${blockers}에 의한 `}잠금 대기가 관찰되지 않았습니다. ` +
        `마지막 상태: state=${last?.state}, wait=${last?.wait_event_type}/${last?.wait_event}, blocking=${JSON.stringify(last?.blocking_pids)}; 취소 결과: ${describeOutcome(outcome)}\n${sql}`,
    );
  }

  async locks(): Promise<HeldLock[]> {
    return this.observer.locks(this.pid);
  }

  private async complete<R extends QueryResultRow>(
    flight: InFlight<R>,
    lockWait: "forbid" | "allow",
  ): Promise<StatementOutcome<R>> {
    try {
      return await this.awaitCompletion(flight, lockWait);
    } finally {
      this.busy = null;
    }
  }

  async readActivity(): Promise<ActivityRow | null> {
    return this.observer.activity(this.pid);
  }

  async awaitCompletion<R extends QueryResultRow>(
    flight: InFlight<R>,
    lockWait: "forbid" | "allow",
  ): Promise<StatementOutcome<R>> {
    const deadline = Date.now() + this.timing.waitTimeoutMs;
    for (;;) {
      const raced = await Promise.race([
        flight.outcome,
        delay(this.timing.pollIntervalMs).then(() => null),
      ]);
      if (raced !== null) {
        return raced;
      }
      const activity = await this.readActivity();
      if (flight.settled !== null) {
        return flight.settled;
      }
      if (lockWait === "forbid" && isWaitingOnLock(activity, flight.sql)) {
        await this.observer.cancel(this.pid);
        const outcome = await flight.outcome;
        throw new Error(
          `[${this.label}] 막히지 않아야 할 문장이 잠금을 기다렸습니다 (blocking=${JSON.stringify(activity?.blocking_pids)}). ` +
            `취소 결과: ${describeOutcome(outcome)}\n${flight.sql}`,
        );
      }
      if (Date.now() >= deadline) {
        await this.observer.cancel(this.pid);
        const outcome = await flight.outcome;
        throw new Error(
          `[${this.label}] ${this.timing.waitTimeoutMs}ms 안에 문장이 끝나지 않았습니다 ` +
            `(state=${activity?.state}, wait=${activity?.wait_event_type}/${activity?.wait_event}). 취소 결과: ${describeOutcome(outcome)}\n${flight.sql}`,
        );
      }
    }
  }

  finishBlocked(blocked: BlockedStatement<QueryResultRow>): void {
    this.unconsumed.delete(blocked);
    this.busy = null;
  }

  get unconsumedCount(): number {
    return this.unconsumed.size;
  }

  async end(): Promise<void> {
    await this.observer.terminate(this.pid);
    await this.client.end().catch(() => {});
  }

  private start<R extends QueryResultRow>(sql: string, params: readonly PgParam[]): InFlight<R> {
    if (this.busy !== null) {
      throw new Error(
        `[${this.label}] 이전 문장이 끝나기 전에 다음 문장을 시작했습니다. 막힌 문장은 settle/expectSuccess/expectError로 먼저 회수하세요.\n이전: ${this.busy.sql}\n다음: ${sql}`,
      );
    }
    const flight = new InFlight<R>(sql, this.client.query<R>(sql, [...params]));
    this.busy = flight;
    return flight;
  }
}

class Observer {
  // All sessions share this one connection, so its queries are serialized.
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly client: PgClient) {}

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async activity(pid: number): Promise<ActivityRow | null> {
    const result = await this.exclusive(() =>
      this.client.query<ActivityRow>(
        `SELECT state, wait_event_type, wait_event, query, pg_blocking_pids(pid) AS blocking_pids
         FROM pg_stat_activity WHERE pid = $1`,
        [pid],
      ),
    );
    return result.rows[0] ?? null;
  }

  async locks(pid: number): Promise<HeldLock[]> {
    const result = await this.exclusive(() =>
      this.client.query<HeldLock>(
        `SELECT locktype, mode, granted, relation::regclass::text AS relation
         FROM pg_locks WHERE pid = $1 ORDER BY locktype, relation, mode`,
        [pid],
      ),
    );
    return result.rows;
  }

  async cancel(pid: number): Promise<void> {
    await this.exclusive(() => this.client.query("SELECT pg_cancel_backend($1)", [pid]));
  }

  async terminate(pid: number): Promise<void> {
    await this.exclusive(() => this.client.query("SELECT pg_terminate_backend($1)", [pid]));
  }

  async end(): Promise<void> {
    await this.exclusive(() => this.client.end());
  }
}

export type PgSessions<L extends string> = {
  readonly sessions: { readonly [K in L]: PgSession };
  close(): Promise<void>;
};

async function connect(connectionString: string, applicationName: string): Promise<PgClient> {
  const client = new PgClient({ connectionString, application_name: applicationName });
  // Terminating a backend emits a connection error that would otherwise crash the process.
  client.on("error", () => {});
  await client.connect();
  return client;
}

export async function openPgSessions<const L extends string>(
  connectionString: string,
  labels: readonly L[],
  options: PgSessionsOptions = {},
): Promise<PgSessions<L>> {
  if (
    new Set(labels).size !== labels.length ||
    labels.length === 0 ||
    !labels.every((label) => /^[a-z][a-z0-9_]{0,30}$/.test(label))
  ) {
    throw new Error(`세션 라벨은 서로 다른 소문자 식별자여야 합니다: ${labels.join(", ")}`);
  }
  const prefix = options.applicationNamePrefix ?? "pgs";
  const timing = {
    waitTimeoutMs: options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
    pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  };
  const opened: PgClient[] = [];
  try {
    const observerClient = await connect(connectionString, `${prefix}:observer`);
    opened.push(observerClient);
    const observer = new Observer(observerClient);
    const sessionList: PgSession[] = [];
    for (const label of labels) {
      const client = await connect(connectionString, `${prefix}:${label}`);
      opened.push(client);
      const pidResult = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      if (options.searchPath !== undefined) {
        await client.query("SELECT set_config('search_path', $1, false)", [options.searchPath]);
      }
      sessionList.push(new PgSession(label, pidResult.rows[0].pid, client, observer, timing));
    }
    // SAFETY: exactly one session was created per label.
    const sessions = Object.fromEntries(sessionList.map((session) => [session.label, session])) as {
      readonly [K in L]: PgSession;
    };
    let closed = false;
    return {
      sessions,
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        const leaks = sessionList
          .filter((session) => session.unconsumedCount > 0)
          .map((session) => session.label);
        const results = await Promise.allSettled(sessionList.map((session) => session.end()));
        await observer.end().catch(() => {});
        const failures = results.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        );
        if (leaks.length > 0) {
          failures.push(
            new Error(`결과를 회수하지 않은 막힌 문장이 남아 있었습니다: ${leaks.join(", ")}`),
          );
        }
        if (failures.length > 0) {
          throw new AggregateError(failures, "PostgreSQL 세션 정리에 실패했습니다.");
        }
      },
    };
  } catch (error) {
    await Promise.allSettled(opened.map((client) => client.end()));
    throw error;
  }
}
