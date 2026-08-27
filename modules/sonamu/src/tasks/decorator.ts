import { randomUUID } from "node:crypto";

import {
  type RetryPolicy,
  type SchemaInput,
  type SchemaOutput,
  type StandardSchemaV1,
  type WorkflowSpec,
} from "@sonamu-kit/tasks/internal";
import inflection from "inflection";

import { type Executable } from "../types/types";
import { type WorkflowFunction } from "./workflow-manager";

// 워크플로우의 메타데이터 객체
export interface WorkflowMetadata<RawInput = unknown, Input = unknown, Output = unknown> {
  type: "workflow";
  id: string;
  name: string;
  version: string | null;
  schema: StandardSchemaV1<RawInput, Input> | undefined;
  schedules: {
    name: string;
    expression: string;
    input: Executable<RawInput | undefined>;
  }[];
  fn: WorkflowFunction<Input, Output>;
  retryPolicy?: RetryPolicy;
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
  retryPolicy?: RetryPolicy;
};

// 워크플로우 정의를 위한 데코레이터,
// 이것들은 syncer에서 한번에 load한 다음, WorkflowManager에서 synchronize를 통해 등록됨.
export function workflow<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
  options: DefineWorkflowOptions<Input, Output, TSchema>,
): (
  fn: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>,
) => WorkflowMetadata<SchemaInput<TSchema, Input>, SchemaOutput<TSchema, Input>, Output>;
export function workflow<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
  options: DefineWorkflowOptions<Input, Output, TSchema>,
  fn: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>,
): WorkflowMetadata<SchemaInput<TSchema, Input>, SchemaOutput<TSchema, Input>, Output>;
export function workflow<Input, Output, TSchema extends StandardSchemaV1 | undefined = undefined>(
  options: DefineWorkflowOptions<Input, Output, TSchema>,
  fn?: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>,
):
  | WorkflowMetadata<SchemaInput<TSchema, Input>, SchemaOutput<TSchema, Input>, Output>
  | ((
      fn: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>,
    ) => WorkflowMetadata<SchemaInput<TSchema, Input>, SchemaOutput<TSchema, Input>, Output>) {
  const decorated = (workflowFunction: WorkflowFunction<SchemaOutput<TSchema, Input>, Output>) => {
    const id = randomUUID();
    const workflowName = options.name ?? inflection.underscore(workflowFunction.name);

    const metadata: WorkflowMetadata<
      SchemaInput<TSchema, Input>,
      SchemaOutput<TSchema, Input>,
      Output
    > = {
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
      fn: workflowFunction,
      retryPolicy: options.retryPolicy,
    };

    return metadata;
  };

  if (!fn) {
    return decorated;
  }

  return decorated(fn);
}
