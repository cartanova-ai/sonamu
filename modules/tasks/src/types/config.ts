import type { LoggerConfig, LogLevel, Sink } from "@logtape/logtape";
import type { Duration } from "date-fns";
import type { RetryConfig, TaskRouterContext } from "./tasks";
import type { EventType, TaskNodeEvent } from "./events";
import type { Knex } from "knex";

export type OnEventFunction<T extends TaskNodeEvent = TaskNodeEvent> = (
  event: T,
) => void | Promise<void>;

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

  // MySQL에서 Task를 가져오기 위한 주기
  duration?: Duration;

  // // TODO: Task를 처리하기 위한 하위 Worker의 수
  // maxWorkers?: number;

  // 전역적 재시도 설정 (없으면 각 Task의 설정을 따름)
  retry?: Partial<RetryConfig>;

  // 어느 Namespace의 Task를 어떻게 처리할지
  routes: (Omit<TaskRouterContext, "retry"> & { retry?: RetryConfig })[];
}

export type TaskNodeConfigInput = TaskNodeConfig | (() => TaskNodeConfig);
