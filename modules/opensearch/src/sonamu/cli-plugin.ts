import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";

import {
  type SonamuCliArgument,
  type SonamuCliCommand,
  type SonamuCliCommandInput,
  type SonamuCliOption,
  type SonamuCliOptionValue,
  type SonamuCliPlugin,
} from "sonamu";
import { z } from "zod";

import {
  type AdminContext,
  createSearchAdmin,
  type CreatePlan,
  type DocumentScope,
  type IndexInspection,
  type RetryScope,
  type SearchAdmin,
  type SearchAdminOptions,
} from "../admin/search-admin";
import { createSearchClient, type SearchClientOptions } from "../client/search-client";
import { RECOMMENDED_WORKER_STOP_DEADLINE_MS, workerBoundsFrom } from "../defaults";
import { type DefinedSearch } from "../definition/define-search";
import {
  SearchAdminPreconditionFailed,
  SearchConfigurationError,
  SearchError,
  SearchNotConfigured,
  SearchStoreMismatch,
  SearchUnavailable,
} from "../errors";
import { formatSearchMessage } from "../i18n";
import { type PostgresSynchronization } from "../postgres/synchronization";
import { createIndexer } from "../worker/indexer";
import { type WorkerLimits } from "../worker/limits";

/** What the search commands need from the application; load builds it only when a command runs. */
export interface SearchCliSetup {
  /** Every definition still served, the current one of each logical key first (the worker's list). */
  readonly definitions: readonly DefinedSearch[];
  /** The application's; the plugin never closes it. */
  readonly synchronization: PostgresSynchronization;
  /**
   * Options for the clients the plugin creates and closes per command. Not called by PostgreSQL-only commands, so
   * those still run when it is omitted or throws (for example a missing URL); the others refuse.
   */
  readonly client?: () => SearchClientOptions;
  /** The values the application's admin handle uses; lifetimes are recorded with the first target. */
  readonly admin: Pick<SearchAdminOptions, "lifetimes" | "timeouts" | "cutover">;
  /** The worker's real limits: drain runs with them and the admin's workerBounds derive from them. */
  readonly workerLimits: WorkerLimits;
}

export interface SearchCliPluginOptions {
  /** Called inside each command after Sonamu.init, so sonamu.config.ts never imports the search modules. */
  readonly load: () => SearchCliSetup | Promise<SearchCliSetup>;
}

/** One line of a streamed command. */
export interface SearchCliEvent {
  readonly event: string;
  readonly data: object | null;
}

type CommandResult =
  | { readonly kind: "value"; readonly value: object }
  | { readonly kind: "stream"; readonly events: AsyncIterable<SearchCliEvent> };

interface Session {
  readonly setup: SearchCliSetup;
  readonly admin: SearchAdmin;
}

type ClientUse = "never" | "always" | "unless-dry-run";

/** A command under construction; optional fields are added only when present. */
type DeclaredCommand = { -readonly [K in keyof SonamuCliCommand]: SonamuCliCommand[K] };

interface CommandSpec {
  readonly name: string;
  readonly description: string;
  readonly logicalKey?: true;
  readonly options?: Readonly<Record<string, SonamuCliOption>>;
  readonly mutation?: { readonly dryRun: boolean };
  readonly client: ClientUse;
  run(session: Session, input: SonamuCliCommandInput): Promise<CommandResult>;
}

const DEFAULT_PAGE_LIMIT = 500;
const DEFAULT_MAX_DRAIN_ROUNDS = 100;
const DRAIN_POLL_INTERVAL_MS = 200;
const MAX_ECHOED_LENGTH = 512;
// Usage mistakes exit like the CLI's own argument errors.
const USAGE_REASONS = new Set([
  "invalid-cli-input",
  "logical-key-required",
  "logical-key-unknown",
  "remark-scope-required",
]);

const functionSchema = z.instanceof(Function);
const pluginOptionsSchema = z.strictObject({ load: functionSchema });
const setupSchema = z.strictObject({
  definitions: z
    .array(z.looseObject({ key: z.string().min(1), fingerprint: z.string().min(1) }))
    .min(1),
  synchronization: z.looseObject({ initialize: functionSchema, checkBinding: functionSchema }),
  client: functionSchema.optional(),
  admin: z.strictObject({
    lifetimes: z.looseObject({}),
    timeouts: z.looseObject({}),
    cutover: z.looseObject({}),
  }),
  workerLimits: z.looseObject({
    leaseDurationMs: z.number(),
    requestTimeoutMs: z.number(),
  }),
});
const positiveIntegerSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const textSchema = z.string().min(1);

function issuePath(error: z.ZodError): string {
  return (error.issues[0]?.path ?? []).map(String).join(".").slice(0, 120) || "options";
}

function invalidInput(name: string): SearchConfigurationError {
  return new SearchConfigurationError(
    { key: "cli.invalidInput", params: { name } },
    { details: { reason: "invalid-cli-input", name } },
  );
}

function readInput<S extends z.ZodType>(
  value: SonamuCliOptionValue | undefined,
  name: string,
  schema: S,
): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw invalidInput(name);
  return parsed.data;
}

function option<S extends z.ZodType>(
  input: SonamuCliCommandInput,
  name: string,
  schema: S,
): z.output<S> {
  return readInput(input.options[name], name, schema);
}

async function loadSetup(load: SearchCliPluginOptions["load"]): Promise<SearchCliSetup> {
  const setup = await load();
  const parsed = setupSchema.safeParse(setup);
  if (!parsed.success) {
    const path = issuePath(parsed.error);
    throw new SearchConfigurationError(
      { key: "cli.invalidSetup", params: { path } },
      { details: { reason: "invalid-cli-setup", path } },
    );
  }
  return setup;
}

/** The plugin closes the client it creates; the setup's synchronization stays the application's. */
async function openSession(
  load: SearchCliPluginOptions["load"],
  withClient: boolean,
): Promise<{ session: Session; close: () => Promise<void> }> {
  const setup = await loadSetup(load);
  const client =
    withClient && setup.client !== undefined ? createSearchClient(setup.client()) : undefined;
  const close = async () => {
    await client?.close();
  };
  try {
    const admin = createSearchAdmin({
      client,
      synchronization: setup.synchronization,
      definitions: setup.definitions,
      lifetimes: setup.admin.lifetimes,
      timeouts: setup.admin.timeouts,
      cutover: setup.admin.cutover,
      workerBounds: workerBoundsFrom(setup.workerLimits),
    });
    return { session: { setup, admin }, close };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}

function logicalKeys(setup: SearchCliSetup): string[] {
  return [...new Set(setup.definitions.map((definition) => definition.key))];
}

function resolveLogicalKey(setup: SearchCliSetup, input: SonamuCliCommandInput): string {
  const given = readInput(input.arguments.logicalKey, "logicalKey", textSchema.optional());
  const keys = logicalKeys(setup);
  const listed = keys.join(", ").slice(0, MAX_ECHOED_LENGTH);
  if (given === undefined) {
    const [only] = keys;
    if (keys.length === 1 && only !== undefined) return only;
    throw new SearchNotConfigured(
      { key: "cli.logicalKeyRequired", params: { keys: listed } },
      { details: { reason: "logical-key-required", keys: listed } },
    );
  }
  if (keys.includes(given)) return given;
  const logicalKey = given.slice(0, MAX_ECHOED_LENGTH);
  throw new SearchNotConfigured(
    { key: "cli.logicalKeyUnknown", params: { logicalKey, keys: listed } },
    { details: { reason: "logical-key-unknown", logicalKey, keys: listed } },
  );
}

function currentDefinition(setup: SearchCliSetup, logicalKey: string): DefinedSearch {
  const definition = setup.definitions.find((candidate) => candidate.key === logicalKey);
  // resolveLogicalKey only returns keys of the setup's definitions.
  if (definition === undefined) throw invalidInput("logicalKey");
  return definition;
}

function operatorName(): string {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

/** A fresh operation ID per admin call unless --operation-id is given. */
function audit(input: SonamuCliCommandInput, command: string): AdminContext {
  return {
    operationId:
      option(input, "operationId", textSchema.optional()) ??
      `sonamu-search-${command}-${randomUUID()}`,
    actor: option(input, "actor", textSchema.optional()) ?? `cli:${operatorName()}`,
    reason: option(input, "reason", textSchema.optional()) ?? `sonamu search ${command}`,
  };
}

function storeMismatchHint(): string {
  return formatSearchMessage({ key: "cli.storeMismatchHint" });
}

/** Carries the package's code and reason to the CLI, which prints code, message, hint and details. */
function toCliError(error: Error): Error {
  if (!(error instanceof SearchError)) return error;
  const reason = z.string().safeParse(error.details?.reason);
  return Object.assign(new Error(error.message, { cause: error }), {
    name: error.name,
    code: error.code,
    exitCode: reason.success && USAGE_REASONS.has(reason.data) ? 2 : 1,
    details: { ...error.details, retryable: error.retryable },
    hint: error instanceof SearchStoreMismatch ? storeMismatchHint() : undefined,
  });
}

async function* guarded(
  events: AsyncIterable<SearchCliEvent>,
  close: () => Promise<void>,
): AsyncGenerator<SearchCliEvent> {
  try {
    yield* events;
  } catch (error) {
    throw error instanceof Error ? toCliError(error) : error;
  } finally {
    await close().catch(() => {});
  }
}

function toCommand(spec: CommandSpec, load: SearchCliPluginOptions["load"]): SonamuCliCommand {
  const options =
    spec.mutation === undefined ? spec.options : { ...spec.options, ...auditOptions() };
  const declared: DeclaredCommand = {
    path: ["search", spec.name],
    description: spec.description,
    async run(input) {
      let close: (() => Promise<void>) | undefined;
      try {
        const withClient =
          spec.client === "always" || (spec.client === "unless-dry-run" && !input.dryRun);
        const opened = await openSession(load, withClient);
        close = opened.close;
        const result = await spec.run(opened.session, input);
        if (result.kind === "value") return result.value;
        const stream = guarded(result.events, opened.close);
        close = undefined;
        return stream;
      } catch (error) {
        throw error instanceof Error ? toCliError(error) : error;
      } finally {
        await close?.().catch(() => {});
      }
    },
  };
  if (spec.logicalKey === true) declared.arguments = [logicalKeyArgument()];
  if (options !== undefined) declared.options = options;
  if (spec.mutation !== undefined) declared.mutation = spec.mutation;
  return declared;
}

function logicalKeyArgument(): SonamuCliArgument {
  return {
    name: "logicalKey",
    required: false,
    description: formatSearchMessage({ key: "cli.argument.logicalKey" }),
  };
}

function auditOptions() {
  return {
    operationId: {
      type: "string",
      description: formatSearchMessage({ key: "cli.option.operationId" }),
    },
    actor: { type: "string", description: formatSearchMessage({ key: "cli.option.actor" }) },
    reason: { type: "string", description: formatSearchMessage({ key: "cli.option.reason" }) },
  } satisfies Record<string, SonamuCliOption>;
}

function limitOption(): SonamuCliOption {
  return { type: "integer", description: formatSearchMessage({ key: "cli.option.limit" }) };
}

function buildOption(): SonamuCliOption {
  return { type: "string", description: formatSearchMessage({ key: "cli.option.build" }) };
}

function targetOption(required: boolean): SonamuCliOption {
  return {
    type: "string",
    required,
    description: formatSearchMessage({ key: "cli.option.target" }),
  };
}

function pageLimit(input: SonamuCliCommandInput): number {
  return option(input, "limit", positiveIntegerSchema.optional()) ?? DEFAULT_PAGE_LIMIT;
}

function requiredTarget(input: SonamuCliCommandInput): string {
  return option(input, "target", textSchema);
}

async function inspectOrUndefined(
  admin: SearchAdmin,
  logicalKey: string,
): Promise<IndexInspection | undefined> {
  try {
    const inspection = await admin.inspect(logicalKey);
    return inspection.registered ? inspection : undefined;
  } catch (error) {
    if (
      error instanceof SearchNotConfigured &&
      error.details?.reason === "logical-key-not-registered"
    ) {
      return undefined;
    }
    throw error;
  }
}

/** --build when given; otherwise the logical key's open build. */
async function buildIdFor(session: Session, input: SonamuCliCommandInput): Promise<string> {
  const given = option(input, "build", textSchema.optional());
  if (given !== undefined) return given;
  const logicalKey = resolveLogicalKey(session.setup, input);
  const buildId = (await inspectOrUndefined(session.admin, logicalKey))?.openBuild?.buildId;
  if (buildId === undefined) {
    throw new SearchAdminPreconditionFailed(
      { key: "cli.noOpenBuild", params: { logicalKey } },
      { details: { reason: "no-open-build", logicalKey } },
    );
  }
  return buildId;
}

async function bindingReport(synchronization: PostgresSynchronization) {
  const binding = await synchronization.checkBinding();
  return {
    ...binding,
    instanceName: synchronization.instanceName ?? null,
    ok: binding.originRecorded && binding.originMatches && binding.instanceMatches,
  };
}

function planSummary(plan: CreatePlan) {
  return {
    targetId: plan.targetId,
    physicalIndex: plan.physicalIndex,
    writeAlias: plan.writeAlias,
    fingerprint: plan.fingerprint,
    captureEpoch: plan.captureEpoch,
    missingPlugins: plan.missingPlugins,
    warnings: plan.warnings,
  };
}

async function* backfillPages(
  admin: SearchAdmin,
  buildId: string,
  limit: number,
): AsyncGenerator<SearchCliEvent> {
  for (;;) {
    const progress = await admin.runBackfillPage(buildId, { limit });
    yield { event: "backfill.page", data: progress };
    if (progress.done) return;
  }
}

async function cutoverCheck(admin: SearchAdmin, buildId: string) {
  const inspection = await admin.inspectBuild(buildId);
  return {
    buildId,
    phase: inspection.phase,
    eligibleForCutover: inspection.eligibleForCutover,
    blockers: inspection.blockers,
    newTarget: inspection.newTarget,
    oldTarget: inspection.oldTarget ?? null,
  };
}

async function* initEvents(
  session: Session,
  input: SonamuCliCommandInput,
  logicalKey: string,
  fingerprint: string,
  registered: boolean,
  limit: number,
): AsyncGenerator<SearchCliEvent> {
  const { admin } = session;
  if (!registered) {
    const plan = await admin.planCreate(logicalKey, { fingerprint });
    yield { event: "init.plan", data: planSummary(plan) };
    // executeCreate refuses with plugins-missing itself.
    yield { event: "init.created", data: await admin.executeCreate(plan, audit(input, "init")) };
  }
  // With a target this opens a rebuild, or returns the open build of the same fingerprint.
  const build = await admin.beginRebuild({ logicalKey, fingerprint }, audit(input, "init"));
  yield { event: "init.build", data: build };
  if (build.kind !== "initial") {
    yield {
      event: "init.next",
      data: { steps: ["backfill", "cutover", "retire-old"], buildId: build.buildId },
    };
    return;
  }
  yield* backfillPages(admin, build.buildId, limit);
  yield { event: "cutover.check", data: await cutoverCheck(admin, build.buildId) };
  yield {
    event: "cutover.done",
    data: await admin.cutover(build.buildId, audit(input, "init")),
  };
}

async function* retireEvents(
  session: Session,
  input: SonamuCliCommandInput,
  targetIds: readonly string[],
): AsyncGenerator<SearchCliEvent> {
  if (targetIds.length === 0) {
    yield { event: "retire.none", data: null };
    return;
  }
  for (const targetId of targetIds) {
    yield { event: "retire.start", data: { targetId } };
    await session.admin.retireTarget(targetId, audit(input, "retire-old"));
    yield { event: "retire.done", data: { targetId } };
  }
}

async function* verifyPages(
  admin: SearchAdmin,
  targetId: string,
  limit: number,
): AsyncGenerator<SearchCliEvent> {
  for (;;) {
    const progress = await admin.runTargetVerificationPage(targetId, { limit });
    yield { event: "verify.page", data: progress };
    if (!progress.done) continue;
    if (progress.violations > 0) {
      throw new SearchAdminPreconditionFailed(
        {
          key: "cli.verificationViolations",
          params: { targetId, violations: progress.violations },
        },
        {
          details: { reason: "verification-violations", targetId, violations: progress.violations },
        },
      );
    }
    return;
  }
}

async function* remarkPages(
  session: Session,
  input: SonamuCliCommandInput,
  logicalKey: string,
): AsyncGenerator<SearchCliEvent> {
  const { admin } = session;
  const ids = option(input, "ids", z.array(textSchema).min(1).optional());
  if (ids !== undefined) {
    yield {
      event: "remark.page",
      data: await admin.remark({ logicalKey, ids }, audit(input, "remark")),
    };
    return;
  }
  const scan = option(input, "scan", z.enum(["source", "ledger"]).optional());
  if (scan === undefined) {
    throw new SearchConfigurationError(
      { key: "cli.remarkScopeRequired" },
      { details: { reason: "remark-scope-required" } },
    );
  }
  const limit = pageLimit(input);
  const through = option(input, "through", textSchema.optional());
  let after = option(input, "after", textSchema.optional());
  let marked = 0;
  // One audit context for every page of the scan.
  const context = audit(input, "remark");
  for (;;) {
    const scope: DocumentScope = { logicalKey, scan, limit };
    if (after !== undefined) scope.after = after;
    if (through !== undefined) scope.through = through;
    const report = await admin.remark(scope, context);
    marked += report.marked;
    yield { event: "remark.page", data: report };
    if (report.next === undefined) {
      yield { event: "remark.done", data: { marked } };
      return;
    }
    after = report.next;
  }
}

async function* retryPages(
  session: Session,
  input: SonamuCliCommandInput,
): AsyncGenerator<SearchCliEvent> {
  const targetId = requiredTarget(input);
  const limit = pageLimit(input);
  const documentIds = option(input, "ids", z.array(textSchema).min(1).optional());
  let released = 0;
  for (;;) {
    const scope: RetryScope = { targetId, limit };
    if (documentIds !== undefined) scope.documentIds = documentIds;
    const report = await session.admin.retryQuarantined(scope, audit(input, "retry-quarantined"));
    released += report.released;
    yield { event: "retry.page", data: report };
    if (documentIds !== undefined || report.released < limit) {
      yield { event: "retry.done", data: { released } };
      return;
    }
  }
}

/** Every drain attempt emits exactly one drain or error event, which decides when to stop. */
async function* drainEvents(
  setup: SearchCliSetup,
  maxRounds: number,
): AsyncGenerator<SearchCliEvent> {
  if (setup.client === undefined) {
    throw new SearchAdminPreconditionFailed(
      { key: "admin.clientNotConfigured", params: { operation: "drain" } },
      { details: { reason: "search-client-not-configured", operation: "drain" } },
    );
  }
  const clientOptions = setup.client();
  await setup.synchronization.initialize();
  const queue: SearchCliEvent[] = [];
  let failure: Error | undefined;
  let finished = false;
  let wake: (() => void) | undefined;
  let rounds = 0;
  const notify = () => {
    const resume = wake;
    wake = undefined;
    resume?.();
  };
  const finish = (error?: Error) => {
    if (finished) return;
    finished = true;
    failure = error;
    notify();
  };
  // Stopping the worker closes this client, so it is never the admin handle's.
  const client = createSearchClient(clientOptions);
  let handle;
  try {
    handle = createIndexer({
      client,
      synchronization: setup.synchronization,
      definitions: setup.definitions,
      limits: setup.workerLimits,
      onEvent: (event) => {
        switch (event.type) {
          case "drain":
            rounds += 1;
            queue.push({ event: "drain.round", data: event.report });
            if (event.outcome === "cooldown") {
              const { cooldownRemainingMs } = event.report;
              finish(
                new SearchUnavailable(
                  { key: "cli.workerCooldown", params: { cooldownRemainingMs } },
                  { details: { reason: "worker-cooldown", cooldownRemainingMs } },
                ),
              );
            } else if (event.outcome !== "processed" || rounds >= maxRounds) {
              finish();
            }
            break;
          case "error":
            finish(drainRefused(event.code, event.reason));
            break;
          default:
            queue.push({ event: `drain.${event.type}`, data: event });
        }
        notify();
      },
    }).start({ pollIntervalMs: DRAIN_POLL_INTERVAL_MS });
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
  let stopped = false;
  try {
    for (;;) {
      const next = queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (finished) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    stopped = true;
    yield {
      event: "drain.stopped",
      data: await handle.stop({ deadlineMs: RECOMMENDED_WORKER_STOP_DEADLINE_MS }),
    };
  } finally {
    if (!stopped) await handle.stop({ deadlineMs: RECOMMENDED_WORKER_STOP_DEADLINE_MS });
  }
  if (failure !== undefined) throw failure;
}

/** The worker reports only the code and reason; the CLI shows them as a package error would. */
function drainRefused(code: string, reason: string | undefined): Error {
  return Object.assign(
    new Error(formatSearchMessage({ key: "cli.drainRefused", params: { code } })),
    {
      code,
      exitCode: 1,
      details: { reason: reason ?? "drain-refused" },
      hint: code === "SEARCH_STORE_MISMATCH" ? storeMismatchHint() : undefined,
    },
  );
}

function commandSpecs(): CommandSpec[] {
  return [
    {
      name: "inspect",
      description: formatSearchMessage({ key: "cli.command.inspect" }),
      logicalKey: true,
      client: "never",
      async run(session, input) {
        const logicalKey = resolveLogicalKey(session.setup, input);
        const inspection = await inspectOrUndefined(session.admin, logicalKey);
        return {
          kind: "value",
          value: {
            inspection: inspection ?? { logicalKey, registered: false },
            // Read separately, so the binding is reported even for an unregistered key.
            binding: await bindingReport(session.setup.synchronization),
          },
        };
      },
    },
    {
      name: "init",
      description: formatSearchMessage({ key: "cli.command.init" }),
      logicalKey: true,
      options: { limit: limitOption() },
      mutation: { dryRun: true },
      client: "always",
      async run(session, input) {
        const logicalKey = resolveLogicalKey(session.setup, input);
        const { fingerprint } = currentDefinition(session.setup, logicalKey);
        // Validated before anything changes.
        const limit = pageLimit(input);
        const inspection = await inspectOrUndefined(session.admin, logicalKey);
        if (input.dryRun) {
          const plan =
            inspection === undefined
              ? planSummary(await session.admin.planCreate(logicalKey, { fingerprint }))
              : null;
          return {
            kind: "value",
            value: {
              logicalKey,
              fingerprint,
              registered: inspection !== undefined,
              plan,
              openBuild: inspection?.openBuild ?? null,
            },
          };
        }
        return {
          kind: "stream",
          events: initEvents(
            session,
            input,
            logicalKey,
            fingerprint,
            inspection !== undefined,
            limit,
          ),
        };
      },
    },
    {
      name: "backfill",
      description: formatSearchMessage({ key: "cli.command.backfill" }),
      logicalKey: true,
      options: { build: buildOption(), limit: limitOption() },
      mutation: { dryRun: false },
      client: "never",
      async run(session, input) {
        const limit = pageLimit(input);
        return {
          kind: "stream",
          events: backfillPages(session.admin, await buildIdFor(session, input), limit),
        };
      },
    },
    {
      name: "cutover",
      description: formatSearchMessage({ key: "cli.command.cutover" }),
      logicalKey: true,
      options: { build: buildOption() },
      mutation: { dryRun: true },
      client: "unless-dry-run",
      async run(session, input) {
        const buildId = await buildIdFor(session, input);
        const check = await cutoverCheck(session.admin, buildId);
        if (input.dryRun) return { kind: "value", value: { check } };
        return {
          kind: "value",
          value: { check, result: await session.admin.cutover(buildId, audit(input, "cutover")) },
        };
      },
    },
    {
      name: "rollback",
      description: formatSearchMessage({ key: "cli.command.rollback" }),
      logicalKey: true,
      options: { build: buildOption() },
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        const buildId = await buildIdFor(session, input);
        return {
          kind: "value",
          value: {
            buildId,
            result: await session.admin.rollback(buildId, audit(input, "rollback")),
          },
        };
      },
    },
    {
      name: "retire-old",
      description: formatSearchMessage({ key: "cli.command.retireOld" }),
      logicalKey: true,
      options: {
        target: {
          type: "string",
          description: formatSearchMessage({ key: "cli.option.retireTarget" }),
        },
      },
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        const given = option(input, "target", textSchema.optional());
        if (given !== undefined)
          return { kind: "stream", events: retireEvents(session, input, [given]) };
        const logicalKey = resolveLogicalKey(session.setup, input);
        const inspection = await session.admin.inspect(logicalKey);
        const targetIds = inspection.targets
          .filter(
            (target) =>
              target.targetId !== inspection.readHead.targetId &&
              target.state !== "retired" &&
              target.deselectedAt !== null,
          )
          .map((target) => target.targetId);
        return { kind: "stream", events: retireEvents(session, input, targetIds) };
      },
    },
    {
      name: "suspend",
      description: formatSearchMessage({ key: "cli.command.suspend" }),
      logicalKey: true,
      mutation: { dryRun: false },
      client: "never",
      async run(session, input) {
        const logicalKey = resolveLogicalKey(session.setup, input);
        await session.admin.suspendCapture(logicalKey, audit(input, "suspend"));
        return { kind: "value", value: { logicalKey, captureMode: "suspended" } };
      },
    },
    {
      name: "resume",
      description: formatSearchMessage({ key: "cli.command.resume" }),
      logicalKey: true,
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        const logicalKey = resolveLogicalKey(session.setup, input);
        const build = await session.admin.resumeCaptureForRebuild(
          logicalKey,
          audit(input, "resume"),
        );
        return {
          kind: "value",
          value: { build, next: { steps: ["backfill", "cutover"], buildId: build.buildId } },
        };
      },
    },
    {
      name: "verify",
      description: formatSearchMessage({ key: "cli.command.verify" }),
      options: { target: targetOption(true), limit: limitOption() },
      // Records verification progress on the target.
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        return {
          kind: "stream",
          events: verifyPages(session.admin, requiredTarget(input), pageLimit(input)),
        };
      },
    },
    {
      name: "resume-target",
      description: formatSearchMessage({ key: "cli.command.resumeTarget" }),
      options: { target: targetOption(true) },
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        return {
          kind: "value",
          value: await session.admin.resumeTarget(
            requiredTarget(input),
            audit(input, "resume-target"),
          ),
        };
      },
    },
    {
      name: "reconcile",
      description: formatSearchMessage({ key: "cli.command.reconcile" }),
      options: { target: targetOption(true) },
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        // The CLI's approval is the operator's confirmation that no other create attempt runs.
        return {
          kind: "value",
          value: await session.admin.reconcileCreate(
            requiredTarget(input),
            { confirmQuiescent: true },
            audit(input, "reconcile"),
          ),
        };
      },
    },
    {
      name: "remark",
      description: formatSearchMessage({ key: "cli.command.remark" }),
      logicalKey: true,
      options: {
        ids: {
          type: "string",
          multiple: true,
          description: formatSearchMessage({ key: "cli.option.ids" }),
        },
        scan: {
          type: "string",
          choices: ["source", "ledger"],
          description: formatSearchMessage({ key: "cli.option.scan" }),
        },
        after: { type: "string", description: formatSearchMessage({ key: "cli.option.after" }) },
        through: {
          type: "string",
          description: formatSearchMessage({ key: "cli.option.through" }),
        },
        limit: limitOption(),
      },
      mutation: { dryRun: false },
      client: "never",
      async run(session, input) {
        const logicalKey = resolveLogicalKey(session.setup, input);
        await session.setup.synchronization.initialize();
        return { kind: "stream", events: remarkPages(session, input, logicalKey) };
      },
    },
    {
      name: "retry-quarantined",
      description: formatSearchMessage({ key: "cli.command.retryQuarantined" }),
      options: {
        target: targetOption(true),
        ids: {
          type: "string",
          multiple: true,
          description: formatSearchMessage({ key: "cli.option.ids" }),
        },
        limit: limitOption(),
      },
      mutation: { dryRun: false },
      client: "never",
      async run(session, input) {
        return { kind: "stream", events: retryPages(session, input) };
      },
    },
    {
      name: "drain",
      description: formatSearchMessage({ key: "cli.command.drain" }),
      options: {
        maxRounds: {
          type: "integer",
          description: formatSearchMessage({ key: "cli.option.maxRounds" }),
        },
      },
      mutation: { dryRun: false },
      client: "never",
      async run(session, input) {
        const maxRounds =
          option(input, "maxRounds", positiveIntegerSchema.optional()) ?? DEFAULT_MAX_DRAIN_ROUNDS;
        return { kind: "stream", events: drainEvents(session.setup, maxRounds) };
      },
    },
    {
      name: "adopt-store",
      description: formatSearchMessage({ key: "cli.command.adoptStore" }),
      mutation: { dryRun: false },
      client: "never",
      async run(session, input) {
        // The CLI's approval is the operator's confirmation that this database is a copy.
        const adopted = await session.admin.adoptCopiedStore(
          { confirmCopy: true },
          audit(input, "adopt-store"),
        );
        return {
          kind: "value",
          value: {
            adopted,
            binding: await bindingReport(session.setup.synchronization),
            // Processes initialized before adoption keep the old store_id and must restart.
            next: {
              steps: ["restart-processes", "resume", "backfill", "cutover"],
              detachedTargets: adopted.detachedTargets.length,
            },
          },
        };
      },
    },
    {
      name: "confirm-ownership",
      description: formatSearchMessage({ key: "cli.command.confirmOwnership" }),
      mutation: { dryRun: false },
      client: "always",
      async run(session, input) {
        // The CLI's approval is the operator's confirmation that no other database uses this store.
        const confirmed = await session.admin.confirmStoreOwnership(
          { confirmSoleOwner: true },
          audit(input, "confirm-ownership"),
        );
        return {
          kind: "value",
          value: { confirmed, binding: await bindingReport(session.setup.synchronization) },
        };
      },
    },
  ];
}

/**
 * The `sonamu search` commands for sonamu.config.ts (cli.plugins). Creating the plugin calls nothing: load runs inside
 * each command, after Sonamu.init.
 */
export function createSearchCliPlugin(options: SearchCliPluginOptions): SonamuCliPlugin {
  const parsed = pluginOptionsSchema.safeParse(options);
  if (!parsed.success) {
    const path = issuePath(parsed.error);
    throw new SearchConfigurationError(
      { key: "cli.invalidOptions", params: { path } },
      { details: { reason: "invalid-cli-options", path } },
    );
  }
  const { load } = options;
  return {
    name: "search",
    commands: commandSpecs().map((spec) => toCommand(spec, load)),
  };
}
