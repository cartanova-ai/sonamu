import * as clack from "@clack/prompts";
import { configure, dispose, type Config } from "@logtape/logtape";
import { prompt as clackParserPrompt } from "@optique/clack";
import {
  argument as optiqueArgument,
  formatMessage,
  message as optiqueMessage,
  parseAsync,
} from "@optique/core";
import { createLoggingConfig, loggingOptions, type LoggingOptionsResult } from "@optique/logtape";
import { zod } from "@optique/zod";
import { z } from "zod";

import { COMMAND_LIFECYCLE_POLICIES } from "./lifecycle.js";
import { createCliOutput, runWithAmbientOutputIsolation, type CliError } from "./output.js";
import {
  createSonamuProgram,
  parseSonamuArgs,
  SONAMU_COMMAND_CANDIDATES,
  SonamuUsageError,
  type ParsedSonamuArgs,
} from "./program.js";
import { type CommandInput, type HandlerResult, type JsonObject } from "./types.js";

export interface PromptResult<T> {
  readonly value?: T;
  readonly cancelled?: boolean;
}

export interface CliPrompt {
  select(request: {
    readonly message: string;
    readonly choices?: readonly string[];
    readonly initial?: string;
  }): Promise<PromptResult<string>>;
  multiselect?(request: {
    readonly message: string;
    readonly choices?: readonly string[];
    readonly initial?: readonly string[];
  }): Promise<PromptResult<readonly string[]>>;
  text(request: {
    readonly message: string;
    readonly initial?: string;
  }): Promise<PromptResult<string>>;
  confirm(request: {
    readonly message: string;
    readonly initial?: boolean;
  }): Promise<PromptResult<boolean>>;
}

export interface CliDiscovery {
  command?(input: string, candidates: readonly string[]): Promise<string | undefined>;
  entity?(
    input: string,
    context: { readonly command: string; readonly candidates?: readonly string[] },
  ): Promise<string | undefined>;
  value?(input: string, candidates: readonly string[]): Promise<string | undefined>;
}

export interface CliInteraction {
  readonly enabled: boolean;
  readonly stdinIsTTY: boolean;
  readonly stdoutIsTTY: boolean;
  readonly prompt: CliPrompt;
  readonly discovery?: CliDiscovery;
}

function canPrompt(interaction: CliInteraction, nonInteractive: boolean): boolean {
  return (
    interaction.enabled && !nonInteractive && interaction.stdinIsTTY && interaction.stdoutIsTTY
  );
}

export interface CliHandlerContext {
  readonly command: string;
  readonly interaction: CliInteraction;
  readonly output: ReturnType<typeof createCliOutput>;
}

export type CliHandler = (
  input: CommandInput,
  context: CliHandlerContext,
) => HandlerResult | Promise<HandlerResult>;
export type CliHandlers = Record<string, CliHandler>;

export interface CliLifecycle {
  init(): void | Promise<void>;
  destroy(): void | Promise<void>;
}

export interface CliCandidateProvider {
  entities(context: { readonly command: string }): Promise<readonly string[]>;
}

export interface RunSonamuCliOptions {
  readonly args?: readonly string[];
  readonly version?: string;
  readonly interaction?: CliInteraction;
  readonly output?: {
    readonly stdout: (chunk: string) => void;
    readonly stderr: (chunk: string) => void;
  };
  readonly exit?: { readonly setExitCode: (exitCode: number) => void };
  readonly lifecycle?: CliLifecycle;
  readonly handlers?: CliHandlers;
  readonly candidateProvider?: CliCandidateProvider;
  readonly defaultCandidateProviderFactory?: () => CliCandidateProvider;
}

export interface RunSonamuCliResult {
  readonly exitCode: number;
  readonly data?: HandlerResult;
  readonly error?: Omit<CliError, "exitCode">;
}

class MetaExit extends Error {
  constructor(readonly exitCode: number) {
    super("Optique meta command completed");
  }
}

interface PromptAnswer {
  readonly value?: string | boolean | readonly string[];
}

interface PromptConfigBase {
  readonly name: "value";
  readonly message: string;
}

type PromptConfig =
  | (PromptConfigBase & { readonly type: "text"; readonly initial?: string })
  | (PromptConfigBase & { readonly type: "confirm"; readonly initial?: boolean })
  | (PromptConfigBase & {
      readonly type: "select" | "multiselect";
      readonly choices: readonly { readonly title: string; readonly value: string }[];
    });
type PromptImplementation = (config: PromptConfig) => Promise<PromptAnswer>;

function fuzzyMatchRank(input: string, candidate: string): number | undefined {
  const normalizedInput = input.toLocaleLowerCase();
  const normalizedCandidate = candidate.toLocaleLowerCase();
  if (normalizedCandidate === normalizedInput) return 0;
  if (normalizedCandidate.startsWith(normalizedInput)) return 1;

  let inputIndex = 0;
  for (const character of normalizedCandidate) {
    if (character === normalizedInput[inputIndex]) inputIndex += 1;
  }
  return inputIndex === normalizedInput.length ? 2 : undefined;
}

function rankFuzzyMatches<T>(
  input: string,
  candidates: readonly T[],
  title: (candidate: T) => string,
): T[] {
  if (input.length === 0) return [...candidates];

  // 정확·접두 일치를 먼저 배치하고 같은 등급에서는 공급자 순서를 유지합니다.
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      rank: fuzzyMatchRank(input, title(candidate)),
    }))
    .filter(
      (match): match is { candidate: T; index: number; rank: number } => match.rank !== undefined,
    )
    .toSorted((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ candidate }) => candidate);
}

export function findFuzzyMatches(input: string, candidates: readonly string[]): readonly string[] {
  return rankFuzzyMatches(input, candidates, (candidate) => candidate);
}

export function createPromptsAdapter(
  options: { readonly promptImpl?: PromptImplementation } = {},
): CliPrompt {
  const promptImpl: PromptImplementation =
    options.promptImpl ??
    (async (config) => {
      const common = { message: config.message };
      const promptValue =
        config.type === "text"
          ? await clack.text({
              ...common,
              initialValue: config.initial,
            })
          : config.type === "confirm"
            ? await clack.confirm({
                ...common,
                initialValue: config.initial,
              })
            : config.type === "multiselect"
              ? await clack.multiselect({
                  ...common,
                  options: (config.choices ?? []).map(({ title: label, value }) => ({
                    label,
                    value,
                  })),
                })
              : await clack.select({
                  ...common,
                  options: (config.choices ?? []).map(({ title: label, value }) => ({
                    label,
                    value,
                  })),
                });
      return clack.isCancel(promptValue) ? {} : { value: promptValue };
    });
  return {
    async select(request: {
      readonly message: string;
      readonly choices?: readonly string[];
      readonly initial?: string;
    }) {
      const { message, choices = [] } = request;
      const search = await promptImpl({
        type: "text",
        name: "value",
        message,
        initial: request.initial,
      });
      if (!Object.hasOwn(search, "value")) return { cancelled: true };
      if (choices.length === 0) return { value: String(search.value) };

      const matches = rankFuzzyMatches(String(search.value), choices, String);
      if (matches.length === 0) return { cancelled: true };
      if (matches.length === 1) return { value: matches[0] };

      const selected = await promptImpl({
        type: "select",
        name: "value",
        message,
        choices: matches.map((value) => ({ title: value, value })),
      });
      const selectedValue = z.string().safeParse(selected.value);
      return selectedValue.success ? { value: selectedValue.data } : { cancelled: true };
    },
    async multiselect(request: {
      readonly message: string;
      readonly choices?: readonly string[];
      readonly initial?: readonly string[];
    }) {
      const { message, choices = [] } = request;
      const answer = await promptImpl({
        type: "multiselect",
        name: "value",
        message,
        choices: choices.map((value) => ({ title: value, value })),
      });
      const selectedValues = z.array(z.string()).safeParse(answer.value);
      return selectedValues.success ? { value: selectedValues.data } : { cancelled: true };
    },
    async text({ message, initial }) {
      const answer = await promptImpl({ type: "text", name: "value", message, initial });
      return Object.hasOwn(answer, "value") ? { value: String(answer.value) } : { cancelled: true };
    },
    async confirm({ message, initial = false }) {
      const answer = await promptImpl({
        type: "confirm",
        name: "value",
        message,
        initial,
      });
      const confirmed = z.boolean().safeParse(answer.value);
      return confirmed.success ? { value: confirmed.data } : { cancelled: true };
    },
  };
}

const defaultInteractions = new WeakSet<CliInteraction>();

export function createDefaultInteraction(
  options: {
    readonly prompt?: CliPrompt;
    readonly stdinIsTTY?: boolean;
    readonly stdoutIsTTY?: boolean;
  } = {},
): CliInteraction {
  const prompt = options.prompt ?? createPromptsAdapter();
  const discover = async (input: string, candidates: readonly string[]) => {
    const selected = await prompt.select({
      message: `Select a value for “${input}”`,
      choices: candidates,
    });
    return selected.cancelled ? undefined : selected.value;
  };
  const interaction: CliInteraction = {
    enabled: true,
    stdinIsTTY: options.stdinIsTTY ?? process.stdin.isTTY,
    stdoutIsTTY: options.stdoutIsTTY ?? process.stdout.isTTY,
    prompt,
    discovery: {
      command: discover,
      value: discover,
      async entity(_input, context) {
        const selected = await prompt.select({
          message: "Entity",
          choices: context.candidates ?? [],
        });
        return selected.cancelled ? undefined : selected.value;
      },
    },
  };
  defaultInteractions.add(interaction);
  return interaction;
}

interface FrameworkModule {
  readonly Sonamu: {
    init(initDatabase: boolean, sync: boolean): Promise<void>;
    destroy(): Promise<void>;
  };
  readonly FixtureManager: { destroy(): Promise<void> };
}

interface CandidateFrameworkModule {
  findApiRootPath?(): string;
  readonly EntityManager: {
    readonly isAutoloaded: boolean;
    autoload(doSilent?: boolean, apiRootPath?: string): Promise<void>;
    getAllParentIds(): readonly string[];
    getAllIds(): readonly string[];
  };
}

const ENTITY_CANDIDATE_LOAD_HINT =
  "Check the Sonamu project configuration and entity metadata files.";
const entityCandidateErrorSchema = z.object({
  code: z.string().optional(),
  hint: z.string().optional(),
});

function entityCandidateLoadError(error: Error): Error {
  const metadata = entityCandidateErrorSchema.parse(error);
  return Object.assign(error, {
    code: metadata.code ?? "ENTITY_CANDIDATE_LOAD_FAILED",
    exitCode: 1,
    hint: metadata.hint ?? ENTITY_CANDIDATE_LOAD_HINT,
  });
}

export function createDefaultCandidateProvider(
  options: {
    readonly loadFramework?: () => Promise<CandidateFrameworkModule>;
  } = {},
): CliCandidateProvider {
  const loadFramework =
    options.loadFramework ??
    (async (): Promise<CandidateFrameworkModule> => {
      const framework = await import("sonamu");
      return {
        EntityManager: framework.EntityManager,
        findApiRootPath: framework.findApiRootPath,
      };
    });
  return {
    async entities() {
      try {
        const framework = await loadFramework();
        const { EntityManager } = framework;
        if (!EntityManager.isAutoloaded) {
          // 전체 Sonamu 초기화 없이 공개 API 루트를 알 수 있을 때 해당 메타데이터만 불러옵니다.
          const apiRootPath = framework.findApiRootPath?.();
          await EntityManager.autoload(true, apiRootPath);
        }

        // 부모 엔티티를 우선 배치하고 전체 목록에서 처음 나타난 순서를 유지합니다.
        return [...new Set([...EntityManager.getAllParentIds(), ...EntityManager.getAllIds()])];
      } catch (error) {
        throw entityCandidateLoadError(
          error instanceof Error
            ? error
            : new Error(`Failed to load entity candidates: ${String(error)}`),
        );
      }
    },
  };
}

export async function createDefaultLifecycle(options: {
  readonly resources: readonly string[];
  readonly loadFramework?: () => Promise<FrameworkModule>;
}): Promise<CliLifecycle> {
  const loadFramework =
    options.loadFramework ??
    (async () => {
      const framework = await import("sonamu");
      return { Sonamu: framework.Sonamu, FixtureManager: framework.FixtureManager };
    });
  const framework = await loadFramework();
  const usesFixture = options.resources.includes("fixture");
  return {
    init: () => framework.Sonamu.init(false, false),
    async destroy() {
      const errors: Error[] = [];
      if (usesFixture) {
        try {
          await framework.FixtureManager.destroy();
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      try {
        await framework.Sonamu.destroy();
      } catch (error) {
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to destroy lifecycle resources");
      }
    },
  };
}

async function defaultHandlers(): Promise<CliHandlers> {
  const registry = await import("./handlers.js");
  return registry.CLI_HANDLERS;
}

async function takeGlobalFlags(args: readonly string[]) {
  let json = false;
  let nonInteractive = false;
  const commandArgs: string[] = [];
  const loggingArgs: string[] = [];
  let passthrough = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") passthrough = true;
    if (passthrough) {
      commandArgs.push(arg);
      continue;
    }
    if (/^-v+$/.test(arg) || arg === "--verbose") loggingArgs.push(arg);
    else if (arg === "--log-output" || arg === "--log-format") {
      loggingArgs.push(arg);
      const value = args[index + 1];
      if (value !== undefined && (!value.startsWith("-") || value === "-")) {
        loggingArgs.push(value);
        index += 1;
      }
    } else if (arg.startsWith("--log-output=") || arg.startsWith("--log-format=")) {
      loggingArgs.push(arg);
    } else if (arg === "--json") json = true;
    else if (arg === "--non-interactive") nonInteractive = true;
    else commandArgs.push(arg);
  }
  const loggingParser = loggingOptions({ level: "verbosity", formatter: "--log-format" });
  const parsedLogging = await parseAsync(loggingParser, loggingArgs);
  if (!parsedLogging.success) {
    throw new SonamuUsageError("INVALID_OPTION_VALUE", formatMessage(parsedLogging.error));
  }
  return {
    commandArgs,
    json,
    nonInteractive,
    logging: parsedLogging.value,
    loggingRequested: loggingArgs.length > 0,
  };
}

interface CliLogTapeOverride {
  readonly config: Config<string, string>;
  applied: boolean;
}

declare global {
  var sonamuKitCliLogTapeOverride: CliLogTapeOverride | undefined;
}

interface CliLoggingSession {
  ensureConfigured(): Promise<void>;
  destroy(): Promise<void>;
}

async function createCliLoggingSession(
  logging: LoggingOptionsResult,
  enabled: boolean,
): Promise<CliLoggingSession | undefined> {
  if (!enabled) return undefined;
  const config = await createLoggingConfig(logging, { stream: "stderr" }, { reset: true });
  const override: CliLogTapeOverride = { config, applied: false };
  globalThis.sonamuKitCliLogTapeOverride = override;
  return {
    async ensureConfigured() {
      if (override.applied) return;
      override.applied = true;
      await configure(config);
    },
    async destroy() {
      globalThis.sonamuKitCliLogTapeOverride = undefined;
      if (override.applied) await dispose();
    },
  };
}

function isMetaCommand(args: readonly string[]): boolean {
  const boundary = args.indexOf("--");
  const metaArgs = boundary === -1 ? args : args.slice(0, boundary);
  return (
    metaArgs.includes("--help") || metaArgs.includes("--version") || metaArgs[0] === "completion"
  );
}

async function renderMeta(
  args: readonly string[],
  version: string,
  stdout: (chunk: string) => void,
  stderr: (chunk: string) => void,
): Promise<number> {
  const { runAsync } = await import("@optique/run");
  const program = createSonamuProgram({ version });
  try {
    await runAsync(
      { parser: program.parser, metadata: { name: "sonamu", version } },
      {
        args,
        help: "both",
        version,
        completion: "command",
        errorExitCode: 2,
        colors: false,
        stdout: (text) => stdout(text.endsWith("\n") ? text : `${text}\n`),
        stderr: (text) => stderr(text.endsWith("\n") ? text : `${text}\n`),
        onExit: (exitCode): never => {
          throw new MetaExit(exitCode);
        },
      },
    );
    return 0;
  } catch (error) {
    if (error instanceof MetaExit) return error.exitCode;
    throw error;
  }
}

function usageError(code: string, message: string, hint?: string): CliError {
  return { code, message, hint, exitCode: 2 };
}

const SENSITIVE_DETAIL_KEY = /authorization|cookie|password|secret|token|api[-_]?key/i;
const commandErrorSchema = z.object({
  code: z.string().optional(),
  hint: z.string().optional(),
  exitCode: z.number().int().optional(),
  details: z.record(z.string(), z.json()).optional().catch(undefined),
  result: z.json().optional().catch(undefined),
  runId: z.string().optional(),
  id: z.string().optional(),
});

function normalizeError(error: Error): CliError {
  if (error instanceof SonamuUsageError) {
    return { code: error.code, message: error.message, hint: error.hint, exitCode: 2 };
  }

  const metadata = commandErrorSchema.parse(error);
  const detailObject: JsonObject = {};

  if (metadata.details !== undefined) {
    for (const [key, value] of Object.entries(metadata.details)) {
      if (!SENSITIVE_DETAIL_KEY.test(key)) detailObject[key] = value;
    }
  }
  if (metadata.result !== undefined) detailObject.result = metadata.result;
  const runId = metadata.runId ?? metadata.id;
  if (runId !== undefined) detailObject.runId = runId;

  const normalized: CliError = {
    code: metadata.code ?? "COMMAND_FAILED",
    message: error.message,
    hint: metadata.hint,
    exitCode: metadata.exitCode ?? (metadata.code === "CANCELLED" ? 130 : 1),
  };
  if (Object.keys(detailObject).length > 0) normalized.details = detailObject;
  return normalized;
}
function replaceDiscoveredCommand(args: string[], selected: string, mismatchDepth: number): void {
  const selectedTokens = selected.split(" ");
  let consumed = mismatchDepth + 1;
  // 선택한 경로의 이미 맞는 뒷부분까지 소비해 중복 명령을 만들지 않습니다.
  while (consumed < selectedTokens.length && args[consumed] === selectedTokens[consumed]) {
    consumed += 1;
  }
  args.splice(0, consumed, ...selectedTokens);
}

function nestedCommandDiscovery(
  args: readonly string[],
  candidatePaths: readonly (readonly string[])[],
):
  | {
      readonly input: string;
      readonly candidates: readonly string[];
      readonly mismatchDepth: number;
    }
  | undefined {
  let matchingPaths = candidatePaths.filter(([topLevel]) => topLevel === args[0]);
  for (let depth = 1; matchingPaths.length > 0; depth += 1) {
    const token = args[depth];
    const childPaths = matchingPaths.filter((path) => path.length > depth);
    if (childPaths.length === 0) return undefined;
    const exactPaths = childPaths.filter((path) => path[depth] === token);
    if (exactPaths.length > 0) {
      matchingPaths = exactPaths;
      continue;
    }

    if (matchingPaths.some((path) => path.length === depth)) return undefined;

    const childNames = [...new Set(childPaths.map((path) => path[depth]))];
    const isFuzzyCorrection =
      token !== undefined &&
      !token.startsWith("-") &&
      findFuzzyMatches(token, childNames).length > 0;
    if (isFuzzyCorrection) {
      return {
        input: args.slice(0, depth + 1).join(" "),
        candidates: SONAMU_COMMAND_CANDIDATES,
        mismatchDepth: depth,
      };
    }

    // 알 수 없는 토큰은 빠진 하위 명령 뒤의 인자로 보고 선택 후에도 보존합니다.
    return {
      input: args.slice(0, depth).join(" "),
      candidates: childPaths.map((path) => path.join(" ")),
      mismatchDepth: depth - 1,
    };
  }
  return undefined;
}

async function applyDiscovery(
  rawArgs: readonly string[],
  interaction: CliInteraction,
  nonInteractive: boolean,
): Promise<string[]> {
  const args = [...rawArgs];
  const discovery = interaction.discovery;
  if (
    nonInteractive ||
    !interaction.enabled ||
    !interaction.stdinIsTTY ||
    !interaction.stdoutIsTTY ||
    !discovery
  ) {
    return args;
  }

  const candidatePaths = SONAMU_COMMAND_CANDIDATES.map((candidate) => candidate.split(" "));
  const topLevelCommands = new Set(candidatePaths.map(([topLevel]) => topLevel));

  if ((args.length === 0 || !topLevelCommands.has(args[0])) && discovery.command) {
    const input = args[0] ?? "";
    const command = await discovery.command(input, SONAMU_COMMAND_CANDIDATES);
    if (command === undefined && args.length === 0) {
      throw Object.assign(new Error("Cancelled."), { code: "CANCELLED", exitCode: 130 });
    }
    if (command !== undefined) {
      replaceDiscoveredCommand(args, command, 0);
    }
  }

  if (args.length > 0 && topLevelCommands.has(args[0]) && discovery.command) {
    const nested = nestedCommandDiscovery(args, candidatePaths);
    if (nested !== undefined) {
      const command = await discovery.command(nested.input, nested.candidates);
      if (command !== undefined) {
        replaceDiscoveredCommand(args, command, nested.mismatchDepth);
      }
    }
  }

  const valueChoices = {
    "--strategy": ["recent", "sample", "random"],
    "--locale": ["ko", "en"],
  } as const;
  for (const [option, choices] of Object.entries(valueChoices)) {
    const optionIndex = args.findIndex(
      (value) => value === option || value.startsWith(`${option}=`),
    );
    if (optionIndex < 0 || !discovery.value) continue;
    const token = args[optionIndex];
    const input = token.includes("=") ? token.slice(token.indexOf("=") + 1) : args[optionIndex + 1];
    if (input === undefined || choices.some((choice) => choice === input)) continue;
    const replacement = await discovery.value(input, choices);
    if (replacement === undefined) continue;
    if (token.includes("=")) args[optionIndex] = `${option}=${replacement}`;
    else args[optionIndex + 1] = replacement;
  }
  return args;
}

const MIGRATION_TARGETS = ["development", "staging", "production", "fixture", "test"] as const;
const migrationTargetSchema = z.enum(MIGRATION_TARGETS);

async function validatePromptedMigrationTarget(value: string): Promise<string> {
  const parser = clackParserPrompt(
    optiqueArgument(
      zod(migrationTargetSchema, {
        metavar: "TARGET",
        placeholder: "development",
        errors: { zodError: optiqueMessage`[INVALID_ARGUMENT]` },
      }),
    ),
    {
      type: "select",
      message: "Migration target",
      options: MIGRATION_TARGETS,
      prompter: async () => value,
    },
  );
  const parsed = await parseAsync(parser, []);
  if (!parsed.success) {
    throw new SonamuUsageError("INVALID_ARGUMENT", formatMessage(parsed.error));
  }
  return parsed.value;
}

function hasMigrationTarget(args: readonly string[]): boolean {
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--force-reason") index += 1;
    else if (
      argument !== "--execute" &&
      argument !== "--confirm" &&
      !argument.startsWith("--force-reason=") &&
      !argument.startsWith("-")
    ) {
      return true;
    }
  }
  return false;
}

async function fillMigrationTargets(
  args: string[],
  interaction: CliInteraction,
  nonInteractive: boolean,
): Promise<CliError | undefined> {
  if (args[0] !== "migrate" || args[1] !== "apply" || hasMigrationTarget(args)) return undefined;

  if (!canPrompt(interaction, nonInteractive) || interaction.prompt.multiselect === undefined) {
    return usageError(
      "MISSING_ARGUMENT",
      "Missing migration target.",
      "Provide at least one migration target or enable interaction in a TTY.",
    );
  }

  const selected = await interaction.prompt.multiselect({
    message: "Migration targets",
    choices: MIGRATION_TARGETS,
  });
  if (selected.cancelled) {
    return { code: "CANCELLED", message: "Cancelled.", exitCode: 130 };
  }
  if (selected.value === undefined || selected.value.length === 0) {
    return usageError("MISSING_ARGUMENT", "Select at least one migration target.");
  }
  const targets = await Promise.all(selected.value.map(validatePromptedMigrationTarget));
  args.splice(2, 0, ...targets);
  return undefined;
}

async function fillInteractiveArgument(
  args: string[],
  interaction: CliInteraction,
  nonInteractive: boolean,
  candidateProvider?: CliCandidateProvider,
): Promise<{ args?: string[]; error?: CliError }> {
  const migrationError = await fillMigrationTargets(args, interaction, nonInteractive);
  if (migrationError !== undefined) return { error: migrationError };

  const command = entityCommand(args);
  if (command === undefined) return { args };

  // fixture import에서 첫 위치의 숫자는 엔티티가 아니라 보존해야 할 record ID입니다.
  const fixtureImportMissingEntity = command === "fixture.import" && /^\d+$/.test(args[2] ?? "");
  const entityId = fixtureImportMissingEntity ? undefined : args[2];

  const promptEnabled = canPrompt(interaction, nonInteractive);
  if (entityId === undefined && !promptEnabled) {
    return {
      error: usageError(
        "MISSING_ARGUMENT",
        "Missing entity argument.",
        "Provide an entity argument or enable interaction in a TTY.",
      ),
    };
  }

  if (candidateProvider !== undefined) {
    const candidates = await candidateProvider.entities({ command });
    if (entityId !== undefined && (candidates.includes(entityId) || entityId === "all")) {
      return { args };
    }
    if (promptEnabled && interaction.discovery?.entity) {
      const selected = await interaction.discovery.entity(entityId ?? "", { command, candidates });
      if (selected !== undefined) {
        if (fixtureImportMissingEntity) args.splice(2, 0, selected);
        else if (entityId === undefined) args.push(selected);
        else args[2] = selected;
        return { args };
      }
      if (entityId === undefined) {
        return { error: { code: "CANCELLED", message: "Cancelled.", exitCode: 130 } };
      }
    }
    return { args };
  }

  if (entityId !== undefined) return { args };
  const selected = await interaction.prompt.select({ message: "Entity" });
  if (selected.cancelled || selected.value === undefined) {
    return { error: { code: "CANCELLED", message: "Cancelled.", exitCode: 130 } };
  }
  args.push(selected.value);
  return { args };
}

function entityCommand(args: readonly string[]): string | undefined {
  const command = `${args[0] ?? ""}.${args[1] ?? ""}`;
  return new Set([
    "entity.show",
    "fixture.import",
    "scaffold.model",
    "scaffold.model_test",
    "scaffold.view_list",
    "scaffold.view_form",
    "cone.gen",
  ]).has(command)
    ? command
    : undefined;
}

async function refineParsedEntity(
  parsed: ParsedSonamuArgs,
  interaction: CliInteraction,
  nonInteractive: boolean,
): Promise<ParsedSonamuArgs> {
  const entityId = parsed.arguments.entityId;
  const canDiscover = canPrompt(interaction, nonInteractive);
  const parsedEntityId = z.string().safeParse(entityId);
  if (!canDiscover || !parsedEntityId.success || !interaction.discovery?.entity) return parsed;
  const discovered = await interaction.discovery.entity(parsedEntityId.data, {
    command: parsed.command,
  });
  if (discovered === undefined) return parsed;
  return { ...parsed, arguments: { ...parsed.arguments, entityId: discovered } };
}

function commandInput(parsed: ParsedSonamuArgs): CommandInput {
  return { ...parsed.arguments, ...parsed.options, passthrough: parsed.passthrough };
}

function validateParsedInput(parsed: ParsedSonamuArgs): void {
  const include = z.string().safeParse(parsed.options.include);
  if (parsed.command === "fixture.explore" && include.success && include.data.includes(",")) {
    throw new SonamuUsageError(
      "INVALID_OPTION_VALUE",
      "fixture explore accepts a single --include entity.",
      "Provide one entity without commas.",
    );
  }
}

function isAsyncIterable(value: HandlerResult): value is AsyncIterable<object> {
  return value instanceof Object && Symbol.asyncIterator in value;
}

function lifecycleResources(command: string): readonly string[] {
  const policies: Readonly<Record<string, { readonly resources: readonly string[] }>> =
    COMMAND_LIFECYCLE_POLICIES;
  return policies[command]?.resources ?? [];
}

const MUTATION_COMMANDS = new Set([
  "entity.apply",
  "fixture.init",
  "fixture.import",
  "fixture.sync",
  "fixture.gen",
  "fixture.fetch",
  "scaffold.batch",
  "migrate.run",
  "migrate.apply",
  "migrate.shadow",
  "migrate.rollback",
  "i18n.import",
  "i18n.create",
  "i18n.update",
  "i18n.delete",
  "task.pause",
  "task.resume",
  "task.cancel",
  "cdd.rule.add",
  "cdd.ac",
]);

// dry-run 입력을 실제 변경 승인 경계에서 제외할 수 있는 명령만 명시적으로 관리합니다.
const SAFE_DRY_RUN_COMMANDS = new Set([
  "entity.apply",
  "fixture.fetch",
  "scaffold.batch",
  "migrate.run",
  "migrate.shadow",
  "migrate.rollback",
  "fixture.fetch",
  "i18n.import",
  "i18n.create",
  "i18n.update",
  "i18n.delete",
  "task.pause",
  "task.resume",
  "task.cancel",
  "cdd.rule.add",
  "cdd.ac",
]);

const JSON_UNSUPPORTED_COMMANDS = new Set(["dev.all", "dev.api", "dev.web", "start"]);
const NON_INTERACTIVE_INPUT_COMMANDS = new Set(["fixture.gen", "fixture.fetch", "fixture.explore"]);

function hasMutationApproval(parsed: ParsedSonamuArgs): boolean {
  const execute = parsed.options.execute === true;
  const confirmed = parsed.options.confirm === true;
  return execute && confirmed;
}

function productionMigrationNeedsReason(parsed: ParsedSonamuArgs): boolean {
  if (parsed.command !== "migrate.apply" && parsed.command !== "migrate.rollback") return false;
  if (parsed.options.execute !== true) return false;
  const targets = z
    .array(z.string())
    .safeParse(
      parsed.command === "migrate.apply" ? parsed.arguments.targets : [parsed.arguments.target],
    );
  if (!targets.success || !targets.data.includes("production")) return false;
  const reason = z.string().safeParse(parsed.options.forceReason);
  return !reason.success || reason.data.trim() === "";
}

function requiresMutationApproval(parsed: ParsedSonamuArgs): boolean {
  if (
    SAFE_DRY_RUN_COMMANDS.has(parsed.command) &&
    parsed.options.dryRun === true &&
    parsed.options.execute === false
  ) {
    return false;
  }
  if (MUTATION_COMMANDS.has(parsed.command)) return true;
  return false;
}

export async function runSonamuCli(options: RunSonamuCliOptions = {}): Promise<RunSonamuCliResult> {
  const args = options.args ?? process.argv.slice(2);
  const version = options.version ?? "0.1.0";
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const destination = options.output ?? {
    stdout: (chunk: string) => stdoutWrite(chunk),
    stderr: (chunk: string) => stderrWrite(chunk),
  };
  const setExitCode =
    options.exit?.setExitCode ?? ((exitCode: number) => (process.exitCode = exitCode));

  if (isMetaCommand(args)) {
    const exitCode = await renderMeta(args, version, destination.stdout, destination.stderr);
    setExitCode(exitCode);
    return { exitCode };
  }

  let globals: Awaited<ReturnType<typeof takeGlobalFlags>>;
  try {
    globals = await takeGlobalFlags(args);
  } catch (error) {
    const normalized = normalizeError(error instanceof Error ? error : new Error(String(error)));
    const output = createCliOutput({
      mode: args.includes("--json") ? "json" : "human",
      ...destination,
    });
    output.error(args[0] ?? "sonamu", normalized);
    setExitCode(normalized.exitCode);
    return { exitCode: normalized.exitCode, error: normalized };
  }
  const output = createCliOutput({
    mode: globals.json ? "json" : "human",
    stdout: destination.stdout,
    stderr: destination.stderr,
  });
  const baseInteraction = options.interaction ?? createDefaultInteraction();
  const usesDefaultInteraction = defaultInteractions.has(baseInteraction);
  const interaction: CliInteraction = {
    ...baseInteraction,
    enabled:
      baseInteraction.enabled &&
      !globals.nonInteractive &&
      baseInteraction.stdinIsTTY &&
      baseInteraction.stdoutIsTTY,
  };
  const commandForError = globals.commandArgs[0] ?? "sonamu";

  let parsed: ParsedSonamuArgs;
  try {
    if (
      globals.commandArgs.length === 0 &&
      (globals.nonInteractive ||
        !interaction.enabled ||
        !interaction.stdinIsTTY ||
        !interaction.stdoutIsTTY ||
        !interaction.discovery?.command)
    ) {
      throw new SonamuUsageError(
        "UNKNOWN_COMMAND",
        "No command was provided.",
        "Provide a command or run sonamu --help.",
      );
    }
    const discoveredArgs = await applyDiscovery(
      globals.commandArgs,
      interaction,
      globals.nonInteractive,
    );
    const usesInteractiveEntityDiscovery =
      entityCommand(discoveredArgs) !== undefined &&
      interaction.discovery?.entity !== undefined &&
      (options.defaultCandidateProviderFactory !== undefined || usesDefaultInteraction) &&
      canPrompt(interaction, globals.nonInteractive);
    const candidateProvider =
      options.candidateProvider ??
      (usesInteractiveEntityDiscovery
        ? (options.defaultCandidateProviderFactory ?? createDefaultCandidateProvider)()
        : undefined);
    const filled = await fillInteractiveArgument(
      discoveredArgs,
      interaction,
      globals.nonInteractive,
      candidateProvider,
    );
    if (filled.error) throw Object.assign(new Error(filled.error.message), filled.error);
    parsed = await parseSonamuArgs(createSonamuProgram({ version }), filled.args ?? discoveredArgs);
    if (candidateProvider === undefined) {
      parsed = await refineParsedEntity(parsed, interaction, globals.nonInteractive);
    }
    validateParsedInput(parsed);
  } catch (error) {
    const normalized = normalizeError(error instanceof Error ? error : new Error(String(error)));
    output.error(commandForError, normalized);
    setExitCode(normalized.exitCode);
    return { exitCode: normalized.exitCode, error: normalized };
  }

  if (globals.json && JSON_UNSUPPORTED_COMMANDS.has(parsed.command)) {
    const error = {
      code: "JSON_UNSUPPORTED",
      message: `JSON output is not supported for ${parsed.command}.`,
      exitCode: 2,
    } satisfies CliError;
    output.error(parsed.command, error);
    setExitCode(error.exitCode);
    return { exitCode: error.exitCode, error };
  }

  const canConfirmInteractively = canPrompt(interaction, globals.nonInteractive);
  const mutationRequiresApproval = requiresMutationApproval(parsed);
  if (
    mutationRequiresApproval &&
    (productionMigrationNeedsReason(parsed) ||
      (!canConfirmInteractively && !hasMutationApproval(parsed)))
  ) {
    const error = {
      code: "CONFIRMATION_REQUIRED",
      message: `Confirmation is required for ${parsed.command}.`,
      exitCode: 3,
    } satisfies CliError;
    output.error(parsed.command, error);
    setExitCode(error.exitCode);
    return { exitCode: error.exitCode, error };
  }

  if (mutationRequiresApproval && canConfirmInteractively && parsed.options.confirm !== true) {
    const confirmation = await interaction.prompt.confirm({
      message: `Run ${parsed.command}?`,
      initial: false,
    });
    if (confirmation.cancelled || confirmation.value !== true) {
      const error = { code: "CANCELLED", message: "Cancelled.", exitCode: 130 } satisfies CliError;
      output.error(parsed.command, error);
      setExitCode(error.exitCode);
      return { exitCode: error.exitCode, error };
    }
  }

  try {
    const resources = lifecycleResources(parsed.command);
    const execution = await runWithAmbientOutputIsolation(globals.json, async () => {
      const loggingSession = await createCliLoggingSession(
        globals.logging,
        globals.loggingRequested,
      );
      try {
        const lifecycle =
          resources.length > 0
            ? (options.lifecycle ?? (await createDefaultLifecycle({ resources })))
            : undefined;
        let outcome:
          | { readonly ok: true; readonly data: HandlerResult; readonly exitCode: number }
          | { readonly ok: false; readonly error: Error };

        try {
          if (lifecycle !== undefined) {
            await lifecycle.init();
          }
          await loggingSession?.ensureConfigured();

          // 지연 tooling 로딩도 Sonamu 초기화 이후, 해제 이전에만 수행합니다.
          const handlers = options.handlers ?? (await defaultHandlers());
          const handler = handlers[parsed.command];
          if (handler === undefined) {
            throw Object.assign(new Error(`No handler is registered for ${parsed.command}.`), {
              code: "HANDLER_NOT_FOUND",
            });
          }

          const input = commandInput(parsed);
          if (!interaction.enabled && NON_INTERACTIVE_INPUT_COMMANDS.has(parsed.command)) {
            input.nonInteractive = true;
          }
          const data = await handler(input, {
            command: parsed.command,
            interaction,
            output,
          });
          let exitCode = 0;
          if (isAsyncIterable(data)) {
            for await (const event of data) output.event(event);
          } else {
            const childResult = z.object({ exitCode: z.number().int() }).safeParse(data);
            exitCode = childResult.success ? childResult.data.exitCode : 0;
            if (exitCode !== 0) {
              throw Object.assign(new Error(`Child process exited with code ${exitCode}.`), {
                code: "CHILD_PROCESS_FAILED",
                exitCode,
              });
            }
          }
          outcome = { ok: true, data, exitCode };
        } catch (error) {
          outcome = {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }

        if (lifecycle !== undefined) {
          try {
            await lifecycle.destroy();
          } catch (cleanupError) {
            if (outcome.ok) {
              outcome = {
                ok: false,
                error:
                  cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
              };
            } else {
              const primaryError = outcome.error;
              const primaryMessage =
                primaryError instanceof Error ? primaryError.message : String(primaryError);
              const cleanupMessage =
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
              outcome = {
                ok: false,
                error: Object.assign(new Error(`${primaryMessage}; ${cleanupMessage}`), {
                  code: "LIFECYCLE_FAILED",
                  details: {
                    errors: [
                      { phase: "init-or-command", message: primaryMessage },
                      { phase: "destroy", message: cleanupMessage },
                    ],
                  },
                }),
              };
            }
          }
        }

        if (!outcome.ok) throw outcome.error;
        return outcome;
      } finally {
        await loggingSession?.destroy();
      }
    });

    if (!isAsyncIterable(execution.data)) {
      output.success(parsed.command, execution.data, []);
    }
    setExitCode(execution.exitCode);
    return { exitCode: execution.exitCode, data: execution.data };
  } catch (error) {
    const normalized = normalizeError(error instanceof Error ? error : new Error(String(error)));
    output.error(parsed.command, normalized);
    setExitCode(normalized.exitCode);
    return { exitCode: normalized.exitCode, error: normalized };
  }
}
