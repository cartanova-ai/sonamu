import { lazySchema, zodSchema } from "@ai-sdk/provider-utils";
import { type InferSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";

export type RtzrTranscriptionModelId = "whisper" | "sommers" | (string & {});

const rtzrOptionFields = {
  domain: z.enum(["CALL", "GENERAL"]).default("GENERAL"),
  language: z.string(),
  languageCandidates: z.array(z.string()).optional(),
  keywords: z.union([z.string(), z.array(z.string())]).optional(),
  paragraphSplitterMax: z.number().optional(),
  diarization: z.boolean().optional(),
  itn: z.boolean().optional(),
  diarizationSpkCount: z.number().optional(),
  disfluencyFilter: z.boolean().optional(),
  paragraphSplitter: z.boolean().optional(),
  profanityFilter: z.boolean().optional(),
  wordTimestamp: z.boolean().optional(),
};

const rtzrOptionsMap = {
  domain: "domain",
  language: "language",
  languageCandidates: "language_candidates",
  keywords: "keywords",
  paragraphSplitterMax: "paragraph_splitter.max",
  diarization: "use_diarization",
  itn: "use_itn",
  diarizationSpkCount: "diarization.spk_count",
  disfluencyFilter: "use_disfluency_filter",
  paragraphSplitter: "use_paragraph_splitter",
  profanityFilter: "use_profanity_filter",
  wordTimestamp: "use_word_timestamp",
} satisfies Record<keyof typeof rtzrOptionFields, string>;

// https://developers.rtzr.ai/docs/stt-file/
export const rtzrTranscriptionProviderOptions = lazySchema(() =>
  zodSchema(
    z.object(rtzrOptionFields).transform((item) => {
      return Object.fromEntries(
        Object.entries(item).map(([key, value]) => {
          return [
            rtzrOptionsMap[
              /* SAFETY: Object.entries의 키는 입력 객체의 키로 제한된다. */ key as keyof typeof rtzrOptionFields
            ],
            value,
          ];
        }),
      );
    }),
  ),
);

export type RtzrTranscriptionProviderOptions = InferSchema<typeof rtzrTranscriptionProviderOptions>;
