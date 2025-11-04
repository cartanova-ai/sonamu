import { findRoute, type RouterContext } from "rou3";
import type {
  TaskInfo,
  NodeInfo,
  RoutedTaskEvent,
  TaskEvent,
  TaskRouterContext,
} from "../types";
import { isSonamuTaskError } from "../errors";
import { routedAction } from "./shared";

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
  }
}
