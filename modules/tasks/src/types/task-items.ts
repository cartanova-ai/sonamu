import type { z } from "zod";

// Task 상태
//  - pending: 대기 중
//  - pending_for_retry: 재시도 대기 중
//  - error: 처리 중 에러 발생 (처리 종료)
//  - completed: 처리 완료
export type TaskItemState = "pending" | "error" | "completed";

export interface TaskItem<T extends z.ZodType = z.ZodType> {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: TaskItemState;
  namespace: string;
  attempt: number;
  // Task의 payload.
  payload: Buffer | z.infer<T>;
}
