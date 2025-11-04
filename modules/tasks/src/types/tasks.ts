import type { z } from "zod";
import type { Callback } from "./utils";
import type { Duration } from "date-fns";

// Task 상태
//  - pending: 대기 중
//  - pending_for_retry: 재시도 대기 중
//  - max_retries_exceeded: 최대 재시도 횟수 초과 (처리 종료)
//  - error: 처리 중 에러 발생 (처리 종료)
//  - completed: 처리 완료
export type TaskState =
  | "pending"
  // | "pending_for_retry"
  | "max_retries_exceeded"
  | "error"
  | "completed";

export interface TaskInfo<T extends z.ZodType = z.ZodType> {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: TaskState;
  namespace: string;
  attempt: number;
  // Task의 payload.
  payload: Buffer | z.infer<T>;
}

export interface RetryConfig {
  // 최대 횟수 (def: 1)
  maxAttempts: number;
  // 재시도 간격
  delay?: Duration | ((attempt: number) => Duration);
}

export interface TaskRouterContext<T extends z.ZodType = z.ZodType> {
  path: string;
  retry: RetryConfig;
  schema: T;
  target: Callback<TaskContext<T>, void>;
}

export type TaskContext<T extends z.ZodType = z.ZodType> = {
  params?: Record<string, string>;
  retry: RetryConfig;
  task: Omit<TaskInfo, "payload"> & { payload: z.infer<T> };
};
