import type { LoggerConfig, LogLevel, Sink } from "@logtape/logtape";
import type { Knex } from "knex";
import type { UnroutedTaskEvent } from "./events";
import type { RetryConfig, TaskRouterContext } from "./tasks";
import z from "zod";

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

// TODO(251103, Haze): Periodic Task에 대한 지원을 추가해야함.
export interface TaskNodeConfig {
  // 로깅을 어떻게 할지에 대한 설정 (LogTape 참조)
  log: {
    // Default: INFO
    level?: LogLevel;
    // Default: Console Sinker only
    sinkers?: Record<string, Sink>;
    loggers?: LoggerConfig<string, string>[];
  };

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
