import { findRoute, type RouterContext } from "rou3";
import { isSonamuTaskError } from "../errors";
import {
  type NodeInfo,
  type RetryConfig,
  type RoutedTaskEvent,
  type TaskEvent,
  type TaskInfo,
  type TaskRouterContext,
} from "../types";
import { routedAction } from "./shared";
import { add, Duration } from 'date-fns';

function getDuration(attempt: number, delay: RetryConfig["delay"]): Duration {
  if (delay instanceof Function) {
    return delay(attempt);
  }

  return delay ?? { minutes: 1 };
}

function calculateToMs(duration: Duration, date: Date = new Date()): number {
  return add(date, duration).getTime() - date.getTime();
}

export async function wrapLocalTask(
  router: RouterContext<TaskRouterContext & { node: NodeInfo }>,
  node: NodeInfo,
  onEvent: (data: TaskEvent) => void,
  taskInfo: TaskInfo,
) {
  // Router에서 Route를 찾음
  const matched = findRoute(router, "", taskInfo.namespace);
  if (!matched) {
    onEvent({
      type: "process:error",
      task: taskInfo,
      timestamp: new Date(),
      node,
      reason: "no_route",
    });
    return;
  }

  while (taskInfo.attempt <= matched.data.retry.maxAttempts) {
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
      })();
      return;
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

      taskInfo = {
        ...taskInfo,
        attempt: taskInfo.attempt + 1
      };

      if (taskInfo.attempt >= matched.data.retry.maxAttempts) {
        const delayMs = calculateToMs(getDuration(taskInfo.attempt, matched.data.retry.delay));
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
}
