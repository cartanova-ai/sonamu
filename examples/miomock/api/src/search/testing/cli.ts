import { execFile } from "node:child_process";
import path from "node:path";

import { inject } from "vitest";
import { z } from "zod";

/*
  Runs `sonamu search ...` through the real CLI entry as a separate process, asynchronously, so the test process's
  worker keeps running. VITEST=true makes the CLI read src/sonamu.config.ts through the TypeScript loader instead of a
  dist build that may be stale.
*/

const CLI_ENTRY = path.join(process.cwd(), "node_modules/@sonamu-kit/cli/bin/sonamu.js");

/** The CLI's approval for a mutation command without a terminal. */
export const APPROVE = ["--execute", "--confirm"] as const;

const eventLineSchema = z.object({ event: z.string(), data: z.unknown() });
const successSchema = z.object({ ok: z.literal(true), data: z.unknown() });
const failureSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    hint: z.string().optional(),
    details: z
      .looseObject({ reason: z.string().optional(), retryable: z.boolean().optional() })
      .optional(),
  }),
});

export type CliResult = {
  exitCode: number;
  /** Lines a streaming command emitted. */
  events: z.infer<typeof eventLineSchema>[];
  /** What an object-returning command returned. */
  data: unknown;
  failure: z.infer<typeof failureSchema>["error"] | undefined;
  outputTail: string;
};

const jsonLineSchema = z.string().transform((line, context) => {
  try {
    return z.json().parse(JSON.parse(line));
  } catch {
    context.addIssue({ code: "custom", message: "not a JSON line" });
    return z.NEVER;
  }
});

export async function runCli(
  args: readonly string[],
  options: { databaseName?: string } = {},
): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    OPENSEARCH_URL: inject("opensearchUrl"),
    VITEST: "true",
  };
  if (options.databaseName !== undefined) {
    env.SONAMU_DB_NAME = options.databaseName;
  }
  const { exitCode, stdout, stderr } = await new Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    execFile(
      process.execPath,
      [CLI_ENTRY, "search", ...args, "--json", "--non-interactive"],
      { cwd: process.cwd(), env, maxBuffer: 16 * 1024 * 1024 },
      (error, out, err) => {
        // A non-numeric code (killed by a signal) counts as failure.
        const code = z.number().int().safeParse(error?.code);
        resolve({
          exitCode: error === null ? 0 : code.success ? code.data : 1,
          stdout: out,
          stderr: err,
        });
      },
    );
  });
  const result: CliResult = {
    exitCode,
    events: [],
    data: undefined,
    failure: undefined,
    outputTail: `${stdout.slice(-2_000)}\n${stderr.slice(-2_000)}`,
  };
  for (const line of stdout.split("\n")) {
    const parsed = jsonLineSchema.safeParse(line);
    if (!parsed.success) {
      continue;
    }
    const value = parsed.data;
    const success = successSchema.safeParse(value);
    const failure = failureSchema.safeParse(value);
    const event = eventLineSchema.safeParse(value);
    if (success.success) {
      result.data = success.data.data;
    } else if (failure.success) {
      result.failure = failure.data.error;
    } else if (event.success) {
      result.events.push(event.data);
    }
  }
  return result;
}

export function lastEvent<Schema extends z.ZodType>(
  result: CliResult,
  event: string,
  schema: Schema,
): z.output<Schema> {
  return schema.parse(result.events.findLast((line) => line.event === event)?.data);
}
