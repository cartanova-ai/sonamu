import { z } from "zod";

const legacyFixtureOptionsSchema = z.object({
  _: z.array(z.string()).optional(),
  all: z.boolean().optional(),
  include: z.string().optional(),
  exclude: z.string().optional(),
  count: z.union([z.string(), z.number()]).optional(),
  strategy: z.string().optional(),
  limit: z.union([z.string(), z.number()]).optional(),
  saveTo: z.string().optional(),
  useLlm: z.boolean().optional(),
  noCache: z.boolean().optional(),
  "save-to": z.string().optional(),
  "use-llm": z.boolean().optional(),
  "no-cache": z.boolean().optional(),
  nonInteractive: z.boolean().optional(),
  userMode: z.enum(["login", "dummy"]).optional(),
});

type LegacyFixtureOptions = z.infer<typeof legacyFixtureOptionsSchema>;
export type LegacyFixtureSource = z.input<typeof legacyFixtureOptionsSchema>;
export type LegacyFixtureCommand = "gen" | "fetch" | "explore";
export type NormalizedLegacyFixtureOptions = Omit<
  LegacyFixtureOptions,
  "saveTo" | "useLlm" | "noCache"
>;

export function normalizeLegacyFixtureOptions(
  input: LegacyFixtureSource,
): NormalizedLegacyFixtureOptions {
  const { saveTo, useLlm, noCache, ...options } = legacyFixtureOptionsSchema.parse(input);
  return {
    ...options,
    "save-to": saveTo ?? options["save-to"],
    "use-llm": useLlm ?? options["use-llm"],
    "no-cache": noCache ?? options["no-cache"],
  };
}

function hasLegacyFixtureSelector(
  command: LegacyFixtureCommand,
  input: NormalizedLegacyFixtureOptions,
): boolean {
  const hasInclude = input.include !== undefined && input.include.trim().length > 0;
  return command === "explore" ? hasInclude : input.all === true || hasInclude;
}

export function normalizeLegacyFixtureCommandOptions(
  command: LegacyFixtureCommand,
  input: LegacyFixtureSource,
): NormalizedLegacyFixtureOptions {
  const normalized = normalizeLegacyFixtureOptions(input);
  if (normalized.nonInteractive !== true) return normalized;

  if (!hasLegacyFixtureSelector(command, normalized)) {
    throw Object.assign(new Error(`Missing fixture ${command} selector.`), {
      code: "MISSING_ARGUMENT",
      exitCode: 2,
    });
  }

  if (command !== "gen") return normalized;
  return {
    ...normalized,
    count: normalized.count || 5,
    "save-to": normalized["save-to"] || "db",
    "use-llm": normalized["use-llm"] ?? false,
    "no-cache": normalized["no-cache"] ?? false,
    userMode: normalized.userMode ?? "dummy",
  };
}
