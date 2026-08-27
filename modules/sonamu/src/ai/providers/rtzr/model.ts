import {
  type SharedV3Warning,
  type TranscriptionModelV3,
  type TranscriptionModelV3CallOptions,
} from "@ai-sdk/provider";
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  getFromApi,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  safeParseJSON,
  zodSchema,
} from "@ai-sdk/provider-utils";
import { type FetchFunction } from "@ai-sdk/provider-utils";
import { isEmpty } from "radashi";

import {
  rtzrAuthResponseSchema,
  rtzrTranscriptionResponseSchema,
  rtzrTranscriptionResultResponseSchema,
} from "./api";
import {
  formatRtzrErrorData,
  formatRtzrErrorResponseBody,
  RtzrClientError,
  rtzrFailedResponseHandler,
} from "./error";
import { rtzrTranscriptionProviderOptions } from "./options";
import { type RtzrTranscriptionModelId, type RtzrTranscriptionProviderOptions } from "./options";

function isNullish<Value>(value: Value): value is Value & (null | undefined) {
  return value === null || value === undefined;
}

export type RtzrTranscriptionCallOptions = Omit<
  TranscriptionModelV3CallOptions,
  "providerOptions"
> & {
  providerOptions?: {
    rtzr?: RtzrTranscriptionProviderOptions;
  };
};

interface RtzrTranscriptionModelConfig {
  _internal?: {
    currentDate?: () => Date;
  };
  provider: string;
  auth: {
    clientId: string;
    clientSecret: string;
  };
  url: (options: { path: string }) => string;
  headers: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  generateId?: () => string;
}

export class RtzrTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = "v3";

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: RtzrTranscriptionModelId,
    private readonly config: RtzrTranscriptionModelConfig,
  ) {}

  private async authorize() {
    const fetchApi = this.config.fetch ?? fetch;
    const response = await fetchApi(
      this.config.url({
        path: "/authenticate",
      }),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.auth.clientId,
          client_secret: this.config.auth.clientSecret,
        }),
      },
    );

    const responseBody = await response.text();
    if (!response.ok) {
      const detail = await formatRtzrErrorResponseBody(responseBody);
      throw new RtzrClientError(
        `Failed to authorize RTZR: HTTP ${response.status}${
          isNullish(detail) ? "" : `: ${detail}`
        }`,
      );
    }

    const parsedData = await safeParseJSON({
      text: responseBody,
      schema: zodSchema(rtzrAuthResponseSchema),
    });
    if (!parsedData.success) {
      throw new RtzrClientError(`Invalid RTZR auth response: ${parsedData.error.message}`);
    }

    return parsedData.value.access_token;
  }

  private async getArgs({ audio, mediaType, providerOptions }: RtzrTranscriptionCallOptions) {
    const warnings: SharedV3Warning[] = [];
    const rtzrOptions = await parseProviderOptions({
      provider: "rtzr",
      providerOptions,
      schema: rtzrTranscriptionProviderOptions,
    });

    const blob =
      audio instanceof Uint8Array
        ? new Blob([new Uint8Array(audio)])
        : new Blob([convertBase64ToUint8Array(audio)]);

    const formData = new FormData();
    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append(
      "file",
      new File([blob], "audio", { type: mediaType }),
      `audio.${fileExtension}`,
    );

    const config = { model_name: this.modelId, ...rtzrOptions };
    formData.append("config", JSON.stringify(config));

    return { formData, warnings };
  }

  async doGenerate(options: RtzrTranscriptionCallOptions) {
    const { _internal: internalConfig } = this.config;
    const currentDate = internalConfig?.currentDate?.() ?? new Date();

    const accessToken = await this.authorize();
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    };

    const { formData, warnings } = await this.getArgs(options);
    const {
      value: { id: transcriptionId },
      responseHeaders,
    } = await postFormDataToApi({
      url: this.config.url({
        path: "/transcribe",
      }),
      headers: combineHeaders(this.config.headers(), headers),
      formData,
      failedResponseHandler: rtzrFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(rtzrTranscriptionResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { value: response, rawValue } = await (async () => {
      // transcription이 끝날 때까지 RTZR 권장 간격인 5초마다 체크.
      // timeout을 따로 지정하지 않는 이유는 애초에 AbortSignal을 사용하고 있음.
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const data = await getFromApi({
          url: this.config.url({
            path: `/transcribe/${transcriptionId}`,
          }),
          headers: combineHeaders(this.config.headers(), headers),
          failedResponseHandler: rtzrFailedResponseHandler,
          successfulResponseHandler: createJsonResponseHandler(
            rtzrTranscriptionResultResponseSchema,
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

        if (data.value.status !== "transcribing") {
          return data;
        }
      }
    })();

    if (response.status === "failed") {
      const detail = isNullish(response.error)
        ? "unknown RTZR transcription error"
        : formatRtzrErrorData({
            error: response.error,
          });
      throw new RtzrClientError(
        `RTZR transcription failed for id ${response.id}: status ${response.status}: ` +
          `provider ${this.provider}: model ${this.modelId}: ${detail}`,
      );
    }

    const segments = response.results?.utterances ?? [];

    const languages = new Set(segments.map((item) => item.lang).filter((item) => !isEmpty(item)));
    const language = (() => {
      if (languages.size > 1) {
        return undefined;
      }

      return languages.values().next().value;
    })();

    return {
      text: segments.map((item) => item.msg).join("\n"),
      segments: segments.map((segment) => ({
        text: segment.msg,
        startSecond: Math.trunc(segment.start_at / 1000),
        endSecond: Math.trunc((segment.start_at + segment.duration) / 1000),
      })),
      language,
      warnings,
      durationInSeconds: segments.reduce((acc, segment) => acc + segment.duration, 0) ?? undefined,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
    };
  }
}
