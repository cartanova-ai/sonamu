/** biome-ignore-all lint/suspicious/noExplicitAny: Task 프로젝트 임시 조치 */

import type { MatchedRoute } from "rou3";
import type { z } from "zod";
import { SonamuTaskError } from "../errors";
import type { SchedulerInfo, TaskItem, TaskRouterContext } from "../types";

// UTF-8 JSON Buffer를 Zod Type으로 변환하는 함수.
// NOTE: 여기를 잘 처리하면 serialize/parse를 JSON이 아닌 형식으로도 변환할 수 있음.
export async function convertTo<T extends z.ZodType>(
  schema: T,
  payload: Buffer | string | any,
): Promise<z.infer<T>> {
  try {
    if (payload instanceof Buffer) {
      return schema.parseAsync(JSON.parse(payload.toString()));
    }

    if (typeof payload === "string") {
      return schema.parseAsync(JSON.parse(payload));
    }

    return schema.parseAsync(payload);
  } catch (error) {
    if (error instanceof Error) {
      throw new SonamuTaskError("validation", error);
    }

    throw new SonamuTaskError("validation");
  }
}

// Router에서 매칭 후, 모든 TaskItem의 처리
export async function routedAction(
  matched: MatchedRoute<TaskRouterContext & { info: SchedulerInfo }>,
  taskInfo: TaskItem,
) {
  const { data: ctx, params } = matched;

  // 재시도 횟수를 체크함.
  if (ctx.retry.maxAttempts < taskInfo.attempt) {
    throw new SonamuTaskError("max_retries_exceeded");
  }

  // 데이터를 파싱해서 context를 만들고 실제 route 함수를 실행.
  const result = ctx.target({
    taskItem: {
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
