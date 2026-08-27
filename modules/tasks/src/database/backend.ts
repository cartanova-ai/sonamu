import { getLogger } from "@logtape/logtape";
import { camelize } from "inflection";
import knex from "knex";
import { type Knex } from "knex";

import { DEFAULT_NAMESPACE_ID } from "../backend";
import {
  type Backend,
  type CancelWorkflowRunParams,
  type ClaimWorkflowRunParams,
  type CompleteStepAttemptParams,
  type CompleteWorkflowRunParams,
  type CreateStepAttemptParams,
  type CreateWorkflowRunParams,
  type ExtendWorkflowRunLeaseParams,
  type FailStepAttemptParams,
  type FailWorkflowRunParams,
  type GetStepAttemptParams,
  type GetWorkflowRunParams,
  type ListStepAttemptsParams,
  type ListWorkflowRunsParams,
  type PaginatedResponse,
  type PauseWorkflowRunParams,
  type ResumeWorkflowRunParams,
  type SleepWorkflowRunParams,
} from "../backend";
import { type JsonValue } from "../core/json";
import { mergeRetryPolicy } from "../core/retry";
import { type SerializableRetryPolicy } from "../core/retry";
import { type StepAttempt } from "../core/step";
import { type WorkflowRun } from "../core/workflow";
import { DEFAULT_SCHEMA, migrate } from "./base";
import { PostgresPubSub } from "./pubsub";
import { type OnSubscribed } from "./pubsub";

export const DEFAULT_LISTEN_CHANNEL = "new_tasks" as const;
const DEFAULT_PAGINATION_PAGE_SIZE = 100 as const;

interface BackendPostgresOptions {
  namespaceId?: string;
  runMigrations?: boolean;

  // default: true
  usePubSub?: boolean;
}

interface DatabaseRow {
  [column: string]: JsonValue | Date | Buffer | bigint | undefined;
}

const logger = getLogger(["sonamu", "internal", "tasks"]);
const queryLogger = getLogger(["sonamu", "internal", "tasks", "query"]);

const camelizeRow = (row: DatabaseRow) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [camelize(key, true), value]));

/**
 * Manages a connection to a Postgres database for workflow operations.
 */
export class BackendPostgres implements Backend {
  private config: Knex.Config;
  private namespaceId: string;
  private usePubSub: boolean;
  private pubsub: PostgresPubSub | null = null;
  private initialized: boolean = false;
  private runMigrations: boolean;

  private knexInstance: Knex | null = null;
  private get knex(): Knex {
    if (!this.knexInstance) {
      this.knexInstance = knex(this.config);
      this.knexInstance.on("query", (query) => {
        queryLogger.debug("SQL: {query}, Values: {bindings}", {
          query: query.sql,
          bindings: query.bindings,
        });
      });
    }

    return this.knexInstance;
  }

  constructor(config: Knex.Config, options?: BackendPostgresOptions) {
    this.config = {
      ...config,
      postProcessResponse: (result, _queryContext) => {
        if (result === null || result === undefined) {
          return result;
        }

        if (config?.postProcessResponse) {
          result = config.postProcessResponse(result, _queryContext);
        }

        if (Array.isArray(result)) {
          return result.map(camelizeRow);
        }

        return camelizeRow(result);
      },
    };

    const { namespaceId, usePubSub, runMigrations } = {
      namespaceId: DEFAULT_NAMESPACE_ID,
      usePubSub: true,
      runMigrations: true,
      ...options,
    };

    this.namespaceId = namespaceId;
    this.usePubSub = usePubSub;
    this.runMigrations = runMigrations;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.runMigrations) {
      await migrate(this.config, DEFAULT_SCHEMA);
    }

    this.initialized = true;
  }

  async subscribe(callback: OnSubscribed) {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    if (!this.usePubSub) {
      return;
    }

    if (!this.pubsub) {
      this.pubsub = await PostgresPubSub.create(this.knex);
    }

    this.pubsub.listenEvent(DEFAULT_LISTEN_CHANNEL, callback);
  }

  async publish(payload?: string): Promise<void> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    if (!this.usePubSub) {
      return;
    }

    await this.knex.raw(
      payload
        ? `NOTIFY ${DEFAULT_LISTEN_CHANNEL}, '${payload}'`
        : `NOTIFY ${DEFAULT_LISTEN_CHANNEL}`,
    );
  }

  async stop(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    await this.pubsub?.destroy();
    this.pubsub = null;
    await this.knex.destroy();
    this.knexInstance = null;
    this.initialized = false;
  }

  async createWorkflowRun(params: CreateWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Creating workflow run: {workflowName}:{version}", {
      workflowName: params.workflowName,
      version: params.version,
    });

    // config에 retryPolicy를 포함시킵니다.
    const configWithRetryPolicy =
      params.config !== null && !Array.isArray(params.config) && params.config instanceof Object
        ? { ...params.config, retryPolicy: params.retryPolicy ?? undefined }
        : { retryPolicy: params.retryPolicy ?? undefined };

    const qb = this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .insert({
        namespace_id: this.namespaceId,
        id: crypto.randomUUID(),
        workflow_name: params.workflowName,
        version: params.version,
        status: "pending",
        idempotency_key: params.idempotencyKey,
        config: JSON.stringify(configWithRetryPolicy),
        context: params.context,
        input: params.input,
        attempts: 0,
        available_at: params.availableAt ?? this.knex.fn.now(),
        deadline_at: params.deadlineAt,
        created_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    const workflowRun = await qb;
    if (!workflowRun[0]) {
      logger.error("Failed to create workflow run: {params}", { params });
      throw new Error("Failed to create workflow run");
    }

    return workflowRun[0];
  }

  async getWorkflowRun(params: GetWorkflowRunParams): Promise<WorkflowRun | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Getting workflow run: {workflowRunId}", { workflowRunId: params.workflowRunId });
    const workflowRun = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .select(
        "namespace_id",
        "id",
        "workflow_name",
        "version",
        "status",
        "idempotency_key",
        "config",
        "context",
        "input",
        "output",
        "error",
        "attempts",
        "parent_step_attempt_namespace_id",
        "parent_step_attempt_id",
        "worker_id",
        "available_at",
        "deadline_at",
        "started_at",
        "finished_at",
        "created_at",
        "updated_at",
      )
      .first();

    return workflowRun ?? null;
  }

  async listWorkflowRuns(params: ListWorkflowRunsParams): Promise<PaginatedResponse<WorkflowRun>> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Listing workflow runs: {after}, {before}", {
      after: params.after,
      before: params.before,
    });
    const limit = params.limit ?? DEFAULT_PAGINATION_PAGE_SIZE;
    const { after, before } = params;
    const order = params.order ?? "asc";
    const reverseOrder = order === "asc" ? "desc" : "asc";

    let cursor: Cursor | null = null;
    if (after) {
      cursor = decodeCursor(after);
    } else if (before) {
      cursor = decodeCursor(before);
    }

    const qb = this.buildListWorkflowRunsWhere(params, cursor, order);
    const rows = await qb
      .orderBy("created_at", before ? reverseOrder : order)
      .orderBy("id", before ? reverseOrder : order)
      .limit(limit + 1);

    return this.processPaginationResults(rows, limit, after !== undefined, before !== undefined);
  }

  private buildListWorkflowRunsWhere(
    params: ListWorkflowRunsParams,
    cursor: Cursor | null,
    order: "asc" | "desc",
  ) {
    const { after } = params;
    const qb = this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId);

    if (cursor) {
      // asc: after → ">", before → "<"
      // desc: after → "<", before → ">"
      const operator = (order === "asc") === !!after ? ">" : "<";
      qb.whereRaw(`("created_at", "id") ${operator} (?, ?)`, [
        cursor.createdAt.toISOString(),
        cursor.id,
      ]);
    }

    if (params.status && params.status.length > 0) {
      qb.whereIn("status", params.status);
    }
    if (params.workflowName) {
      qb.where("workflow_name", params.workflowName);
    }
    if (params.createdAfter) {
      qb.where("created_at", ">=", params.createdAfter);
    }
    if (params.createdBefore) {
      qb.where("created_at", "<=", params.createdBefore);
    }

    return qb;
  }

  async claimWorkflowRun(params: ClaimWorkflowRunParams): Promise<WorkflowRun | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Claiming workflow run: {workerId}, {leaseDurationMs}", {
      workerId: params.workerId,
      leaseDurationMs: params.leaseDurationMs,
    });
    return await this.knex.transaction(async (trx) => {
      // 트랜잭션 시작 시각보다 늦게 생성된 작업도 각 쿼리의 실제 실행 시각을 기준으로 판정합니다.
      const currentTimestamp = trx.raw("statement_timestamp()");

      await trx
        .withSchema(DEFAULT_SCHEMA)
        .table("workflow_runs")
        .update({
          status: "failed",
          error: JSON.stringify({ message: "Workflow run deadline exceeded" }),
          worker_id: null,
          available_at: null,
          finished_at: currentTimestamp,
          updated_at: currentTimestamp,
        })
        .where("namespace_id", this.namespaceId)
        .whereIn("status", ["pending", "running", "sleeping"])
        .whereNotNull("deadline_at")
        .where("deadline_at", "<=", currentTimestamp);

      const [candidate] = await trx
        .withSchema(DEFAULT_SCHEMA)
        .table("workflow_runs")
        .select("id", "status")
        .where("namespace_id", this.namespaceId)
        .whereIn("status", ["pending", "running", "sleeping"])
        .where("available_at", "<=", currentTimestamp)
        .where((qb) => {
          qb.whereNull("deadline_at").orWhere("deadline_at", ">", currentTimestamp);
        })
        .orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
        .orderBy("available_at", "asc")
        .orderBy("created_at", "asc")
        .limit(1)
        .forUpdate()
        .skipLocked();

      if (!candidate) {
        return null;
      }

      if (candidate.status === "running") {
        await trx
          .withSchema(DEFAULT_SCHEMA)
          .table("step_attempts")
          .where("namespace_id", this.namespaceId)
          .where("workflow_run_id", candidate.id)
          .where("status", "running")
          .where("kind", "function")
          .update({
            status: "failed",
            error: JSON.stringify({ message: "Workflow run lease expired" }),
            finished_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          });
      }

      const [claimed] = await trx
        .withSchema(DEFAULT_SCHEMA)
        .table("workflow_runs")
        .where("namespace_id", this.namespaceId)
        .where("id", candidate.id)
        .update({
          status: "running",
          attempts: trx.raw("attempts + 1"),
          worker_id: params.workerId,
          available_at: trx.raw("statement_timestamp() + ? * INTERVAL '1 millisecond'", [
            params.leaseDurationMs,
          ]),
          started_at: trx.raw("COALESCE(started_at, statement_timestamp())"),
          updated_at: currentTimestamp,
        })
        .returning("*");

      return claimed ?? null;
    });
  }

  async extendWorkflowRunLease(params: ExtendWorkflowRunLeaseParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Extending workflow run lease: {workflowRunId}, {workerId}, {leaseDurationMs}", {
      workflowRunId: params.workflowRunId,
      workerId: params.workerId,
      leaseDurationMs: params.leaseDurationMs,
    });
    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .where("status", "running")
      .where("worker_id", params.workerId)
      .update({
        available_at: this.knex.raw(`NOW() + ${params.leaseDurationMs} * INTERVAL '1 millisecond'`),
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      const wr = await this.getWorkflowRun({ workflowRunId: params.workflowRunId });
      if (wr && (wr.status === "paused" || wr.status === "canceled")) {
        throw new Error("Workflow run is paused or canceled");
      }

      logger.error("Failed to extend lease for workflow run: {params}", { params });
      throw new Error("Failed to extend lease for workflow run");
    }

    return updated;
  }

  async sleepWorkflowRun(params: SleepWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Sleeping workflow run: {workflowRunId}, {workerId}, {availableAt}", {
      workflowRunId: params.workflowRunId,
      workerId: params.workerId,
      availableAt: params.availableAt,
    });

    // 'succeeded' status is deprecated
    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .whereNotIn("status", ["succeeded", "completed", "failed", "canceled"])
      .where("worker_id", params.workerId)
      .update({
        status: "sleeping",
        available_at: params.availableAt,
        worker_id: null,
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      logger.error("Failed to sleep workflow run: {params}", { params });
      throw new Error("Failed to sleep workflow run");
    }

    return updated;
  }

  async completeWorkflowRun(params: CompleteWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Completing workflow run: {workflowRunId}, {workerId}, {output}", {
      workflowRunId: params.workflowRunId,
      workerId: params.workerId,
      output: params.output,
    });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .where("status", "running")
      .where("worker_id", params.workerId)
      .update({
        status: "completed",
        output: JSON.stringify(params.output),
        error: null,
        worker_id: params.workerId,
        available_at: null,
        finished_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      logger.error("Failed to complete workflow run: {params}", { params });
      throw new Error("Failed to complete workflow run");
    }

    return updated;
  }

  async failWorkflowRun(params: FailWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    const { workflowRunId, error, forceComplete, customDelayMs } = params;

    logger.info("Failing workflow run: {workflowRunId}, {workerId}, {error}", {
      workflowRunId: params.workflowRunId,
      workerId: params.workerId,
      error: params.error,
    });

    const workflowRun = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", workflowRunId)
      .first();

    if (!workflowRun) {
      throw new Error("Workflow run not found");
    }

    const config =
      Object.prototype.toString.call(workflowRun.config) === "[object String]"
        ? JSON.parse(String(workflowRun.config))
        : workflowRun.config;
    const savedRetryPolicy: SerializableRetryPolicy | undefined = config?.retryPolicy;
    const retryPolicy = mergeRetryPolicy(savedRetryPolicy);

    const { initialIntervalMs, backoffCoefficient, maximumIntervalMs, maxAttempts } = retryPolicy;

    const currentAttempts = workflowRun.attempts ?? 0;
    const shouldForceComplete = forceComplete || currentAttempts >= maxAttempts;

    if (shouldForceComplete) {
      const [updated] = await this.knex
        .withSchema(DEFAULT_SCHEMA)
        .table("workflow_runs")
        .where("namespace_id", this.namespaceId)
        .where("id", workflowRunId)
        .where("status", "running")
        .where("worker_id", params.workerId)
        .update({
          status: "failed",
          available_at: null,
          finished_at: this.knex.fn.now(),
          error: JSON.stringify(error),
          worker_id: null,
          started_at: null,
          updated_at: this.knex.fn.now(),
        })
        .returning("*");

      if (!updated) {
        logger.error("Failed to mark workflow run failed: {params}", { params });
        throw new Error("Failed to mark workflow run failed");
      }
      return updated;
    }

    // this beefy query updates a workflow's status, available_at, and
    // finished_at based on the workflow's deadline and retry policy
    //
    // if the next retry would exceed the deadline, the run is marked as
    // 'failed' and finalized, otherwise, the run is rescheduled with an updated
    // 'available_at' timestamp for the next retry
    const retryIntervalExpr = customDelayMs
      ? `${customDelayMs} * INTERVAL '1 millisecond'`
      : `LEAST(${initialIntervalMs} * POWER(${backoffCoefficient}, "attempts" - 1), ${maximumIntervalMs}) * INTERVAL '1 millisecond'`;
    const deadlineExceededCondition = `"deadline_at" IS NOT NULL AND NOW() + (${retryIntervalExpr}) >= "deadline_at"`;
    const serializedError = JSON.stringify(error);
    const deadlineExceededError = JSON.stringify({ message: "Workflow run deadline exceeded" });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", workflowRunId)
      .where("status", "running")
      .where("worker_id", params.workerId)
      .update({
        status: this.knex.raw(
          `CASE WHEN ${deadlineExceededCondition} THEN 'failed' ELSE 'pending' END`,
        ),
        available_at: this.knex.raw(
          `CASE WHEN ${deadlineExceededCondition} THEN NULL ELSE NOW() + (${retryIntervalExpr}) END`,
        ),
        finished_at: this.knex.raw(
          `CASE WHEN ${deadlineExceededCondition} THEN NOW() ELSE NULL END`,
        ),
        error: this.knex.raw(
          `CASE WHEN ${deadlineExceededCondition} THEN ?::jsonb ELSE ?::jsonb END`,
          [deadlineExceededError, serializedError],
        ),
        worker_id: null,
        started_at: null,
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      logger.error("Failed to mark workflow run failed: {params}", { params });
      throw new Error("Failed to mark workflow run failed");
    }

    return updated;
  }

  async cancelWorkflowRun(params: CancelWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Canceling workflow run: {workflowRunId}", { workflowRunId: params.workflowRunId });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .whereIn("status", ["pending", "running", "sleeping", "paused"])
      .update({
        status: "canceled",
        worker_id: null,
        available_at: null,
        finished_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      // workflow may already be in a terminal state
      const existing = await this.getWorkflowRun({
        workflowRunId: params.workflowRunId,
      });
      if (!existing) {
        throw new Error(`Workflow run ${params.workflowRunId} does not exist`);
      }

      // if already canceled, just return it
      if (existing.status === "canceled") {
        return existing;
      }

      // throw error for completed/failed workflows
      // 'succeeded' status is deprecated
      if (["succeeded", "completed", "failed"].includes(existing.status)) {
        logger.error("Cannot cancel workflow run: {params} with status {status}", {
          params,
          status: existing.status,
        });
        throw new Error(
          `Cannot cancel workflow run ${params.workflowRunId} with status ${existing.status}`,
        );
      }

      logger.error("Failed to cancel workflow run: {params}", { params });
      throw new Error("Failed to cancel workflow run");
    }

    return updated;
  }

  async pauseWorkflowRun(params: PauseWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Pausing workflow run: {workflowRunId}", { workflowRunId: params.workflowRunId });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .whereIn("status", ["pending", "running", "sleeping"])
      .update({
        status: "paused",
        worker_id: null,
        available_at: null,
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      const existing = await this.getWorkflowRun({
        workflowRunId: params.workflowRunId,
      });
      if (!existing) {
        throw new Error(`Workflow run ${params.workflowRunId} does not exist`);
      }

      // 이미 paused이면 멱등하게 반환합니다.
      if (existing.status === "paused") {
        return existing;
      }

      // 터미널 상태에서는 pause할 수 없습니다.
      // 'succeeded' status is deprecated
      if (["succeeded", "completed", "failed", "canceled"].includes(existing.status)) {
        logger.error("Cannot pause workflow run: {params} with status {status}", {
          params,
          status: existing.status,
        });
        throw new Error(
          `Cannot pause workflow run ${params.workflowRunId} with status ${existing.status}`,
        );
      }

      logger.error("Failed to pause workflow run: {params}", { params });
      throw new Error("Failed to pause workflow run");
    }

    return updated;
  }

  async resumeWorkflowRun(params: ResumeWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Resuming workflow run: {workflowRunId}", { workflowRunId: params.workflowRunId });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .where("status", "paused")
      .update({
        status: "pending",
        available_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      const existing = await this.getWorkflowRun({
        workflowRunId: params.workflowRunId,
      });
      if (!existing) {
        throw new Error(`Workflow run ${params.workflowRunId} does not exist`);
      }

      // 이미 pending/running이면 멱등하게 반환합니다.
      if (existing.status === "pending" || existing.status === "running") {
        return existing;
      }

      // 터미널 상태에서는 resume할 수 없습니다.
      // 'succeeded' status is deprecated
      if (["succeeded", "completed", "failed", "canceled"].includes(existing.status)) {
        logger.error("Cannot resume workflow run: {params} with status {status}", {
          params,
          status: existing.status,
        });
        throw new Error(
          `Cannot resume workflow run ${params.workflowRunId} with status ${existing.status}`,
        );
      }

      logger.error("Failed to resume workflow run: {params}", { params });
      throw new Error("Failed to resume workflow run");
    }

    return updated;
  }

  async createStepAttempt(params: CreateStepAttemptParams): Promise<StepAttempt> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Creating step attempt: {workflowRunId}, {stepName}, {kind}", {
      workflowRunId: params.workflowRunId,
      stepName: params.stepName,
      kind: params.kind,
    });

    const stepAttemptId = crypto.randomUUID();
    const insertResult = await this.knex.raw<{ rowCount?: number }>(
      `
        INSERT INTO ${DEFAULT_SCHEMA}.step_attempts (
          namespace_id,
          id,
          workflow_run_id,
          step_name,
          kind,
          status,
          config,
          context,
          started_at,
          created_at,
          updated_at
        )
        SELECT
          ?,
          ?,
          wr.id,
          ?,
          ?,
          ?,
          ?::jsonb,
          ?::jsonb,
          NOW(),
          date_trunc('milliseconds', NOW()),
          NOW()
        FROM ${DEFAULT_SCHEMA}.workflow_runs AS wr
        WHERE wr.namespace_id = ?
          AND wr.id = ?
          AND wr.status = ?
          AND wr.worker_id = ?
        FOR UPDATE OF wr
      `,
      [
        this.namespaceId,
        stepAttemptId,
        params.stepName,
        params.kind,
        "running",
        JSON.stringify(params.config),
        JSON.stringify(params.context),
        this.namespaceId,
        params.workflowRunId,
        "running",
        params.workerId,
      ],
    );

    if (insertResult.rowCount !== 1) {
      logger.error("Failed to create step attempt: {params}", { params });
      throw new Error("Failed to create step attempt");
    }

    const stepAttempt = await this.getStepAttempt({ stepAttemptId });
    if (!stepAttempt) {
      logger.error("Failed to load created step attempt: {params}", { params });
      throw new Error("Failed to create step attempt");
    }

    return stepAttempt;
  }

  async getStepAttempt(params: GetStepAttemptParams): Promise<StepAttempt | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Getting step attempt: {stepAttemptId}", { stepAttemptId: params.stepAttemptId });

    const stepAttempt = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts")
      .where("namespace_id", this.namespaceId)
      .where("id", params.stepAttemptId)
      .first();

    return stepAttempt ?? null;
  }

  async listStepAttempts(params: ListStepAttemptsParams): Promise<PaginatedResponse<StepAttempt>> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Listing step attempts: {workflowRunId}, {after}, {before}", {
      workflowRunId: params.workflowRunId,
      after: params.after,
      before: params.before,
    });

    const limit = params.limit ?? DEFAULT_PAGINATION_PAGE_SIZE;
    const { after, before } = params;
    const order = params.order ?? "asc";
    const reverseOrder = order === "asc" ? "desc" : "asc";

    let cursor: Cursor | null = null;
    if (after) {
      cursor = decodeCursor(after);
    } else if (before) {
      cursor = decodeCursor(before);
    }

    const qb = this.buildListStepAttemptsWhere(params, cursor, order);
    const rows = await qb
      .orderBy("created_at", before ? reverseOrder : order)
      .orderBy("id", before ? reverseOrder : order)
      .limit(limit + 1);

    return this.processPaginationResults(rows, limit, after !== undefined, before !== undefined);
  }

  private buildListStepAttemptsWhere(
    params: ListStepAttemptsParams,
    cursor: Cursor | null,
    order: "asc" | "desc",
  ) {
    const { after } = params;
    const qb = this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts")
      .where("namespace_id", this.namespaceId)
      .where("workflow_run_id", params.workflowRunId);

    if (cursor) {
      // asc: after → ">", before → "<"
      // desc: after → "<", before → ">"
      const operator = (order === "asc") === !!after ? ">" : "<";
      return qb.whereRaw(`("created_at", "id") ${operator} (?, ?)`, [
        cursor.createdAt.toISOString(),
        cursor.id,
      ]);
    }

    return qb;
  }

  private processPaginationResults<T extends Cursor>(
    rows: T[],
    limit: number,
    hasAfter: boolean,
    hasBefore: boolean,
  ): PaginatedResponse<T> {
    const data = rows;
    let hasNext = false;
    let hasPrev = false;

    if (hasBefore) {
      data.reverse();
      if (data.length > limit) {
        hasPrev = true;
        data.shift();
      }
      hasNext = true;
    } else {
      if (data.length > limit) {
        hasNext = true;
        data.pop();
      }
      if (hasAfter) {
        hasPrev = true;
      }
    }

    const lastItem = data.at(-1);
    const nextCursor = hasNext && lastItem ? encodeCursor(lastItem) : null;
    const firstItem = data[0];
    const prevCursor = hasPrev && firstItem ? encodeCursor(firstItem) : null;

    return {
      data,
      pagination: {
        next: nextCursor,
        prev: prevCursor,
      },
    };
  }

  // WHERE 조건에 wr.status='running', sa.status='running'이 포함되어 있어,
  // 외부에서 워크플로우 상태가 변경된 경우(pause/cancel) null을 반환합니다.
  // 예상하지 못한 이유로 실패한 경우에는 에러를 로깅합니다.
  async completeStepAttempt(params: CompleteStepAttemptParams): Promise<StepAttempt | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Marking step attempt as completed: {workflowRunId}, {stepAttemptId}, {workerId}", {
      workflowRunId: params.workflowRunId,
      stepAttemptId: params.stepAttemptId,
      workerId: params.workerId,
    });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts as sa")
      .update({
        status: "completed",
        output: JSON.stringify(params.output),
        error: null,
        finished_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })
      .updateFrom(`${DEFAULT_SCHEMA}.workflow_runs as wr`)
      .where("sa.namespace_id", this.namespaceId)
      .where("sa.workflow_run_id", params.workflowRunId)
      .where("sa.id", params.stepAttemptId)
      .where("sa.status", "running")
      .where("wr.namespace_id", this.knex.ref("sa.namespace_id"))
      .where("wr.id", this.knex.ref("sa.workflow_run_id"))
      .where("wr.status", "running")
      .where("wr.worker_id", params.workerId)
      .returning("sa.*");

    if (!updated) {
      return this.handleStepAttemptUpdateMiss("completed", params);
    }

    return updated;
  }

  async failStepAttempt(params: FailStepAttemptParams): Promise<StepAttempt | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    logger.info("Marking step attempt as failed: {workflowRunId}, {stepAttemptId}, {workerId}", {
      workflowRunId: params.workflowRunId,
      stepAttemptId: params.stepAttemptId,
      workerId: params.workerId,
    });
    logger.info("Error: {error.message}", { error: params.error.message });

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts as sa")
      .update({
        status: "failed",
        output: null,
        error: JSON.stringify(params.error),
        finished_at: this.knex.fn.now(),
        updated_at: this.knex.fn.now(),
      })
      .updateFrom(`${DEFAULT_SCHEMA}.workflow_runs as wr`)
      .where("sa.namespace_id", this.namespaceId)
      .where("sa.workflow_run_id", params.workflowRunId)
      .where("sa.id", params.stepAttemptId)
      .where("sa.status", "running")
      .where("wr.namespace_id", this.knex.ref("sa.namespace_id"))
      .where("wr.id", this.knex.ref("sa.workflow_run_id"))
      .where("wr.status", "running")
      .where("wr.worker_id", params.workerId)
      .returning("sa.*");

    if (!updated) {
      return this.handleStepAttemptUpdateMiss("failed", params);
    }

    return updated;
  }

  /**
   * completeStepAttempt/failStepAttempt에서 UPDATE가 0건일 때,
   * 외부 상태 변경(pause/cancel)에 의한 것인지 판단합니다.
   * - 외부 상태 변경이면 해당 step의 상태도 워크플로우와 동일하게 맞추고 null을 반환합니다.
   * - 그 외에는 예상하지 못한 상황이므로 에러를 throw합니다.
   */
  private async handleStepAttemptUpdateMiss(
    method: string,
    params: { workflowRunId: string; stepAttemptId: string; workerId: string },
  ): Promise<null> {
    const wr = await this.getWorkflowRun({ workflowRunId: params.workflowRunId });

    // 워크플로우가 외부에서 paused/canceled된 경우 → step 상태도 동일하게 갱신하고 null 반환
    if (wr && (wr.status === "paused" || wr.status === "canceled")) {
      await this.knex
        .withSchema(DEFAULT_SCHEMA)
        .table("step_attempts")
        .where("namespace_id", this.namespaceId)
        .where("id", params.stepAttemptId)
        .whereIn("status", ["running", "paused"])
        .update({
          status: wr.status,
          updated_at: this.knex.fn.now(),
        });
      return null;
    }

    // 그 외(워크플로우가 여전히 running인데 UPDATE가 안 된 경우 등) → 예상 못한 상황
    logger.error("Failed to mark step attempt {method}: {params}", {
      method,
      params,
    });
    throw new Error(`Failed to mark step attempt ${method}`);
  }
}

/**
 * Cursor used for pagination. Requires created_at and id fields. Because JS
 * Date does not natively support microsecond precision dates, created_at should
 * be stored with millisecond precision in paginated tables to avoid issues with
 * cursor comparisons.
 */
interface Cursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(item: Cursor): string {
  const encoded = Buffer.from(
    JSON.stringify({ createdAt: item.createdAt.toISOString(), id: item.id }),
  ).toString("base64");
  return encoded;
}

export function decodeCursor(cursor: string): Cursor {
  const decoded = Buffer.from(cursor, "base64").toString("utf8");
  let parsed: { createdAt: string; id: string };
  try {
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
  if (!parsed.createdAt || !parsed.id) {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
  return {
    createdAt: new Date(parsed.createdAt),
    id: parsed.id,
  };
}
