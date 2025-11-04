import type { Knex } from "knex";
import type { UnroutedTaskEvent } from "./events";
import type { z } from "zod";
import type { Duration } from "date-fns";
import type { TaskRouterContext } from "./context";

export interface RetryConfig {
  // 최대 횟수 (def: 1, 재시도를 안함)
  maxAttempts: number;
  // 재시도 간격
  delay?: Duration | ((attempt: number) => Duration);
}

export type OnEventFunction<T extends UnroutedTaskEvent = UnroutedTaskEvent> = (
  event: T,
) => void | Promise<void>;

// MySQL에서 받아와서 있으면 실행할 태스크
export interface RemoteTaskConfig {
  type: "remote";
  expression: string;
  options?: {
    timezone?: string;
    name?: string;
    noOverlap?: boolean;
    maxExecutions?: number;
    maxRandomDelay?: number;
  };
}

// 로컬에서 router로 잡아서 실행할 태스크
export interface LocalTaskConfig<T extends z.ZodType = z.ZodType> {
  type: "local";
  expression: string;
  // router 태울 namespace
  namespace: string;
  payload: Buffer | z.infer<T>;
  options?: {
    timezone?: string;
    name?: string;
    noOverlap?: boolean;
    maxExecutions?: number;
    maxRandomDelay?: number;
  };
}

export interface SchedulerConfig {
  database: Knex.Config;

  // TaskNode에 이름을 지정할 수 있음
  name?: string;

  // Task 설정
  tasks: (RemoteTaskConfig | LocalTaskConfig)[];

  // 전역적 재시도 설정 (없으면 각 Task의 설정을 따름)
  retry?: RetryConfig;

  // 어느 Namespace의 Task를 어떻게 처리할지
  routes: (Omit<TaskRouterContext, "retry"> & { retry?: RetryConfig })[];
}
