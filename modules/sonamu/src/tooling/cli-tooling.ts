import { z } from "zod";

import { type FixtureCommandOptions } from "../bin/fixture";

const jsonValueSchema = z.json();
type CommandValue = z.infer<typeof jsonValueSchema> | undefined;
type CommandInput = Record<string, CommandValue>;
type ToolingResult = object | string | number | boolean | null | void | AsyncIterable<object>;
type ToolingOperation = (input: CommandInput) => ToolingResult | Promise<ToolingResult>;
type ToolingGroup = Record<string, ToolingOperation>;
export type CliToolingOperations = Record<string, ToolingGroup>;

type MigrationTarget = "development" | "staging" | "production" | "fixture" | "test";

const MIGRATION_TARGETS = new Set<string>([
  "development",
  "staging",
  "production",
  "fixture",
  "test",
]);

function assertMigrationTarget(target: string): asserts target is MigrationTarget {
  // DB 상태를 조회하거나 변경하기 전에 모든 외부 대상을 검증합니다.
  if (MIGRATION_TARGETS.has(target)) return;
  throw Object.assign(new Error(`Unsupported migration target: ${target}`), {
    code: "INVALID_MIGRATION_TARGET",
    exitCode: 2,
  });
}

function assertShadowMigrationTarget(
  target: MigrationTarget,
): asserts target is Extract<MigrationTarget, "fixture" | "test"> {
  if (target === "fixture" || target === "test") return;

  // Shadow DB는 운영 계열 연결에 접근하기 전에 허용 대상을 제한합니다.
  throw Object.assign(new Error(`Invalid shadow migration target: ${target}`), {
    code: "INVALID_SHADOW_MIGRATION_TARGET",
    target,
    exitCode: 2,
  });
}

async function migrationPlan(
  target: MigrationTarget,
  migrations: string[],
  action: "apply" | "rollback" = "apply",
) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify({ action, target, migrations })),
  );
  return {
    kind: "migration-plan" as const,
    action,
    target,
    migrations,
    fingerprint: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

const REQUIRED_METHODS = {
  core: ["sync"],
  entity: ["list", "show", "search", "applyPatch", "create", "cones"],
  scaffold: ["model", "model_test", "view_list", "view_form", "status", "preview", "batch"],
  migration: ["run", "generate", "status", "connections", "code", "preview", "shadow", "rollback"],
  fixture: ["init", "import", "sync", "gen", "fetch", "explore"],
  build: ["all", "api", "web"],
  test: ["run", "status"],
  auth: ["generate", "addCompanions"],
  i18n: ["list", "check", "import", "export", "create", "update", "remove"],
  task: ["definitions", "runs", "show", "steps", "watch", "pause", "resume", "cancel"],
  cdd: ["tree", "read", "rules", "showRule", "addRule", "addAcceptanceCriterion"],
} as const;

let initialization: Promise<void> | undefined;

async function ensureSonamu(): Promise<void> {
  const { Sonamu } = await import("../api/sonamu");
  if (Sonamu.isInitialized) return;
  initialization ??= Sonamu.init(true, false);
  await initialization;
}

async function syncOperation(input: CommandInput): Promise<ToolingResult> {
  await ensureSonamu();
  const { Sonamu } = await import("../api/sonamu");
  return input.force === true ? Sonamu.syncer.forceSync() : Sonamu.syncer.sync();
}

function text(input: CommandInput, key: string): string | undefined {
  const value = z.string().safeParse(input[key]);
  return value.success ? value.data : undefined;
}

function strings(input: CommandInput, key: string): string[] {
  const value = z.array(z.string()).safeParse(input[key]);
  return value.success ? value.data : [];
}

function requiredText(input: CommandInput, key: string): string {
  const value = text(input, key);
  if (value !== undefined && value.length > 0) return value;
  throw Object.assign(new Error(`Missing ${key}.`), { code: "MISSING_ARGUMENT", exitCode: 2 });
}

function parseJson<Schema extends z.ZodType>(
  contents: string,
  code: string,
  schema: Schema,
): z.infer<Schema> {
  try {
    return schema.parse(JSON.parse(contents));
  } catch (cause) {
    throw Object.assign(new Error("Invalid JSON input."), { code, exitCode: 2, cause });
  }
}

function mutationRequested(input: CommandInput): boolean {
  return input.execute === true || input.dryRun === false;
}

function explicitlyDryRun(input: CommandInput): boolean {
  return input.dryRun === true || input.execute === false;
}

const entityPatchSchema = z.object({
  entityId: z.string().min(1),
  operations: z.array(
    z.object({
      op: z.literal("add"),
      path: z.literal("/props/-"),
      value: z
        .object({ name: z.string().min(1), type: z.string().min(1) })
        .catchall(jsonValueSchema),
    }),
  ),
});
const i18nEntriesSchema = z.array(
  z.object({ key: z.string(), values: z.record(z.string(), z.string()) }),
);
const dictionaryValuesSchema = z.record(z.string(), z.string());
const dictionarySourceSchema = z.enum(["entity", "project", "sonamu"]);

async function entityOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  await ensureSonamu();
  const { EntityManager } = await import("../entity/entity-manager");
  const entities = EntityManager.getAllEntities();

  if (method === "list") return entities.map((entity) => entity.toJson());
  if (method === "show") {
    const entityId = requiredText(input, "entityId");
    return EntityManager.exists(entityId) ? EntityManager.get(entityId).toJson() : undefined;
  }
  if (method === "search") {
    const query = requiredText(input, "query").toLocaleLowerCase();
    return entities
      .map((entity) => entity.toJson())
      .filter((entity) => JSON.stringify(entity).toLocaleLowerCase().includes(query));
  }
  if (method === "create") {
    const entityId = requiredText(input, "name");
    const { Sonamu } = await import("../api/sonamu");
    await Sonamu.syncer.createEntity({ entityId, title: entityId });
    if (input.noCones === true) return { entityId, cones: "skipped" };
    const entity = EntityManager.get(entityId);
    if (input.ai === true) {
      const selectedLocale = z.enum(["ko", "en", "ja"]).catch("ko").parse(input.locale);
      return entity.generateCones({
        preserveExisting: false,
        onlyEmpty: false,
        locale: selectedLocale,
      });
    }
    await entity.generateTemplateCones();
    return { entityId, cones: "template" };
  }
  if (method === "cones") {
    const entityId = requiredText(input, "entityId");
    const entities =
      input.all === true || entityId === "all"
        ? EntityManager.getAllEntities()
        : EntityManager.exists(entityId)
          ? [EntityManager.get(entityId)]
          : [];
    if (entities.length === 0) {
      throw Object.assign(new Error(`Entity not found: ${entityId}`), {
        code: "ENTITY_NOT_FOUND",
      });
    }
    const regenerate = input.regenerate === true;
    const selectedLocale = z.enum(["ko", "en", "ja"]).catch("ko").parse(input.locale);
    return Promise.all(
      entities.map(async (entity) => ({
        entityId: entity.id,
        ...(await entity.generateCones({
          preserveExisting: !regenerate,
          onlyEmpty: !regenerate,
          locale: selectedLocale,
        })),
      })),
    );
  }

  const file = requiredText(input, "file");
  const { readFile } = await import("node:fs/promises");
  const contents =
    file === "-"
      ? await (async () => {
          const chunks = [];
          for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
          return Buffer.concat(chunks).toString("utf8");
        })()
      : await readFile(file, "utf8");
  const patch = parseJson(contents, "INVALID_ENTITY_PATCH", entityPatchSchema);
  if (!EntityManager.exists(patch.entityId)) {
    throw Object.assign(new Error(`Entity not found: ${patch.entityId}`), {
      code: "ENTITY_NOT_FOUND",
    });
  }
  const target = EntityManager.get(patch.entityId);
  const before = target.toJson();
  const after = structuredClone(before);
  // SAFETY: entityPatchSchema validates the required Entity prop fields and JSON-compatible extras.
  after.props = [
    ...after.props,
    ...patch.operations.map(({ value }) => structuredClone(value)),
  ] as typeof after.props;
  if (mutationRequested(input)) {
    // SAFETY: after.props originates from the current entity plus schema-validated prop additions.
    target.props = after.props as typeof target.props;
    await target.save();
  }
  return { changed: patch.operations.length > 0, before, after };
}

async function renderScaffolds(input: CommandInput) {
  await ensureSonamu();
  const { renderTemplate } = await import("../syncer/code-generator");
  const entities = strings(input, "entities");
  const templates = strings(input, "templates");
  const rendered = [];
  for (const entityId of entities) {
    for (const template of templates) {
      const templateKey = z.enum(["model", "model_test", "view_list", "view_form"]).parse(template);
      const files = await renderTemplate(templateKey, { entityId });
      rendered.push({ entityId, template: templateKey, files });
    }
  }
  return rendered;
}

async function scaffoldOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  const directTemplate = z
    .enum(["model", "model_test", "view_list", "view_form"])
    .safeParse(method);
  if (directTemplate.success) {
    await ensureSonamu();
    const { Sonamu } = await import("../api/sonamu");
    const entityId = requiredText(input, "entityId");
    return directTemplate.data === "view_list"
      ? Sonamu.syncer.generateTemplate("view_list", { entityId, extra: input.extra })
      : Sonamu.syncer.generateTemplate(directTemplate.data, { entityId });
  }
  const rendered = await renderScaffolds(input);
  const { access } = await import("node:fs/promises");
  const path = await import("node:path");
  const { Sonamu } = await import("../api/sonamu");
  const items = await Promise.all(
    rendered.flatMap(({ entityId, template, files }) =>
      files.map(async (file) => {
        const target = path.default.join(
          Sonamu.appRootPath,
          file.path.replace("/:target/", "/web/"),
        );
        let exists = true;
        try {
          await access(target);
        } catch {
          exists = false;
        }
        return { entityId, template, target, exists, content: file.code };
      }),
    ),
  );
  if (method === "status") return items.map(({ content: _content, ...item }) => item);
  if (method === "preview" || (method === "batch" && explicitlyDryRun(input))) return items;

  const results = [];
  for (const item of items) {
    const { content: _content, ...summary } = item;
    if (item.exists && input.overwrite !== true) {
      results.push({ ...summary, status: "skipped" });
      continue;
    }
    await Sonamu.syncer.generateTemplate(
      item.template,
      { entityId: item.entityId },
      { overwrite: input.overwrite === true },
    );
    results.push({ ...summary, status: "written" });
  }
  return { items: results };
}

async function migrationOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  let shadowTarget: Extract<MigrationTarget, "fixture" | "test"> | undefined;
  if (method === "shadow") {
    const requestedTarget = requiredText(input, "target");
    assertMigrationTarget(requestedTarget);
    assertShadowMigrationTarget(requestedTarget);
    shadowTarget = requestedTarget;
  }

  await ensureSonamu();
  const { Migrator } = await import("../migration/migrator");
  const migrator = new Migrator();
  if (method === "status") return migrator.getStatus();
  if (method === "generate") {
    const status = await migrator.getStatus();
    if (!status.conns.some((connection) => connection.status === 0)) {
      throw Object.assign(new Error("Pending migrations must be applied before generation."), {
        code: "MIGRATION_NOT_READY",
      });
    }
    return { count: await migrator.generatePreparedCodes() };
  }
  if (method === "run") {
    if (!mutationRequested(input)) return { dryRun: true };
    const { getSonamuEnvironment } = await import("../env");
    const environment = getSonamuEnvironment();
    return migrator.apply(environment === "test" ? ["test", "fixture"] : [environment]);
  }
  if (method === "connections") return migrator.getConnections();
  if (method === "apply") {
    const rawTargets = strings(input, "targets");
    if (rawTargets.length === 0) {
      throw Object.assign(new Error("Missing targets."), { code: "MISSING_ARGUMENT", exitCode: 2 });
    }
    const targets = rawTargets.map((target) => {
      assertMigrationTarget(target);
      return target;
    });
    if (mutationRequested(input)) return migrator.apply(targets);
    return Promise.all(
      targets.map(async (target) => {
        const status = await migrator.getConnectionStatus(target);
        return migrationPlan(target, status.pending);
      }),
    );
  }
  if (method === "shadow") {
    if (shadowTarget === undefined) throw new Error("Shadow target validation was skipped.");
    if (mutationRequested(input)) {
      const result = await migrator.runShadowTest({ target: shadowTarget });
      return Array.isArray(result)
        ? {
            ok: true,
            target: shadowTarget,
            migrations: result.flatMap(({ applied }) => applied),
          }
        : result;
    }

    const status = await migrator.getConnectionStatus(shadowTarget);
    return migrationPlan(shadowTarget, status.pending);
  }

  const target = requiredText(input, "target");
  assertMigrationTarget(target);
  if (method === "code") return migrator.getPreparedCodes(target);

  const action =
    method === "rollback" || text(input, "action") === "rollback" ? "rollback" : "apply";
  const migrations =
    action === "apply"
      ? (await migrator.getConnectionStatus(target)).pending
      : (await migrator.getLatestAppliedBatch(target)).files;
  const plan = await migrationPlan(target, migrations, action);
  if (method !== "rollback" || !mutationRequested(input)) return plan;
  return migrator.rollback([target]);
}

async function fixtureOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  await ensureSonamu();
  const [fixtureCommands, { FixtureManager }, fixtureService, { Sonamu }] = await Promise.all([
    import("../bin/fixture"),
    import("../testing/fixture-manager"),
    import("./fixture-service"),
    import("../api/sonamu"),
  ]);
  if (method === "init") {
    return mutationRequested(input) ? fixtureCommands.fixtureInitCommand() : { dryRun: true };
  }
  if (method === "import") {
    if (!mutationRequested(input)) return { dryRun: true };
    FixtureManager.init();
    await FixtureManager.importFixture(
      requiredText(input, "entityId"),
      z.array(z.number()).parse(input.recordIds),
    );
    await FixtureManager.sync();
    return { imported: true };
  }
  if (method === "sync") {
    if (!mutationRequested(input)) return { dryRun: true };
    FixtureManager.init();
    await FixtureManager.sync();
    return { synced: true };
  }
  const legacyCommand = z.enum(["gen", "fetch", "explore"]).parse(method);
  const isTransfer = ["entityId", "source", "target", "field", "values", "relations", "depth"].some(
    (key) => input[key] !== undefined,
  );
  if (!isTransfer) {
    const options = fixtureService.normalizeLegacyFixtureCommandOptions(legacyCommand, input);
    const strategy = z
      .enum(["sample", "ids", "query", "file", "recent", "random"])
      .optional()
      .parse(options.strategy);
    const fixtureOptions = { ...options, strategy } satisfies FixtureCommandOptions;
    if (legacyCommand !== "explore" && !mutationRequested(input)) {
      return { dryRun: true, request: fixtureOptions };
    }
    if (legacyCommand === "gen") return fixtureCommands.fixtureGenCommand(fixtureOptions);
    if (legacyCommand === "explore") return fixtureCommands.fixtureExploreCommand(fixtureOptions);
    return fixtureCommands.fixtureFetchCommand(fixtureOptions);
  }

  const entityId = requiredText(input, "entityId");
  const source = requiredText(input, "source");
  const target = requiredText(input, "target");
  const field = requiredText(input, "field");
  const values = strings(input, "values");
  const relations = requiredText(input, "relations");
  const depth = z.number().int().positive().safeParse(input.depth);
  if (
    !Object.hasOwn(Sonamu.dbConfig, source) ||
    !Object.hasOwn(Sonamu.dbConfig, target) ||
    values.length === 0 ||
    !["include", "exclude", "none"].includes(relations) ||
    !depth.success
  ) {
    throw Object.assign(new Error("Invalid fixture transfer selector."), {
      code: "INVALID_FIXTURE_TRANSFER",
      exitCode: 2,
    });
  }
  // SAFETY: Object.hasOwn checks above establish both keys as configured DB presets.
  const sourceKey = source as keyof typeof Sonamu.dbConfig;
  // SAFETY: Object.hasOwn checks above establish both keys as configured DB presets.
  const targetKey = target as keyof typeof Sonamu.dbConfig;
  const records = (
    await Promise.all(
      values.map((value) =>
        FixtureManager.getFixtures(
          sourceKey,
          targetKey,
          { entityId, field, value, searchType: "equals" },
          { includeRelations: relations === "include", maxDepth: depth.data },
        ),
      ),
    )
  ).flat();
  if (explicitlyDryRun(input)) return { dryRun: true, records };
  if (records.length > 0) await FixtureManager.insertFixtures(targetKey, records);
  return { records };
}

async function buildOperation(method: string): Promise<ToolingResult> {
  const { buildApiCommand, buildWebCommand } = await import("../bin/build-config");
  if (method === "api") return buildApiCommand();
  if (method === "web") return buildWebCommand();
  await buildApiCommand();
  return buildWebCommand({ skipIfMissing: true });
}

async function testOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  const { createDefaultTestRunClient } = await import("./test-run-client");
  const client = createDefaultTestRunClient();
  if (method === "status") return client.status();
  const request = {
    files: z.array(z.string()).catch([]).parse(input.files),
    pattern: z.string().optional().parse(input.pattern),
    traces: input.traces === true,
  };
  return { request, result: await client.run(request) };
}

const betterAuthPluginSchema = z.enum([
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
]);

async function authOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  const { addCompanionsToEntities, generateBetterAuthEntities } = await import("../auth");
  if (method === "addCompanions") return addCompanionsToEntities();
  const plugins = z.array(betterAuthPluginSchema).parse(
    requiredText(input, "plugins")
      .split(",")
      .map((plugin) => plugin.trim())
      .filter(Boolean),
  );
  return generateBetterAuthEntities({ plugins });
}

async function i18nOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  await ensureSonamu();
  const { sonamuDictionary } = await import("../dict/sonamu-dictionary");
  if (method === "list") {
    const dictionary = await sonamuDictionary.getDictionary();
    const locale = text(input, "locale");
    return locale === undefined
      ? dictionary
      : {
          ...dictionary,
          locales: [locale],
          rows: dictionary.rows.map((row) => ({
            key: row.key,
            source: row.source,
            [locale]: row[locale],
          })),
        };
  }
  if (method === "check") {
    const dictionary = await sonamuDictionary.getDictionary();
    return sonamuDictionary.checkUsage(dictionary.rows.map((row) => row.key));
  }
  if (method === "export" || method === "import") {
    const file = requiredText(input, "file");
    if (explicitlyDryRun(input)) return { operation: method, dryRun: true };
    const { readFile, writeFile } = await import("node:fs/promises");
    const format = text(input, "format") === "json" ? "json" : "workbook";
    if (method === "export" && format === "workbook") {
      const { buffer } = await sonamuDictionary.exportToExcel();
      await writeFile(file, buffer);
      return { exported: 1 };
    }
    if (method === "import" && format === "workbook") {
      return sonamuDictionary.importFromExcel(await readFile(file));
    }

    if (method === "export") {
      const dictionary = await sonamuDictionary.getDictionary();
      const locale = text(input, "locale");
      const rows = dictionary.rows.map(
        ({ key, source: _source, isFunction: _isFunction, ...values }) => ({
          key,
          values:
            locale === undefined
              ? values
              : { [locale]: z.string().catch("").parse(values[locale]) },
        }),
      );
      await writeFile(file, JSON.stringify(rows, null, 2));
      return { exported: rows.length };
    }

    const entries = parseJson(
      (await readFile(file)).toString("utf8"),
      "I18N_INVALID_JSON",
      i18nEntriesSchema,
    );
    const current = await sonamuDictionary.getDictionary();
    const existingKeys = new Set(current.rows.map(({ key }) => key));
    for (const entry of entries) {
      if (existingKeys.has(entry.key)) {
        await sonamuDictionary.updateEntry({
          oldKey: entry.key,
          newKey: entry.key,
          source: "project",
          values: entry.values,
        });
      } else {
        await sonamuDictionary.createEntry(entry);
      }
    }
    return { imported: entries.length };
  }
  const key = requiredText(input, "key");
  if (method === "create") {
    if (explicitlyDryRun(input)) return { operation: "create", input, dryRun: true };
    return sonamuDictionary.createEntry({
      key,
      values: dictionaryValuesSchema.parse(input.values),
    });
  }
  if (method === "update") {
    if (explicitlyDryRun(input)) return { operation: "update", input, dryRun: true };
    return sonamuDictionary.updateEntry({
      oldKey: key,
      newKey: text(input, "newKey") ?? key,
      source: dictionarySourceSchema.parse(text(input, "source") ?? "project"),
      values: dictionaryValuesSchema.parse(input.values),
    });
  }
  if (!mutationRequested(input)) return { key, operation: "remove", dryRun: true };
  return sonamuDictionary.deleteEntry(key);
}

async function taskOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  await ensureSonamu();
  const { Sonamu } = await import("../api/sonamu");
  const workflows = Sonamu.workflows;
  const backend = workflows.backend;
  if (method === "definitions") return { definitions: workflows.workflowDefinitions };
  if (method === "runs") return backend.listWorkflowRuns({ limit: 50 });
  const workflowRunId = requiredText(input, "runId");
  if (method === "show") return backend.getWorkflowRun({ workflowRunId });
  if (method === "watch") {
    const { isDeepStrictEqual } = await import("node:util");
    return (async function* watch() {
      let previous: object | undefined;
      while (true) {
        const snapshot = await backend.getWorkflowRun({ workflowRunId });
        if (snapshot === null) {
          throw Object.assign(new Error(`Workflow run not found: ${workflowRunId}`), {
            code: "TASK_RUN_NOT_FOUND",
          });
        }
        const rawState = snapshot.status === "succeeded" ? "completed" : snapshot.status;
        const state = rawState === "canceled" ? "cancelled" : rawState;
        const current = { ...snapshot, state };
        if (!isDeepStrictEqual(current, previous)) {
          previous = structuredClone(current);
          yield current;
        }
        if (["completed", "failed", "cancelled"].includes(state)) return;
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    })();
  }
  if (method === "steps") return backend.listStepAttempts({ workflowRunId, limit: 100 });
  if (!mutationRequested(input)) return { operation: method, workflowRunId, dryRun: true };
  if (method === "pause") return backend.pauseWorkflowRun({ workflowRunId });
  if (method === "resume") return backend.resumeWorkflowRun({ workflowRunId });
  return backend.cancelWorkflowRun({ workflowRunId });
}

async function cddRootPath(): Promise<string> {
  const [{ Sonamu }, path] = await Promise.all([import("../api/sonamu"), import("node:path")]);
  return path.join(Sonamu.appRootPath, "contract");
}

async function readCddTree(directory: string, root: string): Promise<object[]> {
  const [{ readdir }, path] = await Promise.all([import("node:fs/promises"), import("node:path")]);
  const entries = await readdir(directory, { withFileTypes: true });
  const nodes = [];
  for (const entry of entries) {
    if (entry.name === "rules") continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath);
    if (entry.isDirectory()) {
      const children = await readCddTree(absolutePath, root);
      if (children.length > 0) {
        nodes.push({ name: entry.name, path: relativePath, type: "directory", children });
      }
    } else if (entry.isFile() && entry.name.endsWith(".contract.md")) {
      nodes.push({ name: entry.name, path: relativePath, type: "file", fileType: "contract" });
    }
  }
  return nodes;
}

async function cddOperation(method: string, input: CommandInput): Promise<ToolingResult> {
  await ensureSonamu();
  const [{ access }, { createDefaultCddToolingAdapter }] = await Promise.all([
    import("node:fs/promises"),
    import("./cdd-service"),
  ]);
  const adapter = createDefaultCddToolingAdapter({ contractRoot: await cddRootPath() });
  if (method === "tree") {
    const root = await cddRootPath();
    try {
      await access(root);
    } catch {
      return { exists: false, tree: [] };
    }
    return { exists: true, tree: await readCddTree(root, root) };
  }
  if (method === "read") {
    const relativePath = requiredText(input, "path");
    return adapter.read({ path: relativePath });
  }
  if (method === "rules") return adapter.rules();
  if (method === "showRule") {
    const ruleId = requiredText(input, "ruleId");
    return adapter.showRule({ ruleId });
  }
  if (method === "addRule") {
    const ruleKey = requiredText(input, "ruleKey");
    const id = requiredText(input, "id");
    const when = requiredText(input, "when");
    const ruleText = text(input, "instruction") ?? requiredText(input, "text");
    return adapter.addRule({
      ruleKey,
      id,
      when,
      text: ruleText,
      examples: strings(input, "examples"),
      dryRun: explicitlyDryRun(input),
    });
  }
  if (explicitlyDryRun(input)) {
    return { operation: "addAcceptanceCriterion", input, dryRun: true };
  }
  const document = requiredText(input, "document");
  const criterion = requiredText(input, "text");
  return adapter.addAcceptanceCriterion({ document, text: criterion, dryRun: false });
}

async function invokeDefault(
  group: string,
  method: string,
  input: CommandInput,
): Promise<ToolingResult> {
  if (group === "core") return syncOperation(input);
  if (group === "entity") return entityOperation(method, input);
  if (group === "scaffold") return scaffoldOperation(method, input);
  if (group === "migration") return migrationOperation(method, input);
  if (group === "fixture") return fixtureOperation(method, input);
  if (group === "build") return buildOperation(method);
  if (group === "test") return testOperation(method, input);
  if (group === "auth") return authOperation(method, input);
  if (group === "i18n") return i18nOperation(method, input);
  if (group === "task") return taskOperation(method, input);
  return cddOperation(method, input);
}

// 기본 registry는 호출 시점까지 Sonamu 초기화와 외부 작업을 모두 미룹니다.
export const tooling: CliToolingOperations = Object.fromEntries(
  Object.entries(REQUIRED_METHODS).map(([group, methods]) => [
    group,
    Object.fromEntries(
      methods.map((method) => [
        method,
        (input: CommandInput) => invokeDefault(group, method, input),
      ]),
    ),
  ]),
);

Object.defineProperty(tooling.migration, "apply", {
  enumerable: false,
  value: (input: CommandInput) => invokeDefault("migration", "apply", input),
});
