import { AISDKError } from "@ai-sdk/provider";
import { createJsonErrorResponseHandler } from "@ai-sdk/provider-utils";
import { z } from "zod";

export const rtzrErrorDataSchema = z.object({
  error: z.object({
    msg: z.string(),
    type: z.string().nullish(),
    param: z.any().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type RtzrErrorData = z.infer<typeof rtzrErrorDataSchema>;

export const rtzrFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: rtzrErrorDataSchema,
  errorToMessage: (data) => data.error.msg,
});

export class RtzrClientError extends AISDKError {
  constructor(
    message: string,
    options?: {
      cause?: Error;
    },
  ) {
    super({
      name: "RtzrClientError",
      message,
      cause: options?.cause,
    });
  }
}
