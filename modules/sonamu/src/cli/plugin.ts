/** A positional argument of a plugin command, in declaration order. */
export interface SonamuCliArgument {
  /** camelCase key under `input.arguments`. */
  readonly name: string;
  readonly description?: string;
  /** Defaults to "string". */
  readonly type?: "string" | "integer";
  /** Defaults to true. Optional arguments must come after required ones. */
  readonly required?: boolean;
  /** Only the last argument may be variadic; its value is an array, or undefined when none is given. */
  readonly variadic?: boolean;
}

/** An option of a plugin command. The camelCase key `maxRounds` is the flag `--max-rounds`. */
export interface SonamuCliOption {
  readonly type: "string" | "integer" | "boolean";
  readonly description?: string;
  /** string and integer only. */
  readonly required?: boolean;
  /** string and integer only: the flag may repeat; the value is an array, or undefined when absent. */
  readonly multiple?: boolean;
  /** string only. */
  readonly choices?: readonly string[];
}

export type SonamuCliArgumentValue = string | number | readonly string[] | readonly number[];
export type SonamuCliOptionValue = SonamuCliArgumentValue | boolean;

export interface SonamuCliCommandInput {
  readonly arguments: Readonly<Record<string, SonamuCliArgumentValue | undefined>>;
  readonly options: Readonly<Record<string, SonamuCliOptionValue | undefined>>;
  /** True only for a `mutation.dryRun` command invoked without `--execute`. */
  readonly dryRun: boolean;
}

export interface SonamuCliCommandContext {
  /** Dotted command id, for example "search.inspect". */
  readonly command: string;
  /** True when the caller asked for JSON output. */
  readonly json: boolean;
  /** True when the CLI may prompt on a terminal. */
  readonly interactive: boolean;
}

export type SonamuCliCommandResult =
  | object
  | string
  | number
  | boolean
  | null
  | void
  | AsyncIterable<object>;

export interface SonamuCliCommand {
  /** Command words after `sonamu`, for example ["search", "inspect"]. */
  readonly path: readonly [string, ...string[]];
  readonly description?: string;
  readonly arguments?: readonly SonamuCliArgument[];
  readonly options?: Readonly<Record<string, SonamuCliOption>>;
  /**
   * Present when the command changes state. It then passes the same approval boundary as built-in
   * mutation commands (`--execute --confirm`, or a prompt on a terminal). With `dryRun: true` the
   * command also runs unapproved without `--execute`, with `input.dryRun` set, and must change
   * nothing in that mode.
   */
  readonly mutation?: { readonly dryRun: boolean };
  /** Runs after `Sonamu.init`. An object result is printed; an async iterable is streamed as events. */
  run(
    input: SonamuCliCommandInput,
    context: SonamuCliCommandContext,
  ): SonamuCliCommandResult | Promise<SonamuCliCommandResult>;
}

/** Commands contributed to the `sonamu` CLI through `cli.plugins` in sonamu.config.ts. */
export interface SonamuCliPlugin {
  readonly name: string;
  readonly commands: readonly SonamuCliCommand[];
}

export function defineCliPlugin(plugin: SonamuCliPlugin): SonamuCliPlugin {
  return plugin;
}
