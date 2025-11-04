import EventEmitter from "events";
import knex, { type Knex } from "knex";
import { createTask, type ScheduledTask } from "node-cron";
import { type RouterContext, addRoute, createRouter } from "rou3";
import { v7 } from "uuid";
import { wrapRemoteTask, wrapLocalTask } from "./tasks";
import {
  resolve,
  type EventType,
  type LocalTaskConfig,
  type SchedulerInfo,
  type OnEventFunction,
  type RemoteTaskConfig,
  type Resolvable,
  type RetryConfig,
  type TaskEvent,
  type SchedulerConfig,
  type TaskRouterContext,
} from "./types";

// 태스크를 관리하는 Scheduler
export class SonamuScheduler {
  #status: "running" | "stopped" | "disposed" = "stopped";

  readonly #event: EventEmitter;
  readonly #knex: Knex;
  readonly #retry?: RetryConfig;
  readonly #router: RouterContext<TaskRouterContext & { info: SchedulerInfo }>;
  readonly #tasks: ScheduledTask[];
  readonly info: SchedulerInfo;

  constructor(
    knex: Knex,
    router: RouterContext<TaskRouterContext & { info: SchedulerInfo }>,
    info: SchedulerInfo,
    retry?: RetryConfig,
  ) {
    this.#event = new EventEmitter();
    this.#knex = knex;
    this.#retry = retry;
    this.#router = router;
    this.#tasks = [];
    this.info = info;
  }

  // async disposable 처리를 위함
  async [Symbol.asyncDispose]() {
    return this.dispose();
  }

  addRoute(
    ...routes: (Omit<TaskRouterContext, "retry"> & { retry?: RetryConfig })[]
  ) {
    for (const route of routes) {
      addRoute(this.#router, "", route.path, {
        ...route,
        info: this.info,
        // route의 기본 설정 -> 글로벌 설정 -> 없을 경우 재시도는 안 함.
        retry: {
          delay: route.retry?.delay ?? this.#retry?.delay,
          maxAttempts:
            route.retry?.maxAttempts ?? this.#retry?.maxAttempts ?? 1,
        },
      });
    }
  }

  addTask(...tasks: (RemoteTaskConfig | LocalTaskConfig)[]) {
    for (const task of tasks) {
      const onEvent = this.#emit.bind(this);
      // remote냐 local이냐에 따라서 인자가 달라짐.
      const func =
        task.type === "remote"
          ? wrapRemoteTask.bind(
              this,
              this.#router,
              this.info,
              onEvent,
              this.#knex,
            )
          : wrapLocalTask.bind(this, this.#router, this.info, onEvent, {
              id: v7(),
              createdAt: new Date(),
              updatedAt: new Date(),
              status: "pending",
              namespace: task.namespace,
              attempt: 1,
              payload: task.payload,
            });

      const cronTask = createTask(task.expression, func, task.options);
      this.#tasks.push(cronTask);

      // Scheduler가 실행 상태일 때 task가 추가되면 Task도 같이 실행함
      if (this.#status === "running") {
        cronTask.start();
      }
    }
  }

  start() {
    this.#status = "running";
    for (const task of this.#tasks) {
      if (task.getStatus() === "stopped") {
        task.start();
      }
    }
  }

  stop() {
    this.#status = "stopped";
    for (const task of this.#tasks) {
      if (task.getStatus() !== "stopped") {
        task.stop();
      }
    }
  }

  async dispose() {
    if (this.#status === "disposed") return;

    this.#status = "disposed";
    this.#event.removeAllListeners();
    await this.#knex.destroy();

    for (const task of this.#tasks) {
      task.stop();
      await task.destroy();
    }
  }

  // *를 넣으면 모든 이벤트에 대응함
  on(name: EventType | "*", fn: OnEventFunction) {
    if (this.#status === "disposed") return;
    this.#event.on(name, fn);
  }

  // *를 넣으면 모든 이벤트에 대응함
  off(name: EventType | "*", fn: OnEventFunction) {
    if (this.#status === "disposed") return;
    this.#event.off(name, fn);
  }

  // 내부 wrapLocalTask/wrapRemoteTask를 실행할 때 전달되는 event callback
  #emit(evt: TaskEvent) {
    if (this.#status === "disposed") return;
    this.#event.emit("*", evt);
    this.#event.emit(evt.type, evt);
  }
}

export async function createScheduler(
  input: Resolvable<SchedulerConfig>,
): Promise<SonamuScheduler> {
  const config = await resolve(input);
  const scheduler = new SonamuScheduler(
    knex(config.database),
    createRouter(),
    { id: v7(), name: config.name },
    config.retry,
  );

  scheduler.addRoute(...config.routes);
  scheduler.addTask(...config.tasks);
  return scheduler;
}
