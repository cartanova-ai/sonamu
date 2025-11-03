import { z } from "zod";
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

export interface TaskInfo {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  status: TaskState;
  namespace: string;
  retryCount: number;
  // Task의 payload.
  payload: Buffer;
}

export interface RetryConfig {
  // 최대 횟수 (def: 3)
  maxAttempts: number;
  // 재시도 간격
  delay?: Duration | (() => Duration);
}

export interface TaskRouterContext<T extends z.ZodType = z.ZodType> {
  path: string;
  schema: T;
  target: Callback<TaskContext<T>, void>;
  retry: RetryConfig;
}

export type TaskContext<T extends z.ZodType = z.ZodType> = {
  task: Omit<TaskInfo, "payload"> & { payload: z.infer<T>; };
  retry: RetryConfig;
  params?: Record<string, string>;
};
