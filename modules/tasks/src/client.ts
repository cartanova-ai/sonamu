import { type Backend } from "./backend";
import { serializeRetryPolicy } from "./core/retry";
import { type StandardSchemaV1 } from "./core/schema";
import { type SchemaInput, type SchemaOutput, type WorkflowRun } from "./core/workflow";
import { validateInput } from "./core/workflow";
import { type WorkflowFunction } from "./execution";
import { WorkflowRegistry } from "./registry";
import { Worker } from "./worker";
import { type WorkerOptions } from "./worker";
import { defineWorkflow, defineWorkflowSpec } from "./workflow";
import { type Workflow, type WorkflowSpec } from "./workflow";

const DEFAULT_RESULT_POLL_INTERVAL_MS = 1000; // 1s
const DEFAULT_RESULT_TIMEOUT_MS = 5 * 60 * 1000; // 5m

/* The data the worker function receives (after transformation). */
type WorkflowHandlerInput<TSchema, Input> = SchemaOutput<TSchema, Input>;

/* The data the client sends (before transformation) */
type WorkflowRunInput<TSchema, Input> = SchemaInput<TSchema, Input>;

/**
 * Options for the OpenWorkflow client.
 */
export interface OpenWorkflowOptions {
  backend: Backend;
}

/**
 * Client used to register workflows and start runs.
 */
export class OpenWorkflow {
  private backend: Backend;
  private registry = new WorkflowRegistry();

  constructor(options: OpenWorkflowOptions) {
    this.backend = options.backend;
  }

  /**
   * Create a new Worker with this client's backend and workflows.
   * @param options - Worker options
   * @param options.concurrency - Max concurrent workflow runs
   * @returns Worker instance
   */
  newWorker(options?: {
    concurrency?: number | undefined;
    usePubSub?: boolean;
    listenDelay?: number;
  }): Worker {
    return new Worker({
      backend: this.backend,
      registry: this.registry,
      concurrency: options?.concurrency,
      usePubSub: options?.usePubSub,
      listenDelay: options?.listenDelay,
    } satisfies WorkerOptions);
  }

  /**
   * Provide the implementation for a declared workflow. This links the workflow
   * specification to its execution logic and registers it with this
   * OpenWorkflow instance for worker execution.
   * @param spec - Workflow spec
   * @param fn - Workflow implementation
   */
  implementWorkflow<Input, Output, RunInput = Input>(
    spec: WorkflowSpec<Input, Output, RunInput>,
    fn: WorkflowFunction<Input, Output>,
  ): void {
    const workflow: Workflow<Input, Output, RunInput> = { spec, fn };
    // SAFETY: 레지스트리는 이름으로 조회하며 실행 시 원래 Workflow 제네릭 쌍을 함께 복원한다.
    this.registry.register(workflow as Workflow<unknown, unknown, unknown>);
  }

  /**
   * Run a workflow from its specification. This is the primary way to schedule
   * a workflow using only its WorkflowSpec.
   * @param spec - Workflow spec
   * @param input - Workflow input
   * @param options - Run options
   * @returns Handle for awaiting the result
   * @example
   * ```ts
   * const handle = await ow.runWorkflow(emailWorkflow, { to: 'user@example.com' });
   * const result = await handle.result();
   * ```
   */
  async runWorkflow<Input, Output, RunInput = Input>(
    spec: WorkflowSpec<Input, Output, RunInput>,
    input?: RunInput,
    options?: WorkflowRunOptions,
  ): Promise<WorkflowRunHandle<Output>> {
    const validationResult = await validateInput(spec.schema, input);
    if (!validationResult.success) {
      throw new Error(validationResult.error);
    }
    const parsedInput = validationResult.value;
    const workflowRun = await this.backend.createWorkflowRun({
      workflowName: spec.name,
      version: spec.version ?? null,
      idempotencyKey: null,
      config: {},
      context: null,
      input: parsedInput ?? null,
      availableAt: null,
      deadlineAt: options?.deadlineAt ?? null,
      retryPolicy: spec.retryPolicy ? serializeRetryPolicy(spec.retryPolicy) : undefined,
    });

    if (options?.publishToChannel) {
      await this.backend.publish(workflowRun.id);
    }

    return new WorkflowRunHandle<Output>({
      backend: this.backend,
      workflowRun: workflowRun,
      resultPollIntervalMs: DEFAULT_RESULT_POLL_INTERVAL_MS,
      resultTimeoutMs: DEFAULT_RESULT_TIMEOUT_MS,
    });
  }

  /**
   * Define and register a new workflow.
   *
   * This is a convenience method that combines `declareWorkflow` and
   * `implementWorkflow` into a single call. For better code splitting and to
   * separate declaration from implementation, consider using those methods
   * separately.
   * @param config - Workflow config
   * @param fn - Workflow implementation
   * @returns Runnable workflow
   * @example
   * ```ts
   * const workflow = ow.defineWorkflow(
   *   { name: 'my-workflow' },
   *   async ({ input, step }) => {
   *     // workflow implementation
   *   },
   * );
   * ```
   */
  defineWorkflow<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
    spec: WorkflowSpec<
      WorkflowHandlerInput<TSchema, Input>,
      Output,
      WorkflowRunInput<TSchema, Input>
    >,
    fn: WorkflowFunction<WorkflowHandlerInput<TSchema, Input>, Output>,
  ): RunnableWorkflow<
    WorkflowHandlerInput<TSchema, Input>,
    Output,
    WorkflowRunInput<TSchema, Input>
  > {
    const workflow = defineWorkflow(spec, fn);
    // SAFETY: 레지스트리는 이름으로 조회하며 실행 시 원래 Workflow 제네릭 쌍을 함께 복원한다.
    this.registry.register(workflow as Workflow<unknown, unknown, unknown>);
    return new RunnableWorkflow(this, workflow);
  }

  /**
   * Unregister a workflow from the registry.
   * @param name - The workflow name
   * @param version - The workflow version (null for unversioned)
   * @example
   * ```ts
   * ow.unregisterWorkflow("my-workflow", "v1");
   * ```
   */
  unregisterWorkflow(name: string, version: string | null): void {
    this.registry.remove(name, version);
  }

  /**
   * Check if a workflow is registered in the registry.
   * @param name - The workflow name
   * @param version - The workflow version (null for unversioned)
   * @returns True if the workflow is registered, false otherwise
   * @example
   * ```ts
   * ow.isWorkflowRegistered("my-workflow", "v1");
   * ```
   */
  isWorkflowRegistered(name: string, version: string | null): boolean {
    return this.registry.has(name, version);
  }
}

/**
 * Declare a workflow without providing its implementation (which is provided
 * separately via `implementWorkflow`). Returns a lightweight WorkflowSpec
 * that can be used to schedule workflow runs.
 * @param spec - Workflow spec
 * @returns Workflow spec
 * @example
 * ```ts
 * export const emailWorkflow = declareWorkflow({
 *   name: 'send-email',
 *   schema: z.object({ to: z.string().email() }),
 * });
 * ```
 */
// kept for backwards compatibility, to be deprecated
// eslint-disable-next-line unicorn/prefer-export-from
export const declareWorkflow = defineWorkflowSpec;

//
// --- Workflow Definition
//

/**
 * A fully defined workflow with its implementation. This class is returned by
 * `defineWorkflow` and provides the `.run()` method for scheduling workflow
 * runs.
 */
export class RunnableWorkflow<Input, Output, RunInput = Input> {
  private readonly ow: OpenWorkflow;
  readonly workflow: Workflow<Input, Output, RunInput>;

  constructor(ow: OpenWorkflow, workflow: Workflow<Input, Output, RunInput>) {
    this.ow = ow;
    this.workflow = workflow;
  }

  /**
   * Starts a new workflow run.
   * @param input - Workflow input
   * @param options - Run options
   * @returns Workflow run handle
   */
  async run(input?: RunInput, options?: WorkflowRunOptions): Promise<WorkflowRunHandle<Output>> {
    return this.ow.runWorkflow(this.workflow.spec, input, options);
  }
}

//
// --- Workflow Run
//

/**
 * Options for creating a new workflow run from a runnable workflow when calling
 * `workflow.run()`.
 */
export interface WorkflowRunOptions {
  /**
   * Set a deadline for the workflow run. If the workflow exceeds this deadline,
   * it will be marked as failed.
   */
  deadlineAt?: Date;

  /**
   * Publish when the workflow run is created to the channel.
   * Default: true
   */
  publishToChannel?: boolean;
}

/**
 * Options for WorkflowHandle.
 */
export interface WorkflowHandleOptions {
  backend: Backend;
  workflowRun: WorkflowRun;
  resultPollIntervalMs: number;
  resultTimeoutMs: number;
}

/**
 * Represents a started workflow run and provides methods to await its result.
 * Returned from `workflowDef.run()`.
 */
export class WorkflowRunHandle<Output> {
  private backend: Backend;
  readonly workflowRun: WorkflowRun;
  private resultPollIntervalMs: number;
  private resultTimeoutMs: number;

  constructor(options: WorkflowHandleOptions) {
    this.backend = options.backend;
    this.workflowRun = options.workflowRun;
    this.resultPollIntervalMs = options.resultPollIntervalMs;
    this.resultTimeoutMs = options.resultTimeoutMs;
  }

  /**
   * Waits for the workflow run to complete and returns the result.
   * @returns Workflow output
   */
  async result(): Promise<Output> {
    const start = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      const latest = await this.backend.getWorkflowRun({
        workflowRunId: this.workflowRun.id,
      });

      if (!latest) {
        throw new Error(`Workflow run ${this.workflowRun.id} no longer exists`);
      }

      // 'succeeded' status is deprecated
      if (latest.status === "succeeded" || latest.status === "completed") {
        // SAFETY: 완료된 실행의 output은 이 핸들을 만든 Workflow의 Output으로 저장됐다.
        return latest.output as Output;
      }

      if (latest.status === "failed") {
        throw new Error(
          `Workflow ${this.workflowRun.workflowName} failed: ${JSON.stringify(latest.error)}`,
        );
      }

      if (latest.status === "canceled") {
        throw new Error(`Workflow ${this.workflowRun.workflowName} was canceled`);
      }

      if (Date.now() - start > this.resultTimeoutMs) {
        throw new Error(`Timed out waiting for workflow run ${this.workflowRun.id} to finish`);
      }

      await new Promise((resolve) => {
        setTimeout(resolve, this.resultPollIntervalMs);
      });
    }
  }

  /**
   * Cancels the workflow run. Only workflows in pending, running, sleeping,
   * or paused status can be canceled.
   */
  async cancel(): Promise<void> {
    await this.backend.cancelWorkflowRun({
      workflowRunId: this.workflowRun.id,
    });
  }

  /**
   * Pauses the workflow run. Only workflows in pending, running, or sleeping
   * status can be paused.
   */
  async pause(): Promise<void> {
    await this.backend.pauseWorkflowRun({
      workflowRunId: this.workflowRun.id,
    });
  }

  /**
   * Resumes a paused workflow run. Sets the status back to pending so that
   * a worker can reclaim it.
   */
  async resume(): Promise<void> {
    await this.backend.resumeWorkflowRun({
      workflowRunId: this.workflowRun.id,
    });
  }
}
