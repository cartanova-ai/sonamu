import type { MatchedRoute } from "rou3";
import type { TaskInfo, TaskRouterContext, NodeInfo } from "../types";
import { SonamuTaskError } from "../errors";
import { z } from "zod";

// UTF-8 JSON Buffer를 Zod Type으로 변환하는 함수.
export async function convertTo<T extends z.ZodType>(
  schema: T,
  payload: Buffer,
): Promise<z.infer<T>> {
  try {
    return schema.parseAsync(JSON.parse(payload.toString()));
  } catch (error) {
    if (error instanceof Error) {
      throw new SonamuTaskError("validation", error);
    }

    throw new SonamuTaskError("validation");
  }
}

// Router에서 잡힌 후, Task 처리
export async function routedAction(
  matched: MatchedRoute<TaskRouterContext & { node: NodeInfo }>,
  taskInfo: TaskInfo,
) {
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
