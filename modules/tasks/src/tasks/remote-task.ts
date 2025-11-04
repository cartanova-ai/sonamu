import type { Knex } from "knex";
import type {
  NodeInfo,
  TaskInfo,
  UnroutedTaskEvent,
  RoutedTaskEvent,
  TaskRouterContext,
  TaskEvent,
} from "../types";
import { type RouterContext, findRoute } from "rou3";
import { isSonamuTaskError } from "../errors";
import { routedAction } from "./shared";

export async function saveUnroutedTaskEvent(
  knex: Knex,
  data: UnroutedTaskEvent,
) {
  switch (data.type) {
    case "start":
      return knex
        .insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
        })
        .into("sonamu_task_events");
    case "stop":
      return knex
        .insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
          reason: data.reason,
          error_message: data.error?.message,
          error_stack: data.error?.stack,
        })
        .into("sonamu_task_events");
    case "fetch":
      return knex
        .insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
        })
        .into("sonamu_task_events");

    default:
      throw new Error(`Unknown task event type: ${(data as any).type}`);
  }
}

export async function saveRoutedTaskEvent<T extends RoutedTaskEvent>(
  knex: Knex,
  router: RouterContext<TaskRouterContext & { node: NodeInfo }>,
  data: T,
) {
  const executes: Knex.QueryBuilder[] = [];
  const matched = findRoute(router, "", data.task.namespace);

  switch (data.type) {
    case "process:start":
      executes.push(
        knex
          .insert({
            event_type: data.type,
            node_id: data.node.id.toHex(),
            node_name: data.node.name,
            timestamp: data.timestamp,
            task_id: data.task.id,
            task_retry_count: data.task.retryCount,
          })
          .into("sonamu_task_events"),
      );
      break;

    case "process:error":
      break;

    case "process:complete":
      executes.push(
        knex
          .insert({
            event_type: data.type,
            node_id: data.node.id.toHex(),
            node_name: data.node.name,
            timestamp: data.timestamp,
            task_id: data.task.id,
            task_retry_count: data.task.retryCount,
          })
          .into("sonamu_task_events"),
      );

      executes.push(knex("sonamu_tasks").where("id", data.task.id).delete());

      executes.push(
        knex
          .insert({
            id: data.task.id,
            created_at: data.task.createdAt,
            completed_at: data.timestamp,
            namespace: data.task.namespace,
            payload: data.task.payload,
            retry_count: data.task.retryCount,
            status: "completed",
          })
          .into("sonamu_archived_tasks"),
      );
      break;

    default:
      throw new Error(`Unknown task type: ${data}`);
  }

  if (data.type === "process:error") {
    executes.push(
      knex
        .insert({
          event_type: data.type,
          node_id: data.node.id.toHex(),
          node_name: data.node.name,
          timestamp: data.timestamp,
          task_id: data.task.id,
          task_retry_count: data.task.retryCount,
          reason: data.reason,
          error_message: data.error?.message,
          error_stack: data.error?.stack,
        })
        .into("sonamu_task_events"),
    );

    if (data.task.retryCount + 1 >= (matched?.data.retry.maxAttempts ?? 1)) {
      executes.push(knex("sonamu_tasks").where("id", data.task.id).delete());

      executes.push(
        knex
          .insert({
            id: data.task.id,
            created_at: data.task.createdAt,
            completed_at: data.timestamp,
            namespace: data.task.namespace,
            payload: data.task.payload,
            retry_count: data.task.retryCount,
            status: "error",
          })
          .into("sonamu_archived_tasks"),
      );
    } else {
      executes.push(
        knex("sonamu_tasks")
          .where("id", data.task.id)
          .update({
            status: "pending_for_retry",
            retry_count: data.task.retryCount + 1,
            updated_at: data.timestamp,
          }),
      );
    }
  }

  await Promise.all(executes);
}

export async function wrapRemoteTask(
  router: RouterContext<TaskRouterContext & { node: NodeInfo }>,
  node: NodeInfo,
  onEvent: (data: TaskEvent) => void,
  knex: Knex,
) {
  const trx = await knex.transaction();
  await (async () => {
    const event: UnroutedTaskEvent = {
      type: "fetch",
      node,
      timestamp: new Date(),
    };

    onEvent(event);
    await saveUnroutedTaskEvent(trx, event);
  })();

  // NOTE: 대기 처리를 Queue를 별도로 분리한다면 where status = "pending_for_retry"를 추가하면 됨.
  const rawTask = await trx
    .select(
      "id",
      "created_at",
      "updated_at",
      "namespace",
      "status",
      "retry_count",
      "payload",
    )
    .from("sonamu_tasks")
    .forUpdate()
    .skipLocked()
    .limit(1)
    .first();

  if (!rawTask) {
    await trx.rollback();
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

  await (async () => {
    const event: RoutedTaskEvent = {
      type: "process:start",
      task: taskInfo,
      timestamp: new Date(),
      node,
    };

    onEvent(event);
    await saveRoutedTaskEvent(trx, router, event);
  })();

  // Router에서 Route를 찾음
  const matched = findRoute(router, "", taskInfo.namespace);
  if (!matched) {
    await (async () => {
      const event: RoutedTaskEvent = {
        type: "process:error",
        task: taskInfo,
        timestamp: new Date(),
        node,
        reason: "no_route",
      };

      onEvent(event);
      await saveRoutedTaskEvent(trx, router, event);
    })();
    await trx.commit();
    return;
  }

  try {
    await routedAction(matched, taskInfo);
    await (async () => {
      const event: RoutedTaskEvent = {
        type: "process:complete",
        task: taskInfo,
        timestamp: new Date(),
        node: matched.data.node,
      };

      onEvent(event);
      await saveRoutedTaskEvent(trx, router, event);
    })();
  } catch (err) {
    let evt: RoutedTaskEvent;
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

    onEvent(evt);
    await saveRoutedTaskEvent(trx, router, evt);
  } finally {
    await trx.commit();
  }
}
