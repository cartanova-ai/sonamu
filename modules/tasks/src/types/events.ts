import type { TaskInfo } from "./tasks";

// Event에는 시간, Event 타입, Task에 대한 namespace, Task ID, 처리한 TaskNode의 노드 이름, 이벤트에 대한 메타 정보 데이터 등이 들어감.
export type EventType =
  | "start"
  | "stop"
  | "fetch"
  | "process:start"
  | "process:error"
  | "process:complete";
// | "fetch:retry"
// | "process:start:retry"
// | "process:error:retry"
// | "process:complete:retry";

// TaskNode가 왜 중단되는지를 남김.
//  - app_shutdown: 애플리케이션의 정상적인 종료
//  - process_signal: 외부에서의 프로세스 시그널로 인한 중단
//  - unknown: 모름, 그래서 call stack을 남겨야함.
export type TerminationReasonEnum =
  | "app_shutdown"
  | "process_signal"
  | "unknown";

// Process Error 사유
//  - no_route: TaskNode가 이 namespace를 지원하지 않음
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

export interface NodeInfo {
  // 자동으로 생성되는 uuidv7
  id: string;

  // 명시적으로 지정한 node 이름
  name?: string;
}

interface BaseNodeEvent {
  type: EventType;
  node: NodeInfo;
  timestamp: Date;
}

// TaskNode가 시작될 때 생기는 이벤트
export interface StartEvent extends BaseNodeEvent {
  type: "start";
}

// TaskNode가 종료될 때 생기는 이벤트
export interface StopEvent extends BaseNodeEvent {
  type: "stop";
  // TaskNode가 종료된 이유
  reason: TerminationReasonEnum;
  // StopEvent.type가 unknown일 때는 call stack을 기록
  error?: Error;
}

// TaskNode에서 Task를 가져올 때 생기는 이벤트
export interface FetchEvent extends BaseNodeEvent {
  type: "fetch";
}

// TaskNode에서 Task를 가져와서 Lock이 걸리고 처리를 시작할 때 생기는 이벤트
export interface ProcessStartEvent extends BaseNodeEvent {
  type: "process:start";
  task: TaskInfo;
}

// TaskNode에서 Task를 처리를 완료했을 때 생기는 이벤트
export interface ProcessCompleteEvent extends BaseNodeEvent {
  type: "process:complete";
  task: TaskInfo;
}

// TaskNode에서 Task를 처리를 실패했을 때 생기는 이벤트
export interface ProcessErrorEvent extends BaseNodeEvent {
  type: "process:error";
  task: TaskInfo;
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

export interface IRawEvent {
  event_type: EventType;
  node_id: Readonly<Uint8Array>;
  node_name?: string;
  task_id?: number;
  task_retry_count?: number;
  reason?: string;
  error_message?: string;
  error_stack?: string;
  timestamp: Date;
}
