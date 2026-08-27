import assert from "assert";

import { getLogger } from "@logtape/logtape";
import { type Logger } from "@logtape/logtape";
import { BackendPostgres, OpenWorkflow } from "@sonamu-kit/tasks";
import { type Worker } from "@sonamu-kit/tasks";
import { serializeRetryPolicy } from "@sonamu-kit/tasks/internal";
import {
  type RunnableWorkflow,
  type SchemaInput,
  type SchemaOutput,
  type StandardSchemaV1,
  type StepApi,
  type WorkflowRunHandle,
  type WorkflowSpec,
} from "@sonamu-kit/tasks/internal";
import { type Knex } from "knex";
import { schedule as cronSchedule } from "node-cron";
import { type ScheduledTask } from "node-cron";
import { type ZodObject } from "zod";

import { type Context } from "../api/context";
import { Sonamu } from "../api/sonamu";
import { convertDomainToCategory } from "../logger/category";
import { Naite } from "../naite/naite";
import { createMockSSEFactory } from "../stream/sse";
import { type Executable } from "../types/types";
import { isFunctionValue } from "../utils/runtime-value";
import { type WorkflowMetadata } from "./decorator";
import { StepWrapper } from "./step-wrapper";

export interface WorkflowOptions {
  // worker에서 동시 실행할 태스크 수, 기본은 1
  concurrency?: number;

  // worker에서 사용할 pub/sub 여부, 기본은 true
  usePubSub?: boolean;

  // pub/sub으로 태스크를 수신했을 때 워크플로우 실행까지 지연 시간, 기본은 500ms
  listenDelay?: number;
}

// Workflow 함수의 타입, @sonamu-kit/tasks와 다른 점은 step을 한번 감싼 형태.
export type WorkflowFunction<Input, Output> = (
  params: Readonly<{
    logger: Logger;
    input: Input;
    step: StepWrapper;
    version: string | null;
  }>,
) => Promise<Output> | Output;

// Workflow를 등록할 때를 위한 타입
export type WorkflowCreateOptions<
  Input,
  Output,
  TSchema extends StandardSchemaV1 | undefined = undefined,
> = Omit<
  WorkflowSpec<SchemaOutput<TSchema, Input>, Output, SchemaInput<TSchema, Input>>,
  "version"
> & {
  id: string;
  version: string | null;
  function: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>;
};

export class WorkflowManager {
  // backend 인스턴스
  readonly #backend: BackendPostgres;

  // OpenWorkflow 인스턴스
  readonly #ow: OpenWorkflow;

  // Worker 인스턴스 (없을 수 있으며, 이 때는 분산된 서버 환경에서 DB에 publish만 한다고 가정함)
  #worker: Worker | null;

  // 파일 경로 -> 파일에 정의된 워크플로우 메타데이터 목록
  #workflowsMap: Map<string, WorkflowMetadata[]>;

  // Task 이름 -> Task 정보 및 Input 값, Workflow ID
  #scheduledTasks: Map<
    string,
    {
      task: ScheduledTask;
      inputFn: Executable<SchemaInput<unknown, unknown>>;
      workflowId: string;
    }
  >;

  // BackendPostgres에서 처리하는 것들이 있어서 Knex 커넥션이 아니라 설정값을 넣어줘야함.
  constructor(dbConf: Knex.Config, runMigrations: boolean = true) {
    const backend = new BackendPostgres(dbConf, { runMigrations });

    this.#backend = backend;
    this.#ow = new OpenWorkflow({ backend });
    this.#worker = null;

    this.#workflowsMap = new Map();
    this.#scheduledTasks = new Map();
  }

  // Sonamu UI API에서 워크플로우 실행 목록 조회, 취소 등에 사용합니다.
  get backend(): BackendPostgres {
    return this.#backend;
  }

  get workflowDefinitions() {
    return Array.from(this.#workflowsMap.values())
      .flat()
      .map((wf) => ({
        id: wf.id,
        name: wf.name,
        version: wf.version,
        schedules: wf.schedules.map((s) => ({
          name: s.name,
          expression: s.expression,
        })),
        retryPolicy: wf.retryPolicy ? serializeRetryPolicy(wf.retryPolicy) : undefined,
      }));
  }

  /**
   * 정의된 워크플로우 및 워크플로우에 대한 scheduled tasks를 동기화합니다.
   */
  async synchronize(workflowMap: Map<string, WorkflowMetadata[]>) {
    // 1. 삭제된 파일은 일괄 삭제
    await Promise.allSettled(
      Array.from(this.#workflowsMap.entries())
        .filter(([key]) => !workflowMap.has(key))
        .flatMap(([, workflows]) =>
          workflows.map((workflow) => {
            return Promise.allSettled([
              ...workflow.schedules.map((schedule) => this.unscheduleTask(schedule.name)),
              this.unregisterWorkflow(workflow),
            ]);
          }),
        ),
    );

    // 2. 새로 추가된 파일은 일괄 등록
    await Promise.allSettled(
      Array.from(workflowMap.entries())
        .filter(([key]) => !this.#workflowsMap.has(key))
        .flatMap(([, workflows]) =>
          workflows.map((workflow) => {
            this.registerWorkflow({
              id: workflow.id,
              name: workflow.name,
              version: workflow.version ?? null,
              schema: workflow.schema,
              function: workflow.fn,
              retryPolicy: workflow.retryPolicy,
            });

            return Promise.allSettled(
              workflow.schedules.map((schedule) => this.scheduleTask(workflow, schedule)),
            );
          }),
        ),
    );

    // 3. 기존과 다른 것을 diff친 다음, 삭제 후 재등록
    await Promise.allSettled(
      Array.from(workflowMap.entries())
        .filter(([key]) => this.#workflowsMap.has(key))
        .map<[string, [WorkflowMetadata[], WorkflowMetadata[]]]>(([key, newWorkflows]) => {
          const previousWorkflows = this.#workflowsMap.get(key);
          assert(previousWorkflows, "previous workflows not found");
          return [key, [previousWorkflows, newWorkflows]];
        })
        .map(async ([, [previousWorkflows, newWorkflows]]) => {
          // 기존 것들을 삭제부터 해야함.
          await Promise.allSettled(
            previousWorkflows
              .filter((prevItem) => !newWorkflows.some((newItem) => newItem.id === prevItem.id))
              .map((prevItem) => {
                return Promise.allSettled([
                  ...prevItem.schedules.map((schedule) => this.unscheduleTask(schedule.name)),
                  this.unregisterWorkflow(prevItem),
                ]);
              }),
          );

          // 새로 추가된 것들을 등록
          await Promise.allSettled(
            newWorkflows
              .filter(
                (newItem) => !previousWorkflows.some((prevItem) => prevItem.id === newItem.id),
              )
              .map(async (newItem) => {
                this.registerWorkflow({
                  id: newItem.id,
                  name: newItem.name,
                  version: newItem.version ?? null,
                  schema: newItem.schema,
                  function: newItem.fn,
                  retryPolicy: newItem.retryPolicy,
                });

                return Promise.allSettled(
                  newItem.schedules.map((schedule) => this.scheduleTask(newItem, schedule)),
                );
              }),
          );
        }),
    );

    this.#workflowsMap = workflowMap;
  }

  // 워크플로우를 실행
  run<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
    options: Omit<WorkflowCreateOptions<Input, Output, TSchema>, "function" | "schema" | "id">,
    input: SchemaInput<TSchema, Input>,
  ): Promise<WorkflowRunHandle<Output>> {
    return this.#ow.runWorkflow(
      {
        name: options.name,
        version: options.version ?? undefined,
      },
      input,
    );
  }

  // cron task를 등록
  async scheduleTask(
    workflow: Pick<WorkflowMetadata, "id" | "name" | "version">,
    schedule: WorkflowMetadata["schedules"][number],
  ) {
    // Worker가 활성화된 노드에서만 처리
    if (!this.#worker) {
      return;
    }

    const task = cronSchedule(
      schedule.expression,
      (async (
        { name, version }: Pick<WorkflowMetadata, "name" | "version">,
        { input }: WorkflowMetadata["schedules"][number],
      ) => {
        const inputData = await (isFunctionValue(input)
          ? Promise.resolve(input())
          : Promise.resolve(input));

        return this.run({ name, version: version ?? null }, inputData);
      }).bind(this, workflow, schedule),
      {
        name: schedule.name,
        timezone: Sonamu.config.api.timezone,
        noOverlap: false,
      },
    );

    this.#scheduledTasks.set(schedule.name, {
      task,
      inputFn: schedule.input,
      workflowId: workflow.id,
    });
    await task.start();
  }

  // cron task를 중지
  async unscheduleTask(name: string) {
    // Worker가 활성화된 노드에서만 처리
    if (!this.#worker) {
      return;
    }

    const taskItem = this.#scheduledTasks.get(name);
    if (!taskItem) {
      console.error("scheduled task not found", name);
      return;
    }

    this.#scheduledTasks.delete(name);
    await taskItem.task.stop();
    await taskItem.task.destroy();
  }

  // 워크플로우를 등록, 관련된 스케줄은 별도로 등록해야 함.
  registerWorkflow<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
    options: WorkflowCreateOptions<Input, Output, TSchema>,
  ): RunnableWorkflow<SchemaOutput<TSchema, Input>, Output, SchemaInput<TSchema, Input>> {
    const fn = async (
      params: Readonly<{
        input: SchemaOutput<TSchema, Input>;
        step: StepApi;
        version: string | null;
      }>,
    ) => {
      const baseContext: Context = {
        transport: "http" as const,
        // 워크플로우에는 HTTP 요청이 없으므로 잘못된 접근을 즉시 드러냅니다.
        get request(): Context["request"] {
          throw new Error("HTTP request is unavailable in workflow context");
        },
        get reply(): Context["reply"] {
          throw new Error("HTTP reply is unavailable in workflow context");
        },
        headers: {},
        createSSE: <T extends ZodObject>(schema: T) => createMockSSEFactory(schema),
        naiteStore: Naite.createStore(),
        locale: "",
        user: null,
        session: null,
      };

      const contextProvider = Sonamu.config.tasks?.contextProvider;
      const context: Context = contextProvider
        ? await Promise.resolve(contextProvider(baseContext))
        : baseContext;

      const step = new StepWrapper(params.step);
      return Sonamu.asyncLocalStorage.run({ context }, () =>
        options.function({
          input: params.input,
          step,
          version: params.version,
          logger: getLogger(convertDomainToCategory(options.name, "workflow")),
        }),
      );
    };

    const workflow = this.#ow.defineWorkflow(
      {
        name: options.name,
        version: options.version ?? undefined,
        schema: options.schema,
        retryPolicy: options.retryPolicy,
      },
      fn,
    );
    return workflow;
  }

  // 워크플로우를 등록 해제, 관련된 스케줄은 별도로 해제해야 함.
  async unregisterWorkflow(workflow: Pick<WorkflowMetadata, "name" | "version" | "id">) {
    this.#ow.unregisterWorkflow(workflow.name, workflow.version ?? null);
  }

  // Worker를 설정 후 시작
  setupWorker(options: WorkflowOptions) {
    this.#worker = this.#ow.newWorker(options);
  }

  // Worker가 있으면 Worker까지 초기화, 아니면 백엔드만 초기화
  async startWorker() {
    await this.#backend.initialize();
    await this.#worker?.start();
  }

  // Worker를 중지
  async stopWorker() {
    await this.#worker?.stop();
  }

  // cron task들을 모두 중지
  async stopSchedules() {
    await Promise.allSettled(
      Array.from(this.#scheduledTasks.values()).map(({ task }) => Promise.resolve(task.stop())),
    );
  }

  // cron task들을 모두 정리
  async destroySchedules() {
    await Promise.allSettled(
      Array.from(this.#scheduledTasks.values()).map(({ task }) => Promise.resolve(task.destroy())),
    );
    this.#scheduledTasks.clear();
  }

  async destroy() {
    await this.stopSchedules();
    await this.stopWorker();
    await this.destroySchedules();
    await this.#backend.stop();
  }

  [Symbol.asyncDispose]() {
    return this.destroy();
  }
}
