import { z } from "zod";

export const projectionResultSchema = z.map(z.string(), z.unknown());

export const projectionValueSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("deleted") }),
  z.strictObject({ state: z.literal("present"), document: z.unknown() }),
]);

// Only a stable issue code is read, never the validator's message.
export const schemaIssueCodeSchema = z.looseObject({
  code: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
});

export type ProjectionValue = z.output<typeof projectionValueSchema>;
export type PresentProjectionValue = Extract<ProjectionValue, { state: "present" }>;

const pathKeySchema = z.union([
  z.string(),
  z.number().transform(String),
  z.symbol().transform(() => "#symbol"),
]);

export const schemaPathSegmentSchema = z.union([
  pathKeySchema,
  z.looseObject({ key: pathKeySchema }).transform((segment) => segment.key),
]);
