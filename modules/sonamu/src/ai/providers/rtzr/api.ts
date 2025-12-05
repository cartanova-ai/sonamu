import { lazySchema, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";

export const rtzrAuthResponseSchema = z.object({
  access_token: z.string(),
  expire_at: z.number(),
});

export const rtzrTranscriptionResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
    }),
  ),
);

export const rtzrTranscriptionResultResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      id: z.string(),
      status: z.enum(["transcribing", "completed", "failed"]),
      results: z
        .object({
          utterances: z.array(
            z.object({
              start_at: z.number(),
              duration: z.number(),
              msg: z.string(),
              spk: z.number(),
              lang: z.string().optional(),
            }),
          ),
        })
        .nullish(),
    }),
  ),
);
