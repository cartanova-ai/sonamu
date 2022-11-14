import { FastifyInstance } from "fastify";
import { ZodIssue } from "zod";
import { isSoException } from "./so-exceptions";

export function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler((error, request, reply) => {
    error.statusCode ??= 400;

    if (isSoException(error) && error.payload && Array.isArray(error.payload)) {
      const issues = error.payload as ZodIssue[];
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
