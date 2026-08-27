import { type JsonValue } from "./json";

export type SerializedError = {
  name?: string;
  message: string;
  stack?: string;
} & {
  [key: string]: JsonValue;
};

/**
 * Serialize an error to a JSON-compatible format.
 * @param cause - The caught value to serialize
 * @returns A JSON-serializable error object
 */
export function serializeError(cause: unknown): SerializedError {
  if (cause instanceof Error) {
    const { name, message, stack } = cause;

    if (stack) {
      return { name, message, stack };
    }

    return { name, message };
  }

  return {
    message: String(cause),
  };
}
