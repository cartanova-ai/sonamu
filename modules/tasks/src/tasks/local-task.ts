import { findRoute, type RouterContext } from "rou3";
import { isSonamuTaskError } from "../errors";
import type {
  SchedulerInfo,
  RetryConfig,
  RoutedTaskEvent,
  TaskEvent,
  TaskItem,
  TaskRouterContext,
} from "../types";
import { routedAction } from "./shared";
import type { Duration } from "date-fns";

// Local 실행일 떄 Retry 설정에서 duration을 체크하는 법.
function getDuration(attempt: number, delay: RetryConfig["delay"]): Duration {
  // duration이 함수일 경우, 시도 횟수를 넣어서 계산
  if (delay instanceof Function) {
    return delay(attempt);
  }

  return delay ?? { minutes: 1 };
}

// date를 기점으로 duration을 계산해서 ms로 변환.
function calculateToMs(duration: Duration): number {
  const MS_PER_SECOND = 1000;
  const MS_PER_MINUTE = 60 * MS_PER_SECOND;
  const MS_PER_HOUR = 60 * MS_PER_MINUTE;
  const MS_PER_DAY = 24 * MS_PER_HOUR;
  const MS_PER_WEEK = 7 * MS_PER_DAY;
  const MS_PER_MONTH = 30 * MS_PER_DAY;
  const MS_PER_YEAR = 365 * MS_PER_DAY;

  return (
    (duration.years ?? 0) * MS_PER_YEAR +
    (duration.months ?? 0) * MS_PER_MONTH +
    (duration.weeks ?? 0) * MS_PER_WEEK +
    (duration.days ?? 0) * MS_PER_DAY +
    (duration.hours ?? 0) * MS_PER_HOUR +
    (duration.minutes ?? 0) * MS_PER_MINUTE +
    (duration.seconds ?? 0) * MS_PER_SECOND
  );
}

// Scheduler에서 Local Task가 돌아갈 때 실행되는 부분
export async function wrapLocalTask(
  router: RouterContext<TaskRouterContext & { info: SchedulerInfo }>,
  info: SchedulerInfo,
  onEvent: (data: TaskEvent) => void,
  item: TaskItem,
) {
  // Router에서 Route를 찾아서
  const matched = findRoute(router, "", item.namespace);
  if (!matched) {
    onEvent({
      type: "process:error",
      task: item,
      timestamp: new Date(),
      info: info,
      reason: "no_route",
    });
    return;
  }

  // 재시도 처리를 함
  while (item.attempt <= matched.data.retry.maxAttempts) {
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
      })();
      return;
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

      if (item.attempt < matched.data.retry.maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            calculateToMs(getDuration(item.attempt, matched.data.retry.delay)),
          ),
        );
      }

      item = {
        ...item,
        attempt: item.attempt + 1,
      };
    }
  }
}
