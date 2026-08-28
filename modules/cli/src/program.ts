import {
  argument,
  choice,
  command,
  constant,
  flag,
  formatMessage,
  integer,
  map,
  message,
  multiple,
  object,
  option,
  optional,
  or,
  parseSync,
  passThrough,
  string,
  suggestSync,
  withDefault,
  type Parser,
  type ValueParser,
} from "@optique/core";

export type SonamuCommandArguments = Record<
  string,
  string | number | readonly string[] | readonly number[]
>;
export type SonamuCommandOptions = Record<
  string,
  string | number | boolean | readonly string[] | Readonly<Record<string, string>> | undefined
>;

export interface ParsedSonamuArgs {
  readonly command: string;
  readonly arguments: SonamuCommandArguments;
  readonly options: SonamuCommandOptions;
  readonly passthrough: readonly string[];
}

export interface SonamuProgram {
  readonly version: string;
  readonly parser: Parser<"sync", ParsedSonamuArgs, unknown>;
}

export type SonamuUsageErrorCode =
  | "UNKNOWN_COMMAND"
  | "UNKNOWN_OPTION"
  | "INVALID_ARGUMENT"
  | "INVALID_OPTION_VALUE";

export class SonamuUsageError extends Error {
  readonly exitCode = 2;

  constructor(
    readonly code: SonamuUsageErrorCode,
    errorMessage: string,
    readonly hint?: string,
  ) {
    super(errorMessage);
    this.name = "SonamuUsageError";
  }
}

const FIXTURE_STRATEGIES = ["sample", "ids", "query", "file", "recent", "random"] as const;
const MIGRATION_TARGETS = ["development", "staging", "production", "fixture", "test"] as const;
const SHADOW_MIGRATION_TARGETS = ["fixture", "test"] as const;
const CONE_LOCALES = ["ko", "en", "ja"] as const;
const AUTH_PLUGINS = [
  "2fa",
  "admin",
  "anonymous",
  "api-key",
  "audit-log",
  "jwt",
  "organization",
  "passkey",
  "phone-number",
  "sso",
  "username",
] as const;
const SCAFFOLD_TEMPLATES = [
  "model",
  "model_test",
  "view_list",
  "view_form",
  "view_search_input",
] as const;
const MIGRATION_ACTIONS = ["apply", "rollback"] as const;
const I18N_FORMATS = ["workbook", "json"] as const;

// 문법에서 사용자가 선택할 수 있는 대표 명령 경로를 한곳에서 관리합니다.
export const SONAMU_COMMAND_CANDIDATES = [
  "sync",
  "build",
  "dev",
  "start",
  "test",
  "entity list",
  "entity show",
  "entity search",
  "entity apply",
  "fixture init",
  "fixture import",
  "fixture sync",
  "fixture gen",
  "fixture fetch",
  "fixture explore",
  "migrate run",
  "migrate apply",
  "migrate generate",
  "migrate status",
  "migrate connections",
  "migrate code",
  "migrate preview",
  "migrate shadow",
  "migrate rollback",
  "stub entity",
  "scaffold model",
  "scaffold model_test",
  "scaffold view_list",
  "scaffold view_form",
  "scaffold status",
  "scaffold preview",
  "scaffold batch",
  "cone gen",
  "build all",
  "build api",
  "build web",
  "dev all",
  "dev api",
  "dev web",
  "auth generate",
  "auth add-companions",
  "i18n list",
  "i18n check",
  "i18n import",
  "i18n export",
  "i18n create",
  "i18n update",
  "i18n delete",
  "task definitions",
  "task list",
  "task show",
  "task steps",
  "task watch",
  "task pause",
  "task resume",
  "task cancel",
  "cdd tree",
  "cdd read",
  "cdd rules",
  "cdd rule show",
  "cdd rule add",
  "cdd ac",
] as const;

const unknownOption = (invalidOption: string, suggestions: readonly string[]) =>
  message`[UNKNOWN_OPTION] ${invalidOption} ${suggestions.join(",")}`;
const optionErrors = {
  invalidValue: message`[INVALID_OPTION_VALUE]`,
  noMatch: unknownOption,
} as const;
const flagErrors = { noMatch: unknownOption } as const;
const argumentErrors = { invalidValue: message`[INVALID_ARGUMENT]` } as const;

function result(
  commandName: string,
  arguments_: SonamuCommandArguments = {},
  options: SonamuCommandOptions = {},
  passthrough: readonly string[] = [],
): ParsedSonamuArgs {
  return { command: commandName, arguments: arguments_, options, passthrough };
}

function leaf(commandName: string): Parser<"sync", ParsedSonamuArgs, unknown> {
  return map(constant(null), () => result(commandName));
}

function commaSeparated(): ValueParser<"sync", readonly string[]> {
  return {
    mode: "sync",
    metavar: "VALUES",
    placeholder: ["User", "Post"],
    parse(input) {
      const values = input
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      return values.length > 0
        ? { success: true, value: values }
        : { success: false, error: message`Value must not be empty.` };
    },
    format(value) {
      return value.join(",");
    },
  };
}

function localizedValue(): ValueParser<"sync", readonly [string, string]> {
  return {
    mode: "sync",
    metavar: "LOCALE=VALUE",
    placeholder: ["ko", "이름"],
    parse(input) {
      const separator = input.indexOf("=");
      if (separator < 1) return { success: false, error: message`Expected LOCALE=VALUE.` };
      return { success: true, value: [input.slice(0, separator), input.slice(separator + 1)] };
    },
    format([locale, value]) {
      return `${locale}=${value}`;
    },
  };
}

function scaffoldTemplates(): ValueParser<"sync", readonly string[]> {
  const values = commaSeparated();
  return {
    ...values,
    parse(input) {
      const parsed = values.parse(input);
      if (!parsed.success) return parsed;
      const supported = new Set<string>(SCAFFOLD_TEMPLATES);
      return parsed.value.every((template) => supported.has(template))
        ? parsed
        : { success: false, error: message`Unsupported scaffold template.` };
    },
  };
}

function mutationMode() {
  return withDefault(
    or(
      map(flag("--dry-run", { errors: flagErrors }), () => ({ dryRun: true, execute: false })),
      map(flag("--execute", { errors: flagErrors }), () => ({ dryRun: false, execute: true })),
    ),
    { dryRun: true, execute: false },
  );
}

function branch(
  name: string,
  parser: Parser<"sync", ParsedSonamuArgs, unknown>,
): Parser<"sync", ParsedSonamuArgs, unknown> {
  return command(name, parser, {
    errors: {
      notMatched: (_expected, actual) => message`Unknown command: ${actual ?? ""}`,
    },
  });
}

function alternatives(
  parsers: readonly [
    Parser<"sync", ParsedSonamuArgs, unknown>,
    Parser<"sync", ParsedSonamuArgs, unknown>,
    ...Parser<"sync", ParsedSonamuArgs, unknown>[],
  ],
): Parser<"sync", ParsedSonamuArgs, unknown> {
  const [first, second, ...rest] = parsers;
  return rest.reduce<Parser<"sync", ParsedSonamuArgs, unknown>>(
    (combined, parser) => or(combined, parser),
    or(first, second),
  );
}

function entityParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const entityArgument = (commandName: string, key: string) =>
    map(argument(string(), { errors: argumentErrors }), (value) =>
      result(commandName, { [key]: value }),
    );
  const patch = () =>
    map(
      object(
        {
          file: option("--file", string(), { errors: optionErrors }),
          mode: mutationMode(),
          confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
        },
        { errors: { unexpectedInput: message`[INVALID_OPTION_VALUE]` } },
      ),
      ({ file, mode, ...options }) => result("entity.apply", {}, { file, ...mode, ...options }),
    );

  return branch(
    "entity",
    alternatives([
      branch("list", leaf("entity.list")),
      branch("show", entityArgument("entity.show", "entityId")),
      branch("search", entityArgument("entity.search", "query")),
      branch("apply", patch()),
    ]),
  );
}

function fixtureParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const fixtureImport = map(
    object({
      entityId: argument(string({ metavar: "ENTITY" }), { errors: argumentErrors }),
      recordIds: multiple(argument(integer({ metavar: "ID" }), { errors: argumentErrors }), {
        min: 1,
      }),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ entityId, recordIds, mode, ...options }) =>
      result("fixture.import", { entityId, recordIds }, { ...mode, ...options }),
  );
  const fixtureMutation = (commandName: "fixture.init" | "fixture.sync") =>
    map(
      object({
        mode: mutationMode(),
        confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
      }),
      ({ mode, ...options }) => result(commandName, {}, { ...mode, ...options }),
    );
  const fixtureGen = map(
    object({
      all: withDefault(flag("--all", { errors: flagErrors }), false),
      include: optional(option("--include", string(), { errors: optionErrors })),
      exclude: optional(option("--exclude", string(), { errors: optionErrors })),
      count: optional(option("--count", integer({ min: 1 }), { errors: optionErrors })),
      saveTo: optional(option("--save-to", string(), { errors: optionErrors })),
      useLlm: withDefault(flag("--use-llm", { errors: flagErrors }), false),
      noCache: withDefault(flag("--no-cache", { errors: flagErrors }), false),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ mode, ...options }) => result("fixture.gen", {}, { ...mode, ...options }),
  );
  const fixtureFetch = map(
    object({
      entityId: optional(argument(string({ metavar: "ENTITY" }), { errors: argumentErrors })),
      all: withDefault(flag("--all", { errors: flagErrors }), false),
      include: optional(option("--include", string(), { errors: optionErrors })),
      exclude: optional(option("--exclude", string(), { errors: optionErrors })),
      source: optional(option("--source", choice(MIGRATION_TARGETS), { errors: optionErrors })),
      target: optional(option("--target", choice(MIGRATION_TARGETS), { errors: optionErrors })),
      field: optional(option("--field", string(), { errors: optionErrors })),
      values: multiple(option("--value", commaSeparated(), { errors: optionErrors })),
      relations: optional(
        option("--relation", choice(["include", "exclude", "none"] as const), {
          errors: optionErrors,
        }),
      ),
      depth: optional(option("--depth", integer({ min: 0 }), { errors: optionErrors })),
      strategy: withDefault(
        option("--strategy", choice(FIXTURE_STRATEGIES), { errors: optionErrors }),
        "recent",
      ),
      limit: withDefault(option("--limit", integer({ min: 1 }), { errors: optionErrors }), 10),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ entityId, values, mode, ...options }) => {
      return result("fixture.fetch", entityId === undefined ? {} : { entityId }, {
        ...options,
        ...mode,
        values: values.flat(),
      });
    },
  );
  const fixtureExplore = map(
    object({
      all: withDefault(flag("--all", { errors: flagErrors }), false),
      include: optional(option("--include", string(), { errors: optionErrors })),
      exclude: optional(option("--exclude", string(), { errors: optionErrors })),
      strategy: withDefault(
        option("--strategy", choice(FIXTURE_STRATEGIES), { errors: optionErrors }),
        "sample",
      ),
      limit: withDefault(option("--limit", integer({ min: 1 }), { errors: optionErrors }), 10),
    }),
    (options) => result("fixture.explore", {}, options),
  );

  return branch(
    "fixture",
    alternatives([
      branch("init", fixtureMutation("fixture.init")),
      branch("import", fixtureImport),
      branch("sync", fixtureMutation("fixture.sync")),
      branch("gen", fixtureGen),
      branch("fetch", fixtureFetch),
      branch("explore", fixtureExplore),
    ]),
  );
}

function migrateParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const run = map(
    object({
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ mode, ...options }) => result("migrate.run", {}, { ...mode, ...options }),
  );
  const apply = map(
    object({
      targets: multiple(argument(choice(MIGRATION_TARGETS), { errors: argumentErrors }), {
        min: 1,
      }),
      execute: withDefault(flag("--execute", { errors: flagErrors }), false),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
      forceReason: optional(option("--force-reason", string(), { errors: optionErrors })),
    }),
    ({ targets, ...options }) => result("migrate.apply", { targets }, options),
  );
  const target = (commandName: string) =>
    map(argument(choice(MIGRATION_TARGETS), { errors: argumentErrors }), (migrationTarget) =>
      result(commandName, { target: migrationTarget }),
    );
  const preview = map(
    object({
      target: argument(choice(MIGRATION_TARGETS), { errors: argumentErrors }),
      action: optional(option("--action", choice(MIGRATION_ACTIONS), { errors: optionErrors })),
    }),
    ({ target: migrationTarget, ...options }) =>
      result("migrate.preview", { target: migrationTarget }, options),
  );
  const rollback = map(
    object({
      target: argument(choice(MIGRATION_TARGETS), { errors: argumentErrors }),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
      forceReason: optional(option("--force-reason", string(), { errors: optionErrors })),
    }),
    ({ target: migrationTarget, mode, ...options }) =>
      result("migrate.rollback", { target: migrationTarget }, { ...mode, ...options }),
  );
  const shadow = map(
    object({
      target: argument(choice(SHADOW_MIGRATION_TARGETS), { errors: argumentErrors }),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ target: migrationTarget, mode, ...options }) =>
      result("migrate.shadow", { target: migrationTarget }, { ...mode, ...options }),
  );
  return branch(
    "migrate",
    alternatives([
      branch("run", run),
      branch("apply", apply),
      branch("generate", leaf("migrate.generate")),
      branch("status", leaf("migrate.status")),
      branch("connections", leaf("migrate.connections")),
      branch("code", target("migrate.code")),
      branch("preview", preview),
      branch("shadow", shadow),
      branch("rollback", rollback),
    ]),
  );
}

function stubParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const entity = map(
    object({
      name: argument(string(), { errors: argumentErrors }),
      ai: withDefault(flag("--ai", { errors: flagErrors }), false),
      noCones: withDefault(flag("--no-cones", { errors: flagErrors }), false),
    }),
    ({ name, ...options }) => result("stub.entity", { name }, options),
  );
  return branch("stub", branch("entity", entity));
}

function scaffoldParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const scaffold = (commandName: string) =>
    map(argument(string(), { errors: argumentErrors }), (entityId) =>
      result(`scaffold.${commandName}`, { entityId }),
    );
  const selection = (commandName: "scaffold.status" | "scaffold.preview" | "scaffold.batch") =>
    map(
      object({
        entities: multiple(option("--entity", commaSeparated(), { errors: optionErrors }), {
          min: 1,
        }),
        templates: multiple(option("--template", scaffoldTemplates(), { errors: optionErrors }), {
          min: 1,
        }),
        overwrite: withDefault(flag("--overwrite", { errors: flagErrors }), false),
      }),
      ({ entities, templates, ...options }) =>
        result(
          commandName,
          {},
          { entities: entities.flat(), templates: templates.flat(), ...options },
        ),
    );
  const batch = map(
    object({
      entities: multiple(option("--entity", commaSeparated(), { errors: optionErrors }), {
        min: 1,
      }),
      templates: multiple(option("--template", scaffoldTemplates(), { errors: optionErrors }), {
        min: 1,
      }),
      overwrite: withDefault(flag("--overwrite", { errors: flagErrors }), false),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ entities, templates, mode, ...options }) =>
      result(
        "scaffold.batch",
        {},
        { entities: entities.flat(), templates: templates.flat(), ...mode, ...options },
      ),
  );
  return branch(
    "scaffold",
    alternatives([
      branch("model", scaffold("model")),
      branch("model_test", scaffold("model_test")),
      branch("view_list", scaffold("view_list")),
      branch("view_form", scaffold("view_form")),
      branch("status", selection("scaffold.status")),
      branch("preview", selection("scaffold.preview")),
      branch("batch", batch),
    ]),
  );
}

function coneParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  return branch(
    "cone",
    branch(
      "gen",
      map(
        object({
          entityId: argument(string(), { errors: argumentErrors }),
          all: withDefault(flag("--all", { errors: flagErrors }), false),
          regenerate: withDefault(flag("--regenerate", { errors: flagErrors }), false),
          locale: optional(option("--locale", choice(CONE_LOCALES), { errors: optionErrors })),
        }),
        ({ entityId, ...options }) => result("cone.gen", { entityId }, options),
      ),
    ),
  );
}

function targetParser(parent: "build" | "dev"): Parser<"sync", ParsedSonamuArgs, unknown> {
  const all = branch("all", leaf(`${parent}.all`));
  const api = branch("api", leaf(`${parent}.api`));
  let web: Parser<"sync", ParsedSonamuArgs, unknown>;
  if (parent === "dev") {
    web = branch(
      "web",
      map(passThrough({ format: "greedy" }), (tokens) => {
        const passthrough = tokens[0] === "--" ? tokens.slice(1) : tokens;
        return result("dev.web", {}, {}, passthrough);
      }),
    );
  } else {
    web = branch("web", leaf("build.web"));
  }
  return branch(parent, withDefault(alternatives([all, api, web]), result(`${parent}.all`)));
}

function testParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const run = map(
    object({
      files: multiple(argument(string(), { errors: argumentErrors })),
      pattern: optional(option("-p", "--pattern", string(), { errors: optionErrors })),
      traces: withDefault(flag("-t", "--traces", { errors: flagErrors }), false),
      status: withDefault(flag("-s", "--status", { errors: flagErrors }), false),
    }),
    ({ files, status, ...options }) =>
      result(status ? "test.status" : "test.run", { files }, { ...options, status }),
  );
  return branch(
    "test",
    withDefault(
      run,
      result("test.run", { files: [] }, { pattern: undefined, traces: false, status: false }),
    ),
  );
}

function i18nParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const transfer = (commandName: "i18n.import" | "i18n.export") =>
    map(
      object({
        format: option("--format", choice(I18N_FORMATS), { errors: optionErrors }),
        file: option("--file", string(), { errors: optionErrors }),
        locale: optional(option("--locale", string(), { errors: optionErrors })),
      }),
      (options) => result(commandName, {}, options),
    );
  const importTerms = map(
    object({
      format: option("--format", choice(I18N_FORMATS), { errors: optionErrors }),
      file: option("--file", string(), { errors: optionErrors }),
      locale: optional(option("--locale", string(), { errors: optionErrors })),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ mode, ...options }) => result("i18n.import", {}, { ...mode, ...options }),
  );
  const write = (commandName: "i18n.create" | "i18n.update") =>
    map(
      object({
        key: argument(string(), { errors: argumentErrors }),
        values: multiple(option("--value", localizedValue(), { errors: optionErrors }), { min: 1 }),
        mode: mutationMode(),
        confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
      }),
      ({ key, values, mode, ...options }) =>
        result(commandName, { key }, { values: Object.fromEntries(values), ...mode, ...options }),
    );
  const remove = map(
    object({
      key: argument(string(), { errors: argumentErrors }),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ key, mode, ...options }) => result("i18n.delete", { key }, { ...mode, ...options }),
  );

  return branch(
    "i18n",
    alternatives([
      branch(
        "list",
        map(
          object({ locale: optional(option("--locale", string(), { errors: optionErrors })) }),
          (options) => result("i18n.list", {}, options),
        ),
      ),
      branch("check", leaf("i18n.check")),
      branch("import", importTerms),
      branch("export", transfer("i18n.export")),
      branch("create", write("i18n.create")),
      branch("update", write("i18n.update")),
      branch("delete", remove),
    ]),
  );
}

function taskParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const runArgument = (commandName: string) =>
    map(argument(string(), { errors: argumentErrors }), (runId) => result(commandName, { runId }));
  const mutate = (commandName: string) =>
    map(
      object({
        runId: argument(string(), { errors: argumentErrors }),
        mode: mutationMode(),
        confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
      }),
      ({ runId, mode, ...options }) => result(commandName, { runId }, { ...mode, ...options }),
    );
  return branch(
    "task",
    alternatives([
      branch("definitions", leaf("task.definitions")),
      branch("list", leaf("task.list")),
      branch("show", runArgument("task.show")),
      branch("steps", runArgument("task.steps")),
      branch("watch", runArgument("task.watch")),
      branch("pause", mutate("task.pause")),
      branch("resume", mutate("task.resume")),
      branch("cancel", mutate("task.cancel")),
    ]),
  );
}

function cddParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const addRule = map(
    object({
      ruleKey: option("--rule-key", string(), { errors: optionErrors }),
      id: option("--id", string(), { errors: optionErrors }),
      when: option("--when", string(), { errors: optionErrors }),
      text: option("--text", string(), { errors: optionErrors }),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ mode, ...options }) => result("cdd.rule.add", {}, { ...mode, ...options }),
  );
  const acceptanceCriterion = map(
    object({
      document: option("--document", string(), { errors: optionErrors }),
      text: option("--text", string(), { errors: optionErrors }),
      mode: mutationMode(),
      confirm: withDefault(flag("--confirm", { errors: flagErrors }), false),
    }),
    ({ mode, ...options }) => result("cdd.ac", {}, { ...mode, ...options }),
  );
  return branch(
    "cdd",
    alternatives([
      branch("tree", leaf("cdd.tree")),
      branch(
        "read",
        map(argument(string(), { errors: argumentErrors }), (path) => result("cdd.read", { path })),
      ),
      branch("rules", leaf("cdd.rules")),
      branch(
        "rule",
        alternatives([
          branch(
            "show",
            map(argument(string(), { errors: argumentErrors }), (ruleId) =>
              result("cdd.rule.show", { ruleId }),
            ),
          ),
          branch("add", addRule),
        ]),
      ),
      branch("ac", acceptanceCriterion),
    ]),
  );
}

function authParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const generate = map(
    object({
      plugins: optional(option("--plugins", pluginList(), { errors: optionErrors })),
    }),
    (options) => result("auth.generate", {}, options),
  );
  return branch(
    "auth",
    alternatives([
      branch("generate", generate),
      branch("add-companions", leaf("auth.add-companions")),
    ]),
  );
}

function pluginList(): ValueParser<"sync", string> {
  return {
    mode: "sync",
    metavar: "PLUGINS",
    placeholder: "audit-log,api-key",
    parse(input) {
      const plugins = input.split(",").map((plugin) => plugin.trim());
      const supportedPlugins = new Set<string>(AUTH_PLUGINS);
      const valid = plugins.every((plugin) => supportedPlugins.has(plugin));
      return valid
        ? { success: true, value: plugins.join(",") }
        : { success: false, error: message`Unsupported auth plugin.` };
    },
    format(value) {
      return value;
    },
  };
}

function rootParser(): Parser<"sync", ParsedSonamuArgs, unknown> {
  const sync = map(
    object({ force: withDefault(flag("--force", { errors: flagErrors }), false) }),
    (options) => result("sync", {}, options),
  );
  return alternatives([
    entityParser(),
    fixtureParser(),
    migrateParser(),
    stubParser(),
    scaffoldParser(),
    coneParser(),
    targetParser("build"),
    targetParser("dev"),
    branch("sync", sync),
    branch("start", leaf("start")),
    i18nParser(),
    taskParser(),
    testParser(),
    cddParser(),
    authParser(),
  ]);
}

export function createSonamuProgram(options: { readonly version: string }): SonamuProgram {
  return { version: options.version, parser: rootParser() };
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[right.length];
}

function optionHint(
  program: SonamuProgram,
  args: readonly string[],
  invalidOption: string,
): string | undefined {
  if (args.length === 0) return undefined;
  const completionArgs: [string, ...string[]] =
    args.length === 1 ? ["--"] : [args[0], ...args.slice(1, -1), "--"];
  const closest = suggestSync(program.parser, completionArgs)
    .flatMap((suggestion) => (suggestion.kind === "literal" ? [suggestion.text] : []))
    .filter((suggestion) => suggestion.startsWith("-"))
    .toSorted(
      (left, right) => editDistance(invalidOption, left) - editDistance(invalidOption, right),
    )[0];
  return closest ? `Did you mean ${closest}?` : undefined;
}

function classifyError(
  program: SonamuProgram,
  args: readonly string[],
  formatted: string,
): SonamuUsageError {
  const marker = formatted.match(/\[(UNKNOWN_OPTION|INVALID_ARGUMENT|INVALID_OPTION_VALUE)\]/)?.[1];
  if (marker === "UNKNOWN_OPTION") {
    const optionNames = formatted.match(/--?[\w-]+/g) ?? [];
    const hint = optionNames.length > 1 ? `Did you mean ${optionNames[1]}?` : undefined;
    return new SonamuUsageError("UNKNOWN_OPTION", formatted, hint);
  }
  if (marker === "INVALID_OPTION_VALUE") {
    return new SonamuUsageError("INVALID_OPTION_VALUE", formatted);
  }
  if (marker === "INVALID_ARGUMENT") return new SonamuUsageError("INVALID_ARGUMENT", formatted);
  if (/cannot be used together|mutually exclusive/i.test(formatted)) {
    return new SonamuUsageError("INVALID_OPTION_VALUE", formatted);
  }
  const unexpected = formatted.match(/Unexpected option or subcommand: `([^`]+)`/)?.[1];
  if (unexpected?.startsWith("-")) {
    return new SonamuUsageError("UNKNOWN_OPTION", formatted, optionHint(program, args, unexpected));
  }
  return new SonamuUsageError("UNKNOWN_COMMAND", formatted);
}

export function parseSonamuArgs(program: SonamuProgram, args: readonly string[]): ParsedSonamuArgs {
  // 제거된 test watch 경로를 test.run의 위치 인자로 다시 해석하지 않습니다.
  if (args[0] === "test" && args[1] === "watch") {
    throw new SonamuUsageError("UNKNOWN_COMMAND", "Unknown command: watch");
  }
  const parsed = parseSync(program.parser, args);
  if (!parsed.success) throw classifyError(program, args, formatMessage(parsed.error));
  return parsed.value;
}
