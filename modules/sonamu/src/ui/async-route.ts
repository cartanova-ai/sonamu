/** Fastify가 비동기 실패를 오류 처리기로 전달할 수 있도록 Promise를 반환합니다. */
export function forwardAsyncErrors<Result>(handler: () => Promise<Result>): Promise<Result> {
  return Promise.resolve().then(handler);
}
