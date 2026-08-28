export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonObject | readonly JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type CommandInput = Record<string, JsonValue | undefined>;
export type CommandResult = object | JsonScalar | void;
export type HandlerResult = CommandResult | AsyncIterable<object>;
