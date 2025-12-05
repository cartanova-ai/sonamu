import type { ProviderOptions, Schema, Tool } from "@ai-sdk/provider-utils";
import type { LanguageModel, StopCondition, ToolSet } from "ai";

export type ToolChoiceLimited = "auto" | "none" | "required";

export interface ToolDecoratorSchema<INPUT, OUTPUT = unknown> {
  input: Schema<INPUT>;
  output?: Schema<OUTPUT>;
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
  schema: ToolDecoratorSchema<unknown, unknown>;
  needsApproval?: Tool["needsApproval"];
  toModelOutput?: Tool["toModelOutput"];
  providerOptions?: ProviderOptions;
  method: (...args: unknown[]) => unknown;
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
