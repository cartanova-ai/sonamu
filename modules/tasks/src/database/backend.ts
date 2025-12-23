import { camelize } from "inflection";
import knex, { type Knex } from "knex";
import {
  type Backend,
  type CancelWorkflowRunParams,
  type ClaimWorkflowRunParams,
  type CompleteStepAttemptParams,
  type CompleteWorkflowRunParams,
  type CreateStepAttemptParams,
  type CreateWorkflowRunParams,
  DEFAULT_NAMESPACE_ID,
  type ExtendWorkflowRunLeaseParams,
  type FailStepAttemptParams,
  type FailWorkflowRunParams,
  type GetStepAttemptParams,
  type GetWorkflowRunParams,
  type ListStepAttemptsParams,
  type ListWorkflowRunsParams,
  type PaginatedResponse,
  type SleepWorkflowRunParams,
} from "../backend";
import { DEFAULT_RETRY_POLICY } from "../core/retry";
import type { StepAttempt } from "../core/step";
import type { WorkflowRun } from "../core/workflow";
import { DEFAULT_SCHEMA, migrate } from "./base";
import { type OnSubscribed, PostgresPubSub } from "./pubsub";

export const DEFAULT_LISTEN_CHANNEL = "new_tasks" as const;
const DEFAULT_PAGINATION_PAGE_SIZE = 100 as const;

interface BackendPostgresOptions {
  namespaceId?: string;
  runMigrations?: boolean;

  // default: true
  usePubSub?: boolean;
}

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

  private _knex: Knex | null = null;
  private get knex(): Knex {
    if (!this._knex) {
      this._knex = knex(this.config);
    }

    return this._knex;
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

        const camelizeRow = (row: Record<string, unknown>) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [camelize(key, true), value]),
          );

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
  }

  async createWorkflowRun(params: CreateWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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
        config: params.config,
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
      throw new Error("Failed to create workflow run");
    }

    return workflowRun[0];
  }

  async getWorkflowRun(params: GetWorkflowRunParams): Promise<WorkflowRun | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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

    const limit = params.limit ?? DEFAULT_PAGINATION_PAGE_SIZE;
    const { after, before } = params;

    let cursor: Cursor | null = null;
    if (after) {
      cursor = decodeCursor(after);
    } else if (before) {
      cursor = decodeCursor(before);
    }

    const qb = this.buildListWorkflowRunsWhere(params, cursor);
    const rows = await qb
      .orderBy("created_at", before ? "desc" : "asc")
      .orderBy("id", before ? "desc" : "asc")
      .limit(limit + 1);

    return this.processPaginationResults(
      rows,
      limit,
      typeof after === "string",
      typeof before === "string",
    );
  }

  private buildListWorkflowRunsWhere(params: ListWorkflowRunsParams, cursor: Cursor | null) {
    const { after } = params;
    const qb = this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId);

    if (cursor) {
      const operator = after ? ">" : "<";
      return qb.whereRaw(`("created_at", "id") ${operator} (?, ?)`, [
        cursor.createdAt.toISOString(),
        cursor.id,
      ]);
    }

    return qb;
  }

  async claimWorkflowRun(params: ClaimWorkflowRunParams): Promise<WorkflowRun | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    const claimed = await this.knex
      .with("expired", (qb) =>
        qb
          .withSchema(DEFAULT_SCHEMA)
          .table("workflow_runs")
          .update({
            status: "failed",
            error: JSON.stringify({ message: "Workflow run deadline exceeded" }),
            worker_id: null,
            available_at: null,
            finished_at: this.knex.raw("NOW()"),
            updated_at: this.knex.raw("NOW()"),
          })
          .where("namespace_id", this.namespaceId)
          .whereIn("status", ["pending", "running", "sleeping"])
          .whereNotNull("deadline_at")
          .where("deadline_at", "<=", this.knex.raw("NOW()"))
          .returning("id"),
      )
      .with("candidate", (qb) =>
        qb
          .withSchema(DEFAULT_SCHEMA)
          .select("id")
          .from("workflow_runs")
          .where("namespace_id", this.namespaceId)
          .whereIn("status", ["pending", "running", "sleeping"])
          .where("available_at", "<=", this.knex.raw("NOW()"))
          .where((qb2) => {
            qb2.whereNull("deadline_at").orWhere("deadline_at", ">", this.knex.raw("NOW()"));
          })
          .orderByRaw("CASE WHEN status = 'pending' THEN 0 ELSE 1 END")
          .orderBy("available_at", "asc")
          .orderBy("created_at", "asc")
          .limit(1)
          .forUpdate()
          .skipLocked(),
      )
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs as wr")
      .where("wr.namespace_id", this.namespaceId)
      .where("wr.id", this.knex.ref("candidate.id"))
      .update({
        status: "running",
        attempts: this.knex.raw("wr.attempts + 1"),
        worker_id: params.workerId,
        available_at: this.knex.raw(`NOW() + ${params.leaseDurationMs} * INTERVAL '1 millisecond'`),
        started_at: this.knex.raw("COALESCE(wr.started_at, NOW())"),
        updated_at: this.knex.raw("NOW()"),
      })
      .updateFrom("candidate")
      .returning("wr.*");

    return claimed[0] ?? null;
  }

  async extendWorkflowRunLease(params: ExtendWorkflowRunLeaseParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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
      throw new Error("Failed to extend lease for workflow run");
    }

    return updated;
  }

  async sleepWorkflowRun(params: SleepWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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
      throw new Error("Failed to sleep workflow run");
    }

    return updated;
  }

  async completeWorkflowRun(params: CompleteWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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
      throw new Error("Failed to complete workflow run");
    }

    return updated;
  }

  async failWorkflowRun(params: FailWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    const { workflowRunId, error } = params;
    const { initialIntervalMs, backoffCoefficient, maximumIntervalMs } = DEFAULT_RETRY_POLICY;

    // this beefy query updates a workflow's status, available_at, and
    // finished_at based on the workflow's deadline and retry policy
    //
    // if the next retry would exceed the deadline, the run is marked as
    // 'failed' and finalized, otherwise, the run is rescheduled with an updated
    // 'available_at' timestamp for the next retry
    const retryIntervalExpr = `LEAST(${initialIntervalMs} * POWER(${backoffCoefficient}, "attempts" - 1), ${maximumIntervalMs}) * INTERVAL '1 millisecond'`;
    const deadlineExceededCondition = `"deadline_at" IS NOT NULL AND NOW() + (${retryIntervalExpr}) >= "deadline_at"`;

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
        error: JSON.stringify(error),
        worker_id: null,
        started_at: null,
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!updated) {
      throw new Error("Failed to mark workflow run failed");
    }

    return updated;
  }

  async cancelWorkflowRun(params: CancelWorkflowRunParams): Promise<WorkflowRun> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    const [updated] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("workflow_runs")
      .where("namespace_id", this.namespaceId)
      .where("id", params.workflowRunId)
      .whereIn("status", ["pending", "running", "sleeping"])
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
        throw new Error(
          `Cannot cancel workflow run ${params.workflowRunId} with status ${existing.status}`,
        );
      }

      throw new Error("Failed to cancel workflow run");
    }

    return updated;
  }

  async createStepAttempt(params: CreateStepAttemptParams): Promise<StepAttempt> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

    const [stepAttempt] = await this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts")
      .insert({
        namespace_id: this.namespaceId,
        id: crypto.randomUUID(),
        workflow_run_id: params.workflowRunId,
        step_name: params.stepName,
        kind: params.kind,
        status: "running",
        config: JSON.stringify(params.config),
        context: JSON.stringify(params.context),
        started_at: this.knex.fn.now(),
        created_at: this.knex.raw("date_trunc('milliseconds', NOW())"),
        updated_at: this.knex.fn.now(),
      })
      .returning("*");

    if (!stepAttempt) {
      throw new Error("Failed to create step attempt");
    }

    return stepAttempt;
  }

  async getStepAttempt(params: GetStepAttemptParams): Promise<StepAttempt | null> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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

    const limit = params.limit ?? DEFAULT_PAGINATION_PAGE_SIZE;
    const { after, before } = params;

    let cursor: Cursor | null = null;
    if (after) {
      cursor = decodeCursor(after);
    } else if (before) {
      cursor = decodeCursor(before);
    }

    const qb = this.buildListStepAttemptsWhere(params, cursor);
    const rows = await qb
      .orderBy("created_at", before ? "desc" : "asc")
      .orderBy("id", before ? "desc" : "asc")
      .limit(limit + 1);

    return this.processPaginationResults(
      rows,
      limit,
      typeof after === "string",
      typeof before === "string",
    );
  }

  private buildListStepAttemptsWhere(params: ListStepAttemptsParams, cursor: Cursor | null) {
    const { after } = params;
    const qb = this.knex
      .withSchema(DEFAULT_SCHEMA)
      .table("step_attempts")
      .where("namespace_id", this.namespaceId)
      .where("workflow_run_id", params.workflowRunId);

    if (cursor) {
      const operator = after ? ">" : "<";
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

  async completeStepAttempt(params: CompleteStepAttemptParams): Promise<StepAttempt> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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
      throw new Error("Failed to mark step attempt completed");
    }

    return updated;
  }

  async failStepAttempt(params: FailStepAttemptParams): Promise<StepAttempt> {
    if (!this.initialized) {
      throw new Error("Backend not initialized");
    }

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
      throw new Error("Failed to mark step attempt failed");
    }

    return updated;
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
  const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
  return {
    createdAt: new Date(parsed.createdAt),
    id: parsed.id,
  };
}
