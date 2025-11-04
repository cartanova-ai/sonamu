import type { z } from "zod";
import type { RetryConfig } from "./config";
import type { TaskItem } from "./task-items";
import type { Callback } from "./utils";

// Router에서 가지고 있을 Context 정보
export interface TaskRouterContext<T extends z.ZodType = z.ZodType> {
  path: string;
  retry: RetryConfig;
  schema: T;
  target: Callback<TaskContext<T>, void>;
}

// 각 Task Route 함수가 가지고 있을 Context 정보
export type TaskContext<T extends z.ZodType = z.ZodType> = {
  params?: Record<string, string>;
  retry: RetryConfig;
  taskItem: Omit<TaskItem, "payload"> & { payload: z.infer<T> };
};
