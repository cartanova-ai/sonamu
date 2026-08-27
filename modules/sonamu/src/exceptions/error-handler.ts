import { type FastifyInstance } from "fastify";
import type z from "zod";

import { isObjectValue, isStringValue } from "../utils/runtime-value";
import { isSoException } from "./so-exceptions";

function isZodIssuePayload<Value>(payload: Value): payload is Value & z.core.$ZodIssue[] {
  return (
    Array.isArray(payload) &&
    payload.every(
      (issue) =>
        isObjectValue(issue) &&
        "message" in issue &&
        isStringValue(issue.message) &&
        "path" in issue &&
        Array.isArray(issue.path),
    )
  );
}

export function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler((error, request, reply) => {
    error.statusCode ??= 400;

    if (isSoException(error) && isZodIssuePayload(error.payload)) {
      const issues = error.payload;
      const [issue] = issues;
      const message = `${issue.message} (${issue.path.join("/")})`;

      request.log.error(`${error.statusCode} ${message}`);
      reply.status(error.statusCode <= 501 ? error.statusCode : 501).send({
        name: error.name,
        code: error.code,
        message: message,
        validationErrors: error.validation,
        issues,
      });
    } else {
      request.log.error(`${error.statusCode} ${error.message}`);
      reply.status(error.statusCode <= 501 ? error.statusCode : 501).send({
        name: error.name,
        code: error.code,
        message: error.message,
        validationErrors: error.validation,
      });
    }
  });
}
