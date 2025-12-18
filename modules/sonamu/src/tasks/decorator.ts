import { randomUUID } from "node:crypto";
import type {
  SchemaInput,
  SchemaOutput,
  StandardSchemaV1,
  WorkflowSpec,
} from "@sonamu-kit/tasks/internal";
import inflection from "inflection";
import type { Executable } from "../types/types";
import type { WorkflowFunction } from "./workflow-manager";

// 워크플로우의 메타데이터 객체
export interface WorkflowMetadata {
  type: "workflow";
  id: string;
  name: string;
  version: string | null;
  schema: StandardSchemaV1<unknown, unknown> | undefined;
  schedules: {
    name: string;
    expression: string;
    input: Executable<SchemaInput<unknown, unknown> | undefined>;
  }[];
  fn: WorkflowFunction<unknown, unknown>;
}

// 워크플로우 정의 과정에서의 옵션
export type DefineWorkflowOptions<
  Input,
  Output,
  TSchema extends StandardSchemaV1 | undefined = undefined,
> = Omit<
  WorkflowSpec<SchemaOutput<TSchema, Input>, Output, SchemaInput<TSchema, Input>>,
  "name"
> & {
  name?: string;
  schedules?: {
    name?: string;
    expression: string;
    input?: Executable<SchemaInput<TSchema, Input> | undefined>;
  }[];
};

// 워크플로우 정의를 위한 데코레이터,
// 이것들은 syncer에서 한번에 load한 다음, WorkflowManager에서 synchronize를 통해 등록됨.
export function workflow<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
  options: DefineWorkflowOptions<Input, Output, TSchema>,
) {
  return (fn: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>) => {
    const id = randomUUID();
    const workflowName = options.name ?? inflection.underscore(fn.name);

    const decorated: WorkflowMetadata = {
      type: "workflow" as const,
      id,
      name: workflowName,
      schema: options.schema,
      version: options.version ?? null,
      schedules: (options.schedules ?? []).map((schedule) => {
        return {
          name: schedule.name ?? `${workflowName}[${schedule.expression}]`,
          expression: schedule.expression,
          input: schedule.input,
        };
      }),
      fn: fn as WorkflowFunction<unknown, unknown>,
    };

    return decorated;
  };
}
