import { type ProviderOptions, type Tool } from "@ai-sdk/provider-utils";
import { type LanguageModel, type StopCondition, type ToolSet } from "ai";
import type * as z4 from "zod/v4";

export type ToolChoiceLimited = "auto" | "none" | "required";

export interface ToolDecoratorSchema<INPUT, OUTPUT = unknown> {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- zod type의 타입 추론에 필요
  input: z4.core.$ZodType<INPUT, any>;
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- zod type의 타입 추론에 필요
  output?: z4.core.$ZodType<OUTPUT, any>;
}

export interface ToolDecoratorOptions<INPUT, OUTPUT = unknown> {
  name?: string;
  description?: string;
  schema: ToolDecoratorSchema<INPUT, OUTPUT>;
  needsApproval?: Tool<INPUT, OUTPUT>["needsApproval"];
  toModelOutput?: Tool<INPUT, OUTPUT>["toModelOutput"];
  providerOptions?: ProviderOptions;
}

export type RegisteredToolDefinition = {
  name: string;
  description?: string;
  schema: ToolDecoratorSchema<unknown>;
  needsApproval?: Tool["needsApproval"];
  toModelOutput?: Tool["toModelOutput"];
  providerOptions?: ProviderOptions;
  method: NonNullable<Tool["execute"]>;
  from: string;
};

export interface AgentConfig {
  model: LanguageModel;
  instructions?: string;
  toolChoice?: ToolChoiceLimited;
  providerOptions?: ProviderOptions;
  stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
  activeTools?: Array<string>;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  headers?: Record<string, string | undefined>;
}
