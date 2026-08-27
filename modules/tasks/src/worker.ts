import { randomUUID } from "node:crypto";

import { type Backend } from "./backend";
import { type WorkflowRun } from "./core/workflow";
import { executeWorkflow } from "./execution";
import { type WorkflowRegistry } from "./registry";
import { type Workflow } from "./workflow";

const DEFAULT_LEASE_DURATION_MS = 30 * 1000; // 30s
const DEFAULT_POLL_INTERVAL_MS = 100; // 100ms
const DEFAULT_CONCURRENCY = 1;

/**
 * Configures how a Worker polls the backend, leases workflow runs, and
 * registers workflows.
 */
export interface WorkerOptions {
  backend: Backend;
  registry: WorkflowRegistry;
  concurrency?: number | undefined;
  usePubSub?: boolean;
  listenDelay?: number;
}

/**
 * Runs workflows by polling the backend, dispatching runs across a concurrency
 * pool, and heartbeating/extending leases.
 */
export class Worker {
  private readonly backend: Backend;
  private readonly workerIds: string[];
  private readonly registry: WorkflowRegistry;
  private readonly activeExecutions = new Set<WorkflowExecution>();
  private readonly activeSubscriptionCallbacks = new Set<Promise<void>>();
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private subscribed = false;

  private usePubSub: boolean;
  private listenDelay: number;

  constructor(options: WorkerOptions) {
    this.backend = options.backend;
    this.registry = options.registry;
    this.usePubSub = options.usePubSub ?? true;
    this.listenDelay = options.listenDelay ?? 500;

    const concurrency = Math.max(DEFAULT_CONCURRENCY, options.concurrency ?? DEFAULT_CONCURRENCY);

    // generate worker IDs for every concurrency slot
    this.workerIds = Array.from({ length: concurrency }, () => randomUUID());
  }

  /**
   * Start the worker. It will begin polling for and executing workflows.
   * @returns Promise resolved when started
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.loopPromise = this.runLoop();
    await Promise.resolve();
  }

  /**
   * Stop the worker gracefully. Waits for all active workflow runs to complete
   * before returning.
   * @returns Promise resolved when stopped
   */
  async stop(): Promise<void> {
    this.running = false;

    // wait for the poll loop to stop
    if (this.loopPromise) await this.loopPromise;

    // wait for in-flight pub/sub callbacks to finish their delayed tick checks
    while (this.activeSubscriptionCallbacks.size > 0) {
      await Promise.all(this.activeSubscriptionCallbacks);
    }

    // wait for all active executions to finish
    while (this.activeExecutions.size > 0) await sleep(100);

    this.subscribed = false;
  }

  /**
   * Processes one round of work claims and execution. Exposed for testing.
   * Returns the number of workflow runs claimed.
   * @returns Number of workflow runs claimed
   */
  async tick(): Promise<number> {
    const availableSlots = this.concurrency - this.activeExecutions.size;
    if (availableSlots <= 0) return 0;

    // claim work for each available slot
    const claims = Array.from({ length: availableSlots }, (_, i) => {
      const availableWorkerId = this.workerIds[i % this.workerIds.length];
      return availableWorkerId
        ? this.claimAndProcessWorkflowRunInBackground(availableWorkerId)
        : Promise.resolve(null);
    });

    const claimed = await Promise.all(claims);
    return claimed.filter((run) => run !== null).length;
  }

  /**
   * Get the configured concurrency limit.
   * @returns Concurrency limit
   */
  private get concurrency(): number {
    return this.workerIds.length;
  }

  /*
   * Main run loop that continuously ticks while the worker is running.
   * Only sleeps when no work was claimed to avoid busy-waiting.
   */
  private async runLoop(): Promise<void> {
    if (this.usePubSub && !this.subscribed) {
      this.subscribed = true;
      this.backend.subscribe(async (result) => {
        const callbackPromise = this.handleSubscriptionEvent(result);
        this.activeSubscriptionCallbacks.add(callbackPromise);
        await callbackPromise.finally(() => {
          this.activeSubscriptionCallbacks.delete(callbackPromise);
        });
      });
    }

    while (this.running) {
      try {
        const claimedCount = await this.tick();
        // only sleep if we didn't claim any work
        if (claimedCount === 0) {
          await sleep(DEFAULT_POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error("Worker tick failed:", error);
        await sleep(DEFAULT_POLL_INTERVAL_MS);
      }
    }
  }

  private async handleSubscriptionEvent(result: Readonly<{ ok: boolean }>): Promise<void> {
    if (!result.ok || !this.running) {
      return;
    }

    await sleep(this.listenDelay);
    if (!this.running) {
      return;
    }

    try {
      await this.tick();
    } catch (error) {
      console.error("Worker tick failed:", error);
    }
  }

  /*
   * Claim and process a workflow run for the given worker ID. Do not await the
   * processing here to avoid blocking the caller.
   * Returns the claimed workflow run, or null if none was available.
   */
  private async claimAndProcessWorkflowRunInBackground(
    workerId: string,
  ): Promise<WorkflowRun | null> {
    // claim workflow run
    const workflowRun = await this.backend.claimWorkflowRun({
      workerId,
      leaseDurationMs: DEFAULT_LEASE_DURATION_MS,
    });
    if (!workflowRun) return null;

    const workflow = this.registry.get(workflowRun.workflowName, workflowRun.version);
    if (!workflow) {
      const versionStr = workflowRun.version ? ` (version: ${workflowRun.version})` : "";
      await this.backend.failWorkflowRun({
        workflowRunId: workflowRun.id,
        workerId,
        error: {
          message: `Workflow "${workflowRun.workflowName}"${versionStr} is not registered`,
        },
      });
      return null;
    }

    // create execution and start processing *async* w/o blocking
    const execution = new WorkflowExecution({
      backend: this.backend,
      workflowRun,
      workerId,
    });
    this.activeExecutions.add(execution);

    this.processExecutionInBackground(execution, workflow)
      .catch(() => {
        // errors are already handled in processExecution
      })
      .finally(() => {
        execution.stopHeartbeat();
        this.activeExecutions.delete(execution);
      });

    return workflowRun;
  }

  /**
   * Process a workflow execution, handling heartbeats, step execution, and
   * marking success or failure.
   * @param execution - Workflow execution
   * @param workflow - Workflow to execute
   * @returns Promise resolved when processing completes
   */
  private async processExecutionInBackground(
    execution: WorkflowExecution,
    workflow: Workflow<unknown, unknown, unknown>,
  ): Promise<void> {
    // start heartbeating
    execution.startHeartbeat();

    try {
      await executeWorkflow({
        backend: this.backend,
        workflowRun: execution.workflowRun,
        workflowFn: workflow.fn,
        workflowVersion: execution.workflowRun.version,
        workerId: execution.workerId,
        retryPolicy: workflow.spec.retryPolicy,
        signal: execution.signal,
      });
    } catch (error) {
      if (execution.signal.aborted) {
        return;
      }

      // specifically for unexpected errors in the execution wrapper itself, not
      // for business logic errors (those are handled inside executeWorkflow)
      console.error(
        `Critical error during workflow execution for run ${execution.workflowRun.id}:`,
        error,
      );
    }
  }
}

/**
 * Configures the options for a WorkflowExecution.
 */
interface WorkflowExecutionOptions {
  backend: Backend;
  workflowRun: WorkflowRun;
  workerId: string;
}

/**
 * Tracks a claimed workflow run and maintains its heartbeat lease for the
 * worker.
 */
class WorkflowExecution {
  private backend: Backend;
  workflowRun: WorkflowRun;
  workerId: string;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private abortController = new AbortController();

  constructor(options: WorkflowExecutionOptions) {
    this.backend = options.backend;
    this.workflowRun = options.workflowRun;
    this.workerId = options.workerId;
  }

  /**
   * 외부에서 abort 여부를 확인할 수 있는 signal입니다.
   * heartbeat 실패 시 abort됩니다.
   */
  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Start the heartbeat loop for this execution, heartbeating at half the lease
   * duration.
   */
  startHeartbeat(): void {
    const leaseDurationMs = DEFAULT_LEASE_DURATION_MS;
    const heartbeatIntervalMs = leaseDurationMs / 2;

    this.heartbeatTimer = setInterval(() => {
      this.backend
        .extendWorkflowRunLease({
          workflowRunId: this.workflowRun.id,
          workerId: this.workerId,
          leaseDurationMs,
        })
        .catch((_error) => {
          // lease 연장 실패에는 heartbeat를 중단하고 abort 신호를 보냅니다.
          this.abortController.abort();
          this.stopHeartbeat();
        });
    }, heartbeatIntervalMs);
  }

  /**
   * Stop the heartbeat loop.
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

/**
 * Sleep for a given duration.
 * @param ms - Milliseconds to sleep
 * @returns Promise resolved after sleeping
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
