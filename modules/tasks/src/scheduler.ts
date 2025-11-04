import EventEmitter from "events";
import knex, { type Knex } from "knex";
import { createTask, type ScheduledTask } from "node-cron";
import { type RouterContext, addRoute, createRouter } from "rou3";
import { v7 } from "uuid";
import { wrapRemoteTask } from "./tasks";
import {
  resolve,
  type EventType,
  type LocalTaskConfig,
  type NodeInfo,
  type OnEventFunction,
  type RemoteTaskConfig,
  type Resolvable,
  type RetryConfig,
  type TaskEvent,
  type TaskNodeConfig,
  type TaskRouterContext,
} from "./types";
import { wrapLocalTask } from "./tasks/local-task";

export class SonamuScheduler {
  #status: "running" | "stopped" | "disposed" = "stopped";
  readonly #event: EventEmitter;
  readonly #knex: Knex;
  readonly #retry?: RetryConfig;
  readonly #router: RouterContext<TaskRouterContext & { node: NodeInfo }>;
  readonly #tasks: ScheduledTask[];
  readonly nodeInfo: NodeInfo;

  constructor(
    knex: Knex,
    router: RouterContext<TaskRouterContext & { node: NodeInfo }>,
    nodeInfo: NodeInfo,
    retry?: RetryConfig,
  ) {
    this.#event = new EventEmitter();
    this.#knex = knex;
    this.#retry = retry;
    this.#router = router;
    this.#tasks = [];
    this.nodeInfo = nodeInfo;
  }

  async [Symbol.asyncDispose]() {
    return this.dispose();
  }

  addRoute(
    ...routes: (Omit<TaskRouterContext, "retry"> & { retry?: RetryConfig })[]
  ) {
    for (const route of routes) {
      addRoute(this.#router, "", route.path, {
        ...route,
        node: this.nodeInfo,
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
      const func =
        task.type === "remote"
          ? wrapRemoteTask.bind(
              this,
              this.#router,
              this.nodeInfo,
              onEvent,
              this.#knex,
            )
          : wrapLocalTask.bind(this, this.#router, this.nodeInfo, onEvent, {
              id: v7(),
              createdAt: new Date(),
              updatedAt: new Date(),
              status: "pending",
              namespace: task.namespace,
              retryCount: 0,
              payload: task.payload,
            });

      const cronTask = createTask(task.expression, func, task.options);
      this.#tasks.push(cronTask);
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

  on(name: EventType | "*", fn: OnEventFunction) {
    if (this.#status === "disposed") return;
    this.#event.on(name, fn);
  }

  off(name: EventType | "*", fn: OnEventFunction) {
    if (this.#status === "disposed") return;
    this.#event.off(name, fn);
  }

  #emit(evt: TaskEvent) {
    if (this.#status === "disposed") return;
    this.#event.emit("*", evt);
    this.#event.emit(evt.type, evt);
  }
}

export async function createScheduler(
  input: Resolvable<TaskNodeConfig>,
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
