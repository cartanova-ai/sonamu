import { ProcessErrorReasonEnum } from "./types";

export class SonamuTaskError extends Error {
  cause: Error | undefined;
  type: ProcessErrorReasonEnum;

  constructor(type?: ProcessErrorReasonEnum, cause?: Error) {
    if (!type) {
      type = "exception";
    }

    super(`SonamuTaskError: ${type}`);
    this.name = "SonamuTaskError";
    this.type = type;
    if (cause) {
      this.cause = cause;
      this.stack = cause.stack;
    }
  }
}

export function isSonamuTaskError(error: unknown): error is SonamuTaskError {
  return error instanceof SonamuTaskError;
}
