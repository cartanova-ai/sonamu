import type { TaskItem } from "./task-items";

// Event에는 시간, Event 타입, Task에 대한 namespace, Task ID, 처리한 Task의 노드 이름, 이벤트에 대한 메타 정보 데이터 등이 들어감.
export type EventType =
  | "start"
  | "stop"
  | "fetch"
  | "process:start"
  | "process:error"
  | "process:complete";

// Task가 왜 중단되는지를 남김.
//  - app_shutdown: 애플리케이션의 정상적인 종료
//  - process_signal: 외부에서의 프로세스 시그널로 인한 중단
//  - unknown: 모름, 그래서 call stack을 남겨야함.
export type TerminationReasonEnum =
  | "app_shutdown"
  | "process_signal"
  | "unknown";

// Process Error 사유
//  - no_route: Task가 이 namespace를 지원하지 않음
//  - serialization: 인자 등 데이터의 검증에 실패함
//  - timeout: 처리 중 타임아웃
//  - max_retries_exceeded: 최대 재시도 횟수 초과
//  - exception: 다른 예외 발생
export type ProcessErrorReasonEnum =
  | "no_route"
  | "validation"
  | "timeout"
  | "max_retries_exceeded"
  | "exception";

// id는 자동으로 생성된 uuidv7, 이름은 설정을 통해 명시적으로 지정 가능
export interface SchedulerInfo {
  id: string;
  name?: string;
}

interface BaseNodeEvent {
  type: EventType;
  info: SchedulerInfo;
  timestamp: Date;
}

// Task가 시작될 때 생기는 이벤트
export interface StartEvent extends BaseNodeEvent {
  type: "start";
}

// Task가 종료될 때 생기는 이벤트
export interface StopEvent extends BaseNodeEvent {
  type: "stop";
  // Task가 종료된 이유
  reason: TerminationReasonEnum;
  // StopEvent.type가 unknown일 때는 call stack을 기록
  error?: Error;
}

// Remote Task에서 Task Item을 가져올 때 생기는 이벤트
export interface FetchEvent extends BaseNodeEvent {
  type: "fetch";
}

// Task에서 TaskItem 처리를 시작할 때 생기는 이벤트
export interface ProcessStartEvent extends BaseNodeEvent {
  type: "process:start";
  task: TaskItem;
}

// Task에서 TaskItem 처리를 완료했을 때 생기는 이벤트
export interface ProcessCompleteEvent extends BaseNodeEvent {
  type: "process:complete";
  task: TaskItem;
}

// Task에서 TaskItem 처리를 실패했을 때 생기는 이벤트
export interface ProcessErrorEvent extends BaseNodeEvent {
  type: "process:error";
  task: TaskItem;
  reason: ProcessErrorReasonEnum;
  // ProcessErrorEvent.type가 no_route, timeout, max_retries_exceeded이 아닐 때는 call stack을 기록
  error?: Error;
}

export type RoutedTaskEvent =
  | ProcessStartEvent
  | ProcessCompleteEvent
  | ProcessErrorEvent;
export type UnroutedTaskEvent = StartEvent | StopEvent | FetchEvent;
export type TaskEvent = UnroutedTaskEvent | RoutedTaskEvent;
