import { access } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { loadConfig } from "../api/config";
import { findApiRootPath } from "../utils/utils";
import { type SonamuCliPlugin } from "./plugin";

const CLI_WORD = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/;
const IDENTIFIER = /^[a-z][a-zA-Z0-9]*$/;

/** A plugin declaration that the CLI refuses, naming the plugin, the command path and the rule. */
export class SonamuCliPluginError extends Error {
  readonly code = "INVALID_CLI_PLUGIN";

  constructor(
    readonly plugin: string,
    readonly command: string | undefined,
    readonly rule: string,
  ) {
    super(`CLI plugin "${plugin}"${command === undefined ? "" : ` command "${command}"`}: ${rule}`);
    this.name = "SonamuCliPluginError";
  }
}

const argumentSchema = z.object({
  name: z.string().regex(IDENTIFIER, { error: "argument names must be camelCase identifiers" }),
  description: z.string().optional(),
  type: z
    .enum(["string", "integer"], { error: "argument type must be string or integer" })
    .optional(),
  required: z.boolean().optional(),
  variadic: z.boolean().optional(),
});

const optionSchema = z
  .object({
    type: z.enum(["string", "integer", "boolean"], {
      error: "option type must be string, integer or boolean",
    }),
    description: z.string().optional(),
    required: z.boolean().optional(),
    multiple: z.boolean().optional(),
    choices: z.array(z.string().min(1)).min(1, { error: "choices must not be empty" }).optional(),
  })
  .superRefine((option, context) => {
    if (
      option.type === "boolean" &&
      (option.required !== undefined || option.multiple !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "required and multiple apply only to string and integer options",
      });
    }
    if (option.type !== "string" && option.choices !== undefined) {
      context.addIssue({ code: "custom", message: "choices apply only to string options" });
    }
  });

const argumentsSchema = z.array(argumentSchema).superRefine((declared, context) => {
  const names = new Set<string>();
  declared.forEach((argument, index) => {
    if (names.has(argument.name)) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: `argument "${argument.name}" is declared twice`,
      });
    }
    names.add(argument.name);
    if (argument.variadic === true && index < declared.length - 1) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "only the last argument may be variadic",
      });
    }
    const followsOptional = declared
      .slice(0, index)
      .some((previous) => previous.required === false);
    if (argument.required !== false && followsOptional) {
      context.addIssue({
        code: "custom",
        path: [index],
        message: "required arguments must come before optional ones",
      });
    }
  });
});

const optionsSchema = z.record(z.string(), optionSchema).superRefine((declared, context) => {
  for (const key of Object.keys(declared)) {
    const flag = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    if (!IDENTIFIER.test(key) || !CLI_WORD.test(flag)) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `option key "${key}" must be a camelCase identifier`,
      });
    }
  }
});

const commandSchema = z.object({
  path: z
    .array(z.string().regex(CLI_WORD, { error: "path words must be lowercase CLI words" }))
    .min(1, { error: "path must have at least one word" }),
  description: z.string().optional(),
  arguments: argumentsSchema.optional(),
  options: optionsSchema.optional(),
  mutation: z.object({ dryRun: z.boolean() }).optional(),
  run: z.instanceof(Function, { error: "run must be a function" }),
});

const pluginSchema = z.object({
  name: z.string().trim().min(1, { error: "plugin name must not be empty" }),
  commands: z.array(commandSchema),
});

const cliConfigSchema = z.object({ plugins: z.array(z.unknown()).optional() }).optional();

// Lenient view of a rejected plugin, used only to name it and its command in the error.
const pluginLabelSchema = z.object({
  name: z.string().min(1).optional().catch(undefined),
  commands: z
    .array(z.object({ path: z.array(z.string()).min(1).optional().catch(undefined) }).catch({}))
    .catch([]),
});
type PluginLabels = z.infer<typeof pluginLabelSchema>;

function commandLabel(labels: PluginLabels, issuePath: readonly PropertyKey[]): string | undefined {
  const commandIndex = z.number().int().safeParse(issuePath[1]);
  if (issuePath[0] !== "commands" || !commandIndex.success) return undefined;
  const path = labels.commands[commandIndex.data]?.path;
  return path === undefined ? `commands[${commandIndex.data}]` : path.join(" ");
}

function issueRule(issue: z.core.$ZodIssue): string {
  const location = issue.path.slice(2).map(String).join(".");
  return location === "" || issue.path[0] !== "commands"
    ? issue.message
    : `${issue.message} (at ${location})`;
}

/** Validates the declarative part of `cli.plugins`; command paths must be unique and prefix-free. */
export function validateCliPlugins(plugins: readonly unknown[]): readonly SonamuCliPlugin[] {
  const declared: { plugin: string; path: readonly string[] }[] = [];
  plugins.forEach((plugin, index) => {
    const parsed = pluginSchema.safeParse(plugin);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const labels = pluginLabelSchema.catch({ commands: [] }).parse(plugin);
      throw new SonamuCliPluginError(
        labels.name ?? `cli.plugins[${index}]`,
        commandLabel(labels, issue.path),
        issueRule(issue),
      );
    }
    for (const command of parsed.data.commands) {
      const words = command.path.join(" ");
      for (const other of declared) {
        const otherWords = other.path.join(" ");
        const shorter = Math.min(other.path.length, command.path.length);
        if (other.path.slice(0, shorter).join(" ") !== command.path.slice(0, shorter).join(" ")) {
          continue;
        }
        const rule =
          otherWords === words
            ? `path is already declared by plugin "${other.plugin}"`
            : `path overlaps "${otherWords}" declared by plugin "${other.plugin}"; a command path must not be a prefix of another`;
        throw new SonamuCliPluginError(parsed.data.name, words, rule);
      }
      declared.push({ plugin: parsed.data.name, path: command.path });
    }
  });
  // SAFETY: every element passed pluginSchema above; the original objects are returned so that `run` keeps its identity.
  return plugins as readonly SonamuCliPlugin[];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function restoreProcessEnv(snapshot: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(snapshot, key)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(snapshot)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/**
 * Returns the validated CLI plugins of the project without initialising Sonamu.
 * A directory without any sonamu.config has no plugins; a project whose config is not built fails.
 */
export async function loadCliPlugins(
  apiRootPath: string = findApiRootPath(),
): Promise<readonly SonamuCliPlugin[]> {
  const builtConfigPath = path.join(apiRootPath, "dist", "sonamu.config.js");
  const [hasBuiltConfig, hasSourceConfig] = await Promise.all([
    fileExists(builtConfigPath),
    fileExists(path.join(apiRootPath, "src", "sonamu.config.ts")),
  ]);
  if (!hasBuiltConfig && !hasSourceConfig) return [];

  // Sonamu.init snapshots process.env before its own loadConfig and derives every environment's
  // DB settings from it, so the dotenv values applied here must not outlive this load.
  const envBeforeLoad = { ...process.env };
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(apiRootPath);
  } catch (error) {
    const moduleNotFound = z.object({ code: z.literal("ERR_MODULE_NOT_FOUND") }).safeParse(error);
    if (!hasBuiltConfig && moduleNotFound.success) {
      throw Object.assign(
        new Error(`${builtConfigPath} not found. Build the project first (sonamu build).`),
        { code: "CONFIG_NOT_BUILT", cause: error },
      );
    }
    throw error;
  } finally {
    restoreProcessEnv(envBeforeLoad);
  }

  const cli = cliConfigSchema.safeParse(config.cli);
  if (!cli.success) {
    throw new SonamuCliPluginError("cli.plugins", undefined, "cli.plugins must be an array");
  }
  return validateCliPlugins(cli.data?.plugins ?? []);
}
