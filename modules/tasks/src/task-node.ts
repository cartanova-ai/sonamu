import knex, { type Knex } from "knex";
import { EventEmitter } from "node:events";
import { addRoute, createRouter, findRoute, MatchedRoute, RouterContext } from "rou3";
import { uuidv7obj } from "uuidv7";
import z from "zod";
import { isSonamuTaskError, SonamuTaskError } from "./errors";
import { TaskItemStateMachine } from "./state-machine";
import type {
    EventType,
    NodeInfo,
    OnEventFunction,
    RetryConfig,
    TaskInfo,
    TaskNodeConfig,
    TaskNodeConfigInput,
    TaskNodeEvent,
    TaskRouterContext
} from "./types";

// UTF-8 JSON Buffer를 Zod Type으로 변환하는 함수.
export async function convertTo<T extends z.ZodType>(schema: T, payload: Buffer): Promise<z.infer<T>> {
  try {
    return schema.parseAsync(JSON.parse(payload.toString()));
  } catch (error) {
    if (error instanceof Error) {
      throw new SonamuTaskError("validation", error);
    }

    throw new SonamuTaskError("validation");
  }
}

export async function processEvent<T extends TaskNodeEvent>(
  taskNode: SonamuTaskNode,
  data: T,
  knex?: Knex,
  retry?: RetryConfig
) {
  if (!knex) {
    knex = taskNode.knex;
  }

  const executes: Knex.QueryBuilder[] = [];
  switch (data.type) {
    case "start":
      executes.push(
        knex.insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
        }).into("sonamu_task_events")
      );
      break;

    case "stop":
      executes.push(
        knex.insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
          reason: data.reason,
          error_message: data.error?.message,
          error_stack: data.error?.stack,
        }).into("sonamu_task_events")
      );
      break;

    case "fetch":
      executes.push(knex.insert({
        event_type: data.type,
        node_id: data.node.id.toHex(),
        node_name: data.node.name,
        timestamp: data.timestamp,
      }).into("sonamu_task_events"));
      break;

    case "process:start":
      executes.push(
        knex.insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
          task_id: data.task.id,
          task_retry_count: data.task.retryCount,
        }).into("sonamu_task_events")
      );
      break;

    case "process:error":
      executes.push(
        knex.insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
          task_id: data.task.id,
          task_retry_count: data.task.retryCount,
          error_message: data.error?.message,
          error_stack: data.error?.stack,
        }).into("sonamu_task_events")
      );

      executes.push(
        knex("sonamu_tasks")
          .where("id", data.task.id)
          .update((data.task.retryCount + 1) >= (retry?.maxAttempts ?? 0) ? {
            status: "error",
            updated_at: new Date(),
          } : {
            status: "pending_for_retry",
            retry_count: data.task.retryCount + 1,
            updated_at: new Date(),
          })
      );
      break;

    case "process:complete":
      executes.push(
        knex.insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
          task_id: data.task.id,
          task_retry_count: data.task.retryCount,
        }).into("sonamu_task_events")
      );

      executes.push(
        knex("sonamu_tasks")
          .where("id", data.task.id)
          .update({
            status: "completed",
            updated_at: new Date(),
          })
      );
      break;

    default:
      throw new Error(`Unknown task type: ${data}`);
  }

  await Promise.all(executes);
  taskNode.emit(data.type, data);
}

// MySQL에서 Queue해서 가져오기
export async function taskWrapper(taskNode: SonamuTaskNode) {
  taskNode.stateMachine.changeState("running");
  const trx = await taskNode.knex.transaction();
  await processEvent(taskNode, {
    type: "fetch",
    node: taskNode.nodeInfo,
    timestamp: new Date(),
  }, trx);

  const rawTask = await trx.select("id", "created_at", "updated_at", "namespace", "status", "retry_count", "payload")
    .from("sonamu_tasks")
    .whereIn("status", ["pending"])
    .forUpdate()
    .skipLocked()
    .limit(1)
    .first();

  if (!rawTask) {
    await trx.rollback();
    taskNode.stateMachine.changeState("idle");
    return;
  }

  const taskInfo: TaskInfo = {
    id: rawTask.id,
    createdAt: rawTask.created_at,
    updatedAt: rawTask.updated_at,
    status: rawTask.status,
    namespace: rawTask.namespace,
    retryCount: rawTask.retry_count,
    payload: rawTask.payload,
  };

  await processEvent(taskNode, {
    type: "process:start",
    task: taskInfo,
    timestamp: new Date(),
    node: taskNode.nodeInfo,
  }, trx);

  // Router에서 Route를 찾음
  const matched = findRoute(taskNode.router, "", taskInfo.namespace);
  if (!matched) {
    await processEvent(taskNode, {
      type: "process:error",
      task: taskInfo,
      timestamp: new Date(),
      node: taskNode.nodeInfo,
      reason: "no_route",
    }, trx);
    await trx.commit();
    taskNode.stateMachine.changeState("idle");
    return;
  }

  try {
    await processTask(matched, taskInfo);
    await processEvent(taskNode, {
      type: "process:complete",
      task: taskInfo,
      timestamp: new Date(),
      node: matched.data.node,
    }, trx, matched.data.retry);
  } catch (err) {
    let evt: TaskNodeEvent;
    if (isSonamuTaskError(err)) {
      evt = {
        type: "process:error",
        task: taskInfo,
        timestamp: new Date(),
        node: matched.data.node,
        reason: err.type,
        error: err.cause ?? err,
      };
    } else if (err instanceof Error) {
      evt = {
        type: "process:error",
        task: taskInfo,
        timestamp: new Date(),
        node: matched.data.node,
        reason: "exception",
        error: err,
      };
    } else {
      evt = {
        type: "process:error",
        task: taskInfo,
        timestamp: new Date(),
        node: matched.data.node,
        reason: "exception",
        error: new Error(`Unknown Error: ${err}`),
      };
    }

    await processEvent(taskNode, evt, trx, matched.data.retry);
  } finally {
    await trx.commit();
    taskNode.stateMachine.changeState("idle");
    await trx.destroy();
  }
}

// Router에서 잡힌 후, Task 처리
export async function processTask(matched: MatchedRoute<TaskRouterContext & { node: NodeInfo }>, taskInfo: TaskInfo) {
  const { data: ctx, params } = matched;

  // 재시도 횟수를 체크함.
  if (ctx.retry.maxAttempts < taskInfo.retryCount) {
    throw new SonamuTaskError("max_retries_exceeded");
  }

  // 데이터를 파싱해서 context를 만들고 던짐.
  const result = ctx.target({
    task: {
      ...taskInfo,
      payload: await convertTo(ctx.schema, taskInfo.payload),
    },
    params,
    retry: ctx.retry,
  });

  if (result instanceof Promise) {
    await result;
  }
}

export class SonamuTaskNode {
  readonly #event: EventEmitter;
  readonly knex: Knex;
  readonly nodeInfo: NodeInfo;
  readonly router: RouterContext<TaskRouterContext & { node: NodeInfo }>;
  readonly stateMachine: TaskItemStateMachine;

  constructor(input: TaskNodeConfigInput) {
    const config = getConfigFromInput(input);
    const nodeInfo = {
      id: uuidv7obj(),
      name: config.name,
    };

    this.#event = new EventEmitter();
    this.knex = knex(config.database);
    this.nodeInfo = nodeInfo;
    this.router = createRouter();
    this.stateMachine = new TaskItemStateMachine();

    for (const route of config.routes ?? []) {
      addRoute(this.router, "", route.path, {
        ...route,
        node: nodeInfo,
        retry: {
          delay: route.retry?.delay ?? config.retry?.delay ?? { },
          maxAttempts: route.retry?.maxAttempts ?? config.retry?.maxAttempts ?? 3,
        },
      });
    }
  }

  get state() {
    return this.stateMachine.state;
  }

  on(name: EventType | "*", fn: OnEventFunction) {
    if (this.state === "destroyed") {
      throw new Error("Already Disposed");
    }

    this.#event.on(name, fn);
  }

  off(name: EventType | "*", fn: OnEventFunction) {
    if (this.state === "destroyed") {
      throw new Error("Already Disposed");
    }

    this.#event.off(name, fn);
  }

  emit(name: EventType | "*", ...args: any[]) {
    if (this.state === "destroyed") {
      throw new Error("Already Disposed");
    }

    this.#event.emit("*", ...args);
    if (name !== "*") {
      this.#event.emit(name, ...args);
    }
  }

  async [Symbol.asyncDispose]() {
    return this.destroy();
  }

  async setup(): Promise<void> {
    if (this.state === "destroyed") {
      throw new Error("Already Disposed");
    }
  }

  run() {
    this.stateMachine.changeState("idle");
    this.knex.transaction(async (trx) => {
      await processEvent(this, {
        type: "start",
        node: this.nodeInfo,
        timestamp: new Date(),
      }, trx);
      await trx.commit();
    }).then(() => {
      taskWrapper(this);
    });
  }

  destroy() {
    this.knex.transaction(async (trx) => {
      await processEvent(this, {
        type: "stop",
        node: this.nodeInfo,
        timestamp: new Date(),
        reason: "app_shutdown",
      }, trx);
      await trx.commit();
    }).then(() => this.knex.destroy());
    this.stateMachine.changeState("destroyed");
    this.#event.removeAllListeners();
  }
}

function getConfigFromInput(input: TaskNodeConfigInput): TaskNodeConfig {
  if (typeof input === "function") {
    return input();
  }

  return input;
}
