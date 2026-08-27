import { AsyncLocalStorage } from "async_hooks";

import { type Tool, type ToolExecutionOptions } from "@ai-sdk/provider-utils";
import { tool } from "@ai-sdk/provider-utils";
import { getLogger } from "@logtape/logtape";
import { type Logger } from "@logtape/logtape";
import { type Agent, type ToolSet } from "ai";
import { ToolLoopAgent } from "ai";
import inflection from "inflection";

import { convertDomainToCategory } from "../../logger/category";
import { getModelNameFromClassName } from "../../utils/class-name";
import {
  type AgentConfig,
  type RegisteredToolDefinition,
  type ToolDecoratorOptions,
} from "./types";

const toolDefinitions: RegisteredToolDefinition[] = [];

// TODO(Haze, 251205): 텍스트가 아닌 structured output일 경우에 대한 지원이 필요
export class BaseAgentClass<TStore> {
  protected readonly logger: Logger;

  private asyncLocalStorage = new AsyncLocalStorage<TStore>();

  constructor(public readonly agentName: string = this.constructor.name) {
    this.logger = getLogger(convertDomainToCategory(this.agentName, "agent"));
  }

  public get store() {
    return this.asyncLocalStorage.getStore();
  }

  protected get toolSet() {
    return toolDefinitions
      .filter((def) => def.from === this.constructor.name)
      .reduce<Record<string, Tool>>((acc, def) => {
        acc[def.name] = tool({
          description: def.description,
          inputSchema: def.schema.input,
          outputSchema: def.schema.output,
          needsApproval: def.needsApproval ?? false,
          toModelOutput: def.toModelOutput,
          providerOptions: def.providerOptions,
          execute: <Input>(input: Input, options: ToolExecutionOptions) => {
            const bound = def.method.bind(this);
            return bound(input, options);
          },
        });
        return acc;
      }, {});
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

    return this.asyncLocalStorage.run(initialStatus, () => callback(agent));
  }
}

export function tools<INPUT, OUTPUT = unknown>(options: ToolDecoratorOptions<INPUT, OUTPUT>) {
  const { name, description, schema, needsApproval, toModelOutput, providerOptions } = options;
  return (target: BaseAgentClass<unknown>, propertyKey: string, descriptor: PropertyDescriptor) => {
    if (!(target instanceof BaseAgentClass)) {
      throw new Error("Target must be a subclass of BaseAgentClass");
    }

    const modelName = getModelNameFromClassName(target.constructor.name);
    const methodName = propertyKey;

    const originalMethod = descriptor.value;
    const method = async function (this: BaseAgentClass<unknown>, ...args: unknown[]) {
      this.logger.debug("tools: {model}.{method} with args: {args}", {
        model: modelName,
        method: methodName,
        args,
      });

      return originalMethod.apply(this, args);
    };
    descriptor.value = method;

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
