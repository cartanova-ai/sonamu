import type { Knex } from "knex";
import type {
  SchedulerInfo,
  TaskItem,
  UnroutedTaskEvent,
  RoutedTaskEvent,
  TaskRouterContext,
  TaskEvent,
} from "../types";
import { type RouterContext, findRoute } from "rou3";
import { isSonamuTaskError } from "../errors";
import { routedAction } from "./shared";

// start, stop, fetch 이벤트는 router를 잡기 전에 일어나서 별도로 분리
export async function saveUnroutedTaskEvent(
  knex: Knex,
  data: UnroutedTaskEvent,
) {
  switch (data.type) {
    case "start":
      return knex
        .insert({
          event_type: data.type,
          info_id: knex.fn.uuidToBin(data.info.id),
          info_name: data.info.name,
          timestamp: data.timestamp,
        })
        .into("sonamu_task_events");
    case "stop":
      return knex
        .insert({
          event_type: data.type,
          info_id: knex.fn.uuidToBin(data.info.id),
          info_name: data.info.name,
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
          info_id: knex.fn.uuidToBin(data.info.id),
          info_name: data.info.name,
          timestamp: data.timestamp,
        })
        .into("sonamu_task_events");

    default:
      throw new Error(`Unknown task event type: ${(data as any).type}`);
  }
}

// router에서 매칭 후 생긴 이벤트를 처리
export async function saveRoutedTaskEvent<T extends RoutedTaskEvent>(
  knex: Knex,
  router: RouterContext<TaskRouterContext & { info: SchedulerInfo }>,
  data: T,
) {
  const queries: Knex.QueryBuilder[] = [];
  const matched = findRoute(router, "", data.task.namespace);

  switch (data.type) {
    case "process:start":
      queries.push(
        knex
          .insert({
            event_type: data.type,
            info_id: knex.fn.uuidToBin(data.info.id),
            info_name: data.info.name,
            timestamp: data.timestamp,
            task_item_id: knex.fn.uuidToBin(data.task.id),
            attempt: data.task.attempt,
          })
          .into("sonamu_task_events"),
      );
      break;

    case "process:complete":
      // sonamu_task_items의 TaskItem을 sonamu_archived_task_items로 이동
      queries.push(
        knex
          .insert({
            event_type: data.type,
            info_id: knex.fn.uuidToBin(data.info.id),
            info_name: data.info.name,
            timestamp: data.timestamp,
            task_item_id: knex.fn.uuidToBin(data.task.id),
            attempt: data.task.attempt,
          })
          .into("sonamu_task_events"),
      );
      queries.push(
        knex("sonamu_task_items")
          .where("id", knex.fn.uuidToBin(data.task.id))
          .delete(),
      );
      queries.push(
        knex
          .insert({
            id: knex.fn.uuidToBin(data.task.id),
            created_at: data.task.createdAt,
            completed_at: data.timestamp,
            namespace: data.task.namespace,
            payload: data.task.payload,
            attempt: data.task.attempt,
            status: "completed",
          })
          .into("sonamu_archived_task_items"),
      );
      break;

    case "process:error":
      queries.push(
        knex
          .insert({
            event_type: data.type,
            info_id: knex.fn.uuidToBin(data.info.id),
            info_name: data.info.name,
            timestamp: data.timestamp,
            task_item_id: knex.fn.uuidToBin(data.task.id),
            attempt: data.task.attempt,
            reason: data.reason,
            error_message: data.error?.message,
            error_stack: data.error?.stack,
          })
          .into("sonamu_task_events"),
      );

      if (data.task.attempt >= (matched?.data.retry.maxAttempts ?? 1)) {
        // 최대 실행 횟수를 넘겼을 경우, 에러로 sonamu_archived_task_items로 옮김
        queries.push(
          knex("sonamu_task_items")
            .where("id", knex.fn.uuidToBin(data.task.id))
            .delete(),
        );

        queries.push(
          knex
            .insert({
              id: knex.fn.uuidToBin(data.task.id),
              created_at: data.task.createdAt,
              completed_at: data.timestamp,
              namespace: data.task.namespace,
              payload: data.task.payload,
              attempt: data.task.attempt,
              status: "error",
            })
            .into("sonamu_archived_task_items"),
        );
      } else {
        // 재시도 횟수 증가 및 상태 업데이트
        queries.push(
          knex("sonamu_task_items")
            .where("id", knex.fn.uuidToBin(data.task.id))
            .update({
              status: "pending",
              attempt: data.task.attempt + 1,
              updated_at: data.timestamp,
            }),
        );
      }
      break;

    default:
      throw new Error(`Unknown task type: ${data}`);
  }

  await Promise.all(queries);
}

// Scheduler에서 Remote Task가 돌아갈 때 실행되는 부분
// TODO: Retry를 지금은 서버에서 처리하기 떄문에 delay가 적용되지 않음.
export async function wrapRemoteTask(
  router: RouterContext<TaskRouterContext & { info: SchedulerInfo }>,
  info: SchedulerInfo,
  onEvent: (data: TaskEvent) => void,
  knex: Knex,
) {
  const trx = await knex.transaction();
  await (async () => {
    const event: UnroutedTaskEvent = {
      type: "fetch",
      info: info,
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
      "attempt",
      "payload",
    )
    .from("sonamu_task_items")
    .forUpdate()
    .skipLocked()
    .limit(1)
    .first();

  if (!rawTask) {
    await trx.rollback();
    return;
  }

  const item: TaskItem = {
    id: knex.fn.binToUuid(rawTask.id),
    createdAt: rawTask.created_at,
    updatedAt: rawTask.updated_at,
    status: rawTask.status,
    namespace: rawTask.namespace,
    attempt: rawTask.attempt,
    payload: rawTask.payload,
  };

  await (async () => {
    const event: RoutedTaskEvent = {
      type: "process:start",
      task: item,
      timestamp: new Date(),
      info: info,
    };

    onEvent(event);
    await saveRoutedTaskEvent(trx, router, event);
  })();

  // Router에서 Route를 찾음
  const matched = findRoute(router, "", item.namespace);
  if (!matched) {
    await (async () => {
      const event: RoutedTaskEvent = {
        type: "process:error",
        task: item,
        timestamp: new Date(),
        info: info,
        reason: "no_route",
      };

      onEvent(event);
      await saveRoutedTaskEvent(trx, router, event);
    })();
    await trx.commit();
    return;
  }

  try {
    await routedAction(matched, item);
    await (async () => {
      const event: RoutedTaskEvent = {
        type: "process:complete",
        task: item,
        timestamp: new Date(),
        info: matched.data.info,
      };

      onEvent(event);
      await saveRoutedTaskEvent(trx, router, event);
    })();
  } catch (err) {
    let evt: RoutedTaskEvent;
    if (isSonamuTaskError(err)) {
      evt = {
        type: "process:error",
        task: item,
        timestamp: new Date(),
        info: matched.data.info,
        reason: err.type,
        error: err.cause ?? err,
      };
    } else if (err instanceof Error) {
      evt = {
        type: "process:error",
        task: item,
        timestamp: new Date(),
        info: matched.data.info,
        reason: "exception",
        error: err,
      };
    } else {
      evt = {
        type: "process:error",
        task: item,
        timestamp: new Date(),
        info: matched.data.info,
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
