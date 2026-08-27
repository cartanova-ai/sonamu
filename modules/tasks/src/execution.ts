import { type Backend } from "./backend";
import { type DurationString } from "./core/duration";
import { serializeError } from "./core/error";
import { isDynamicRetryPolicy } from "./core/retry";
import { type RetryPolicy } from "./core/retry";
import { type StepAttempt, type StepAttemptCache } from "./core/step";
import {
  addToStepAttemptCache,
  calculateSleepResumeAt,
  createSleepContext,
  createStepAttemptCacheFromAttempts,
  getCachedStepAttempt,
  normalizeStepOutput,
} from "./core/step";
import { isTerminalStatus, type WorkflowRun } from "./core/workflow";

/**
 * Config for an individual step defined with `step.run()`.
 */
export interface StepFunctionConfig {
  /**
   * The name of the step.
   */
  name: string;
}

/**
 * Represents the API for defining steps within a workflow. Used within a
 * workflow handler to define steps by calling `step.run()`.
 */
export interface StepApi {
  run<Output>(config: Readonly<StepFunctionConfig>, fn: StepFunction<Output>): Promise<Output>;
  sleep(name: string, duration: DurationString): Promise<void>;
}

/**
 * The step definition (defined by the user) that executes user code. Can return
 * undefined (e.g., when using `return;`) which will be converted to null.
 */
export type StepFunction<Output> = () => Promise<Output | undefined> | Output | undefined;

/**
 * Params passed to a workflow function for the user to use when defining steps.
 */
export interface WorkflowFunctionParams<Input> {
  input: Input;
  step: StepApi;
  version: string | null;
}

/**
 * The workflow definition's function (defined by the user) that the user uses
 * to define the workflow's steps.
 */
export type WorkflowFunction<Input, Output> = (
  params: Readonly<WorkflowFunctionParams<Input>>,
) => Promise<Output> | Output;

/**
 * Signal thrown when a workflow needs to sleep. Contains the time when the
 * workflow should resume.
 */
class SleepSignal extends Error {
  readonly resumeAt: Date;

  constructor(resumeAt: Readonly<Date>) {
    super("SleepSignal");
    this.name = "SleepSignal";
    this.resumeAt = resumeAt;
  }
}

/**
 * 외부에서 workflow 상태가 변경되었을 때 실행을 안전하게 중단하기 위한 에러입니다.
 */
class WorkflowAbortedError extends Error {
  constructor() {
    super("Workflow execution aborted");
    this.name = "WorkflowAbortedError";
  }
}

/**
 * Configures the options for a StepExecutor.
 */
export interface StepExecutorOptions {
  backend: Backend;
  workflowRunId: string;
  workerId: string;
  attempts: StepAttempt[];
  signal?: AbortSignal;
}

/**
 * Replays prior step attempts and persists new ones while memoizing
 * deterministic step outputs.
 */
export class StepExecutor implements StepApi {
  private readonly backend: Backend;
  private readonly workflowRunId: string;
  private readonly workerId: string;
  private readonly signal?: AbortSignal;
  private cache: StepAttemptCache;

  constructor(options: Readonly<StepExecutorOptions>) {
    this.backend = options.backend;
    this.workflowRunId = options.workflowRunId;
    this.workerId = options.workerId;
    this.signal = options.signal;

    this.cache = createStepAttemptCacheFromAttempts(options.attempts);
  }

  async run<Output>(
    config: Readonly<StepFunctionConfig>,
    fn: StepFunction<Output>,
  ): Promise<Output> {
    const { name } = config;
    if (this.signal?.aborted) {
      throw new WorkflowAbortedError();
    }

    // return cached result if available
    const existingAttempt = getCachedStepAttempt(this.cache, name);
    if (existingAttempt) {
      // SAFETY: 캐시 항목은 같은 이름의 StepFunction<Output>이 저장한 결과다.
      return existingAttempt.output as Output;
    }

    // not in cache, create new step attempt
    const attempt = await this.backend.createStepAttempt({
      workflowRunId: this.workflowRunId,
      workerId: this.workerId,
      stepName: name,
      kind: "function",
      config: {},
      context: null,
    });

    try {
      // execute step function
      const result = await fn();
      const output = normalizeStepOutput(result);

      // mark success — null이면 외부에서 워크플로우 상태가 변경된 것입니다(pause/cancel).
      const savedAttempt = await this.backend.completeStepAttempt({
        workflowRunId: this.workflowRunId,
        stepAttemptId: attempt.id,
        workerId: this.workerId,
        output,
      });
      if (!savedAttempt) {
        throw new WorkflowAbortedError();
      }

      // cache result
      this.cache = addToStepAttemptCache(this.cache, savedAttempt);

      // SAFETY: 저장된 결과는 바로 위에서 실행한 StepFunction<Output>의 출력이다.
      return savedAttempt.output as Output;
    } catch (error) {
      // mark failure — null이면 외부에서 워크플로우 상태가 변경된 것입니다(pause/cancel).
      const failed = await this.backend.failStepAttempt({
        workflowRunId: this.workflowRunId,
        stepAttemptId: attempt.id,
        workerId: this.workerId,
        error: serializeError(error),
      });
      if (!failed) {
        throw new WorkflowAbortedError();
      }

      throw error;
    }
  }

  async sleep(name: string, duration: DurationString): Promise<void> {
    if (this.signal?.aborted) {
      throw new WorkflowAbortedError();
    }

    // return cached result if this sleep already completed
    const existingAttempt = getCachedStepAttempt(this.cache, name);
    if (existingAttempt) return;

    // create new step attempt for the sleep
    const result = calculateSleepResumeAt(duration);
    if (!result.ok) {
      throw result.error;
    }
    const resumeAt = result.value;
    const context = createSleepContext(resumeAt);

    await this.backend.createStepAttempt({
      workflowRunId: this.workflowRunId,
      workerId: this.workerId,
      stepName: name,
      kind: "sleep",
      config: {},
      context,
    });

    // throw sleep signal to trigger postponement
    // we do not mark the step as completed here; it will be updated
    // when the workflow resumes
    throw new SleepSignal(resumeAt);
  }
}

/**
 * Parameters for the workflow execution use case.
 */
export interface ExecuteWorkflowParams {
  backend: Backend;
  workflowRun: WorkflowRun;
  workflowFn: WorkflowFunction<unknown, unknown>;
  workflowVersion: string | null;
  workerId: string;
  retryPolicy?: RetryPolicy;
  signal?: AbortSignal;
}

/**
 * Execute a workflow run. This is the core application use case that handles:
 * - Loading step history
 * - Handling sleeping steps
 * - Creating the step executor
 * - Executing the workflow function
 * - Completing, failing, or sleeping the workflow run based on the outcome
 * @param params - The execution parameters
 */
export async function executeWorkflow(params: Readonly<ExecuteWorkflowParams>): Promise<void> {
  const { backend, workflowRun, workflowFn, workflowVersion, workerId, retryPolicy, signal } =
    params;

  try {
    // load all pages of step history
    const attempts: StepAttempt[] = [];
    let cursor: string | undefined;
    do {
      const listParams = {
        workflowRunId: workflowRun.id,
        limit: 1000,
        after: cursor,
      };
      const response = await backend.listStepAttempts(listParams);
      attempts.push(...response.data);
      cursor = response.pagination.next ?? undefined;
    } while (cursor);

    // mark any sleep steps as completed if their sleep duration has elapsed,
    // or rethrow SleepSignal if still sleeping
    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      if (!attempt) continue;

      if (
        attempt.status === "running" &&
        attempt.kind === "sleep" &&
        attempt.context?.kind === "sleep"
      ) {
        const now = Date.now();
        const resumeAt = new Date(attempt.context.resumeAt);
        const resumeAtMs = resumeAt.getTime();

        if (now < resumeAtMs) {
          // sleep duration HAS NOT elapsed yet, throw signal to put workflow
          // back to sleep
          throw new SleepSignal(resumeAt);
        }

        // sleep duration HAS elapsed, mark the step as completed and continue
        const completed = await backend.completeStepAttempt({
          workflowRunId: workflowRun.id,
          stepAttemptId: attempt.id,
          workerId,
          output: null,
        });
        if (!completed) {
          throw new WorkflowAbortedError();
        }

        // update cache w/ completed attempt
        attempts[i] = completed;
      }
    }

    // create step executor
    const executor = new StepExecutor({
      backend,
      workflowRunId: workflowRun.id,
      workerId,
      attempts,
      signal,
    });

    // execute workflow
    const output = await workflowFn({
      input: workflowRun.input,
      step: executor,
      version: workflowVersion,
    });

    // mark success
    await backend.completeWorkflowRun({
      workflowRunId: workflowRun.id,
      workerId,
      output: normalizeStepOutput(output),
    });
  } catch (error) {
    // handle sleep signal by setting workflow to sleeping status
    if (error instanceof SleepSignal) {
      try {
        await backend.sleepWorkflowRun({
          workflowRunId: workflowRun.id,
          workerId,
          availableAt: error.resumeAt,
        });
      } catch (sleepError) {
        const currentRun = await backend.getWorkflowRun({ workflowRunId: workflowRun.id });
        if (currentRun && isTerminalStatus(currentRun.status)) {
          return;
        }

        throw sleepError;
      }

      return;
    }

    // heartbeat 실패로 abort된 경우, failWorkflowRun을 호출하지 않고 조용히 종료합니다.
    if (error instanceof WorkflowAbortedError || signal?.aborted) {
      return;
    }

    const currentRun = await backend.getWorkflowRun({ workflowRunId: workflowRun.id });
    if (currentRun && isTerminalStatus(currentRun.status)) {
      return;
    }

    // claimWorkflowRun에서 이미 attempts가 증가된 상태입니다.
    let forceComplete = false;
    let customDelayMs: number | undefined;
    if (retryPolicy && isDynamicRetryPolicy(retryPolicy)) {
      const serializedError = serializeError(error);
      const decision = retryPolicy.shouldRetry(serializedError, workflowRun.attempts ?? 1);
      if (!decision.shouldRetry) {
        forceComplete = true;
      } else {
        customDelayMs = decision.delayMs;
      }
    }

    await backend.failWorkflowRun({
      workflowRunId: workflowRun.id,
      workerId,
      error: serializeError(error),
      forceComplete,
      customDelayMs,
    });
  }
}
