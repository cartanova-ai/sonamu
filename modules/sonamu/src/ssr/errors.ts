import { type ZodError } from "zod";

import { BadRequestException } from "../exceptions/so-exceptions";

/**
 * SSR preload 인자가 API의 HTTP 검증기를 통과하지 못했을 때 던지는 예외입니다.
 *
 * 가드 실패나 모델 오류는 해당 preload만 건너뛰지만, 이 예외는 renderSSR이 다시 던져
 * SSR 응답이 400이 되게 합니다.
 */
export class SSRPreloadValidationException extends BadRequestException<{ zodError: ZodError }> {}
