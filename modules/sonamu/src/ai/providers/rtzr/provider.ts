import { NoSuchModelError } from "@ai-sdk/provider";
import { type ProviderV3, type TranscriptionModelV3 } from "@ai-sdk/provider";
import {
  loadApiKey,
  loadOptionalSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from "@ai-sdk/provider-utils";
import { type FetchFunction } from "@ai-sdk/provider-utils";

import { RtzrTranscriptionModel } from "./model";
import { type RtzrTranscriptionModelId } from "./options";

export interface RtzrProvider extends ProviderV3 {
  (modelId: RtzrTranscriptionModelId): TranscriptionModelV3;
  transcription(modelId: RtzrTranscriptionModelId): TranscriptionModelV3;
}

export interface RtzrProviderSettings {
  baseURL?: string;
  clientId?: string;
  clientSecret?: string;
  headers?: Record<string, string>;
  name?: string;
  fetch?: FetchFunction;
}

function handleUnsupportedTypes(modelType: "languageModel" | "embeddingModel" | "imageModel") {
  return (modelId: string) => {
    throw new NoSuchModelError({
      modelId,
      modelType,
    });
  };
}

export function createRtzr(options: RtzrProviderSettings = {}): RtzrProvider {
  const baseURL =
    withoutTrailingSlash(
      loadOptionalSetting({
        settingValue: options.baseURL,
        environmentVariableName: "RTZR_BASE_URL",
      }),
    ) ?? "https://openapi.vito.ai/v1";

  const providerName = options.name ?? "rtzr";

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        ...options.headers,
      },
      `cartanova-ai/rtzr-api-provider`,
    );

  const createTranscriptionModel = (modelId: RtzrTranscriptionModelId) => {
    const clientId = loadApiKey({
      apiKey: options.clientId,
      environmentVariableName: "RTZR_CLIENT_ID",
      description: "RTZR",
    });

    const clientSecret = loadApiKey({
      apiKey: options.clientSecret,
      environmentVariableName: "RTZR_CLIENT_SECRET",
      description: "RTZR",
    });

    return new RtzrTranscriptionModel(modelId, {
      provider: `${providerName}.transcription`,
      auth: {
        clientId,
        clientSecret,
      },
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: RtzrTranscriptionModelId) => createTranscriptionModel(modelId);

  provider.specificationVersion = "v3" as const;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  provider.languageModel = handleUnsupportedTypes("languageModel");
  provider.embeddingModel = handleUnsupportedTypes("embeddingModel");
  provider.imageModel = handleUnsupportedTypes("imageModel");
  return /* SAFETY: AI SDK 제공자와 도구 스키마 계약이 이 값의 타입을 보장한다. */ provider as RtzrProvider;
}

export const rtzr = createRtzr();
