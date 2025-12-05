import type { Tool, ToolCallOptions } from "@ai-sdk/provider-utils";
import { tool } from "@ai-sdk/provider-utils";
import type { Agent, ToolSet } from "ai";
import { ToolLoopAgent } from "ai";
import { AsyncLocalStorage } from "async_hooks";
import inflection from "inflection";
import type { AgentConfig, RegisteredToolDefinition, ToolDecoratorOptions } from "./types";

const toolDefinitions: RegisteredToolDefinition[] = [];

// TODO(Haze, 251205): 텍스트가 아닌 structured output일 경우에 대한 지원이 필요
export class BaseAgentClass<TStore> {
  private _als = new AsyncLocalStorage<TStore>();

  public get store() {
    return this._als.getStore();
  }

  // NOTE: [schemaSymbol] 추론 불가로 인해 캐스팅
  protected get toolSet() {
    const targeted = toolDefinitions.filter((def) => def.from === this.constructor.name);
    return targeted.reduce<Record<string, Tool>>((acc, def) => {
      acc[def.name] = tool({
        description: def.description,
        inputSchema: def.schema.input,
        outputSchema: def.schema.output,
        needsApproval: def.needsApproval ?? false,
        toModelOutput: def.toModelOutput,
        providerOptions: def.providerOptions,
        execute: (input: unknown, options: ToolCallOptions) => {
          const bound = def.method.bind(this);
          return bound.length >= 2 ? bound(input, options) : bound(input);
        },
      });
      return acc;
    }, {}) as ToolSet;
  }

  public get tools(): ToolSet {
    return this.toolSet;
  }

  public use<TReturn>(
    config: AgentConfig,
    initialStatus: TStore,
    callback: (agent: Agent<never, ToolSet>) => Promise<TReturn>,
  ) {
    const agent = new ToolLoopAgent({
      ...config,
      tools: this.tools,
    });

    return this._als.run(initialStatus, () => callback(agent));
  }
}

export function tools<INPUT, OUTPUT = unknown>(options: ToolDecoratorOptions<INPUT, OUTPUT>) {
  const { name, description, schema, needsApproval, toModelOutput, providerOptions } = options;
  return (target: BaseAgentClass<unknown>, propertyKey: string, descriptor: PropertyDescriptor) => {
    if (!(target instanceof BaseAgentClass)) {
      throw new Error("Target must be a subclass of BaseAgentClass");
    }

    const method = descriptor.value;
    const modelName = target.constructor.name.match(/(.+)Class$/)?.[1];
    const methodName = propertyKey;

    const defaultPath =
      modelName !== undefined
        ? `${inflection.camelize(
            (modelName ?? "").replace(/Model$/, "").replace(/Frame$/, ""),
            true,
          )}.${inflection.camelize(methodName, true)}`
        : inflection.camelize(methodName, true);

    toolDefinitions.push({
      name: name ?? defaultPath,
      description,
      schema,
      needsApproval,
      toModelOutput,
      providerOptions,
      method,
      from: target.constructor.name,
    });
  };
}
