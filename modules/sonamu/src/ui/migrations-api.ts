import { readFile } from "fs/promises";
import { PassThrough } from "stream";

import { type FastifyInstance, type FastifyReply } from "fastify";

import { Sonamu } from "../api/sonamu";
import { type SonamuDBConfig } from "../database/db";
import { SD } from "../dict/sd";
import { BadRequestException } from "../exceptions/so-exceptions";
import {
  Migrator,
  MigrationTargetExecutionError,
  type MigrationResult,
} from "../migration/migrator";
import { SlackConfirm, type SlackConfirmPendingResult } from "../migration/slack-confirm";
import {
  type MigrationAction,
  type MigrationConnectionStatus,
  type MigrationProgressEvent,
  type MigrationStreamEvent,
  type MigrationTarget,
} from "../migration/types";
import { forwardAsyncErrors } from "./async-route";
import { isUIDBPreset } from "./ui-db-presets";

type ApprovalReady = { type: "ready" };
type ApprovalResult = ApprovalReady | SlackConfirmPendingResult;
type ApprovalAction = Exclude<MigrationAction, "shadow">;
type ApplyBody = { targets: MigrationTarget[]; requestor?: string };
type ApprovalRequestBody = ApplyBody & { action?: ApprovalAction };
type LegacyApplyBody = ApplyBody & { force?: boolean; forceReason?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function assertTargets(migrator: Migrator, targets: MigrationTarget[]): void {
  // urlencoded 단일 값처럼 배열이 아닌 입력은 대상 판별 전에 거부합니다.
  if (!Array.isArray(targets)) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: "Invalid migration targets: (not an array)",
    });
  }
  const allowed = new Set(migrator.getConnections().map(({ connKey }) => connKey));
  const invalid = targets.filter((target) => !allowed.has(target)).map(String);
  if (targets.length === 0 || invalid.length > 0) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: `Invalid migration targets: ${invalid.length === 0 ? "(empty)" : invalid.join(", ")}`,
    });
  }
}

function targetRequiresApproval(slack: SlackConfirm, target: MigrationTarget): boolean {
  const connection = /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ Sonamu
    .dbConfig[target]?.connection as { host?: string } | undefined;
  const remote = !LOCAL_HOSTS.has((connection?.host ?? "localhost").toLowerCase());
  return remote && slack.isTargetRequiresApproval(target);
}

async function getAvailableTargetStatuses(
  migrator: Migrator,
  targets: MigrationTarget[],
): Promise<MigrationConnectionStatus[]> {
  const statuses = await Promise.all(targets.map((target) => migrator.getConnectionStatus(target)));
  const failed = statuses.filter(({ status, error }) => status === "error" || error !== undefined);
  if (failed.length > 0) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: `Migration status could not be verified: ${failed.map(({ connKey }) => connKey).join(", ")}`,
    });
  }
  return statuses;
}

function getPendingMigrations(statuses: MigrationConnectionStatus[]) {
  return [...new Set(statuses.flatMap(({ pending }) => pending))];
}

/**
 * 승인 요청을 식별하는 마이그레이션 목록을 만듭니다.
 *
 * apply는 pending 파일 이름을, rollback은 대상별 최신 batch 번호를 포함한 항목을 씁니다.
 * rollback 항목은 apply 항목과 겹치지 않으므로 apply 승인으로 rollback을 실행할 수 없고,
 * 다시 적용되어 batch 번호가 바뀌면 새 승인을 받아야 합니다.
 */
async function getApprovalMigrations(
  migrator: Migrator,
  action: ApprovalAction,
  targets: MigrationTarget[],
  statuses: MigrationConnectionStatus[],
): Promise<string[]> {
  if (action === "apply") {
    return getPendingMigrations(statuses);
  }
  const batches = await Promise.all(
    targets.map(async (target) => ({ target, ...(await migrator.getLatestAppliedBatch(target)) })),
  );
  return batches.flatMap(({ target, batchNo, files }) =>
    files.map((file) => `[rollback:${String(target)}#${batchNo}] ${file}`),
  );
}

async function requestApproval(
  migrator: Migrator,
  body: ApprovalRequestBody,
): Promise<ApprovalResult> {
  const { targets, requestor } = body;
  const action = body.action ?? "apply";
  if (action !== "apply" && action !== "rollback") {
    throw new BadRequestException(SD("error.badRequest"), {
      message: `Invalid approval action: ${String(action)}`,
    });
  }
  assertTargets(migrator, targets);
  const statuses = await getAvailableTargetStatuses(migrator, targets);
  const slack = new SlackConfirm();
  const requiresApproval = targets.some((target) => targetRequiresApproval(slack, target));
  if (!requiresApproval || !slack.isConfigured()) {
    return { type: "ready" };
  }

  const pending = await getApprovalMigrations(migrator, action, targets, statuses);
  if (pending.length === 0) {
    return { type: "ready" };
  }

  const existing = await slack.getExistingRequest(pending);
  if (existing !== null) {
    const approval = await slack.checkApproval(existing.channel, existing.ts);
    if (approval.approved) {
      return { type: "ready" };
    }
    if (approval.rejected) {
      throw new BadRequestException(SD("sonamu.error.migrationRejected"));
    }
    return { type: "pending", ...existing };
  }

  const created = await slack.postApprovalRequest(pending, targets, requestor, action);
  await slack.saveRequest(pending, created.channel, created.ts);
  return { type: "pending", ...created };
}

/**
 * apply·rollback 실행 직전에 Slack 승인이 끝났는지 확인합니다.
 * 승인 대상이 아니면 null을, 승인된 요청이면 실행 로그를 남길 Slack 메시지를 반환합니다.
 */
async function requireApproved(
  migrator: Migrator,
  action: ApprovalAction,
  body: ApplyBody,
  statuses: MigrationConnectionStatus[],
): Promise<{ channel: string; ts: string } | null> {
  const slack = new SlackConfirm();
  const requiresApproval = body.targets.some((target) => targetRequiresApproval(slack, target));
  if (!requiresApproval || !slack.isConfigured()) {
    return null;
  }

  const pending = await getApprovalMigrations(migrator, action, body.targets, statuses);
  if (pending.length === 0) {
    return null;
  }

  const existing = await slack.getExistingRequest(pending);
  if (existing === null) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: "Slack approval has not been requested",
    });
  }
  const approval = await slack.checkApproval(existing.channel, existing.ts);
  if (approval.rejected) {
    throw new BadRequestException(SD("sonamu.error.migrationRejected"));
  }
  if (!approval.approved) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: "Slack approval is still pending",
    });
  }
  return existing;
}

async function runLegacyApply(
  migrator: Migrator,
  body: LegacyApplyBody,
): Promise<MigrationResult | SlackConfirmPendingResult> {
  assertTargets(migrator, body.targets);
  const statuses = await getAvailableTargetStatuses(migrator, body.targets);
  const slack = new SlackConfirm();
  const requiresApproval = body.targets.some((target) => targetRequiresApproval(slack, target));
  if (!requiresApproval || !slack.isConfigured()) {
    return migrator.apply(body.targets);
  }

  const pending = getPendingMigrations(statuses);
  if (pending.length === 0) {
    return migrator.apply(body.targets);
  }

  const existing = await slack.getExistingRequest(pending);
  if (existing === null) {
    const created = await slack.postApprovalRequest(pending, body.targets, body.requestor);
    await slack.saveRequest(pending, created.channel, created.ts);
    return { type: "pending", ...created };
  }

  const approval = await slack.checkApproval(existing.channel, existing.ts);
  if (approval.rejected) {
    throw new BadRequestException(SD("sonamu.error.migrationRejected"));
  }
  if (!approval.approved && !body.force) {
    return { type: "pending", ...existing };
  }
  if (!approval.approved) {
    await slack.forceApproval(
      existing.channel,
      existing.ts,
      body.forceReason ?? "사유 없음",
      body.requestor,
    );
  }

  const result = await migrator.apply(body.targets);
  if (result.length > 0) {
    await slack.logExecution(existing.channel, existing.ts, result, body.requestor);
  }
  return result;
}

/**
 * 이전 runAction 호출의 rollback 경로입니다.
 * 승인 대상이면 apply와 같이 요청을 만들거나 기존 승인 상태를 따르며, force 생략은 허용하지 않습니다.
 */
async function runLegacyRollback(
  migrator: Migrator,
  body: ApplyBody,
): Promise<MigrationResult | SlackConfirmPendingResult> {
  assertTargets(migrator, body.targets);
  const statuses = await getAvailableTargetStatuses(migrator, body.targets);
  const slack = new SlackConfirm();
  const requiresApproval = body.targets.some((target) => targetRequiresApproval(slack, target));
  if (!requiresApproval || !slack.isConfigured()) {
    return migrator.rollback(body.targets);
  }

  const pending = await getApprovalMigrations(migrator, "rollback", body.targets, statuses);
  if (pending.length === 0) {
    return migrator.rollback(body.targets);
  }

  const existing = await slack.getExistingRequest(pending);
  if (existing === null) {
    const created = await slack.postApprovalRequest(
      pending,
      body.targets,
      body.requestor,
      "rollback",
    );
    await slack.saveRequest(pending, created.channel, created.ts);
    return { type: "pending", ...created };
  }

  const approval = await slack.checkApproval(existing.channel, existing.ts);
  if (approval.rejected) {
    throw new BadRequestException(SD("sonamu.error.migrationRejected"));
  }
  if (!approval.approved) {
    return { type: "pending", ...existing };
  }

  const result = await migrator.rollback(body.targets);
  if (result.length > 0) {
    await slack.logExecution(existing.channel, existing.ts, result, body.requestor, "rollback");
  }
  return result;
}

function sendMigrationStream(
  reply: FastifyReply,
  action: MigrationAction,
  targets: MigrationTarget[],
  run: (onProgress: (event: MigrationProgressEvent) => void) => Promise<MigrationResult>,
  afterComplete?: (result: MigrationResult) => Promise<void>,
) {
  const stream = new PassThrough();
  let canWrite = true;
  let current: MigrationProgressEvent | undefined;
  const completedTargets: MigrationTarget[] = [];
  const write = (event: MigrationStreamEvent) => {
    if (canWrite && !stream.destroyed) {
      stream.write(`${JSON.stringify(event)}\n`);
    }
  };

  stream.on("close", () => {
    canWrite = false;
  });
  reply
    .header("content-type", "application/x-ndjson; charset=utf-8")
    .header("cache-control", "no-cache, no-transform")
    .header("content-encoding", "identity")
    .header("x-no-compression", "1");

  void (async () => {
    try {
      const result = await run((event) => {
        if (event.type === "target-complete") {
          if (event.connKey !== "shadow") completedTargets.push(event.connKey);
          write(event);
          // 다음 target의 lifecycle이 시작되기 전 오류를 직전 target에 잘못 귀속하지 않습니다.
          current = undefined;
          return;
        }
        current = event;
        write(event);
      });
      await afterComplete?.(result);
      write({ type: "complete", result });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      const failedTarget =
        caught instanceof MigrationTargetExecutionError ? caught.connKey : current?.connKey;
      write({
        type: "error",
        action,
        message,
        connKey: failedTarget,
        file:
          current?.type === "file-start" || current?.type === "file-executed"
            ? current.file
            : undefined,
        completedTargets,
        pendingTargets: targets.filter((target) => !completedTargets.includes(target)),
      });
    } finally {
      if (!stream.destroyed) {
        stream.end();
      }
    }
  })();

  return reply.send(stream);
}

export async function registerMigrationsApi(server: FastifyInstance) {
  // dev 서버 UI는 기본적으로 개발용 DB(development·test·fixture와 그 readonly)만 대상으로 받습니다.
  // `sonamu dev --deploy`(SONAMU_DEPLOY=yes)로 띄운 경우에만 staging·production 대상을 엽니다.
  const deployMode = process.env.SONAMU_DEPLOY === "yes";
  const migrator = deployMode
    ? new Migrator()
    : new Migrator({ excludedTargets: ["production"], targetFilter: isUIDBPreset });

  server.get("/api/migrations/connections", async () => ({
    connections: migrator.getConnections(),
  }));
  server.get("/api/migrations/codes", async () => ({ codes: await migrator.getMigrationCodes() }));
  server.get<{ Querystring: { codeName: string } }>("/api/migrations/code", (request) =>
    forwardAsyncErrors(async () => {
      const migrationCode = (await migrator.getMigrationCodes()).find(
        ({ name }) => name === request.query.codeName,
      );
      if (migrationCode === undefined) {
        throw new BadRequestException(SD("error.badRequest"));
      }
      return { code: await readFile(migrationCode.path, "utf8") };
    }),
  );
  server.get<{ Querystring: { connKey?: MigrationTarget } }>("/api/migrations/status", (request) =>
    forwardAsyncErrors(async () => {
      if (request.query.connKey === undefined) {
        return { status: await migrator.getStatus() };
      }
      return { status: await migrator.getConnectionStatus(request.query.connKey) };
    }),
  );
  server.get<{ Querystring: { compareConnKey: MigrationTarget } }>(
    "/api/migrations/prepared-codes",
    (request) =>
      forwardAsyncErrors(async () => ({
        preparedCodes: await migrator.getPreparedCodes(request.query.compareConnKey),
      })),
  );

  server.post<{ Body: ApprovalRequestBody }>("/api/migrations/request-approval", (request) =>
    forwardAsyncErrors(async () => {
      return requestApproval(migrator, request.body);
    }),
  );
  server.post<{ Body: { channel: string; ts: string } }>(
    "/api/migrations/checkApproval",
    (request) =>
      forwardAsyncErrors(async () => {
        const slack = new SlackConfirm();
        return slack.isConfigured()
          ? slack.checkApproval(request.body.channel, request.body.ts)
          : { approved: true, rejected: false };
      }),
  );
  server.post<{
    Body: { channel: string; ts: string; reason: string; requestor?: string };
  }>("/api/migrations/forceApproval", (request) =>
    forwardAsyncErrors(async () => {
      const slack = new SlackConfirm();
      if (!slack.isConfigured()) {
        throw new BadRequestException(SD("sonamu.error.slackConfirmNotConfigured"));
      }
      await slack.forceApproval(
        request.body.channel,
        request.body.ts,
        request.body.reason,
        request.body.requestor,
      );
      return { success: true };
    }),
  );

  server.post("/api/migrations/shadow", async (_request, reply) => {
    return sendMigrationStream(reply, "shadow", [], (onProgress) => {
      return migrator.runShadowTest({ onProgress });
    });
  });
  server.post<{ Body: ApplyBody }>("/api/migrations/apply", async (request, reply) => {
    assertTargets(migrator, request.body.targets);
    const statuses = await getAvailableTargetStatuses(migrator, request.body.targets);
    const approval = await requireApproved(migrator, "apply", request.body, statuses);
    return sendMigrationStream(
      reply,
      "apply",
      request.body.targets,
      (onProgress) => migrator.apply(request.body.targets, { onProgress }),
      approval === null
        ? undefined
        : async (result) => {
            await new SlackConfirm().logExecution(
              approval.channel,
              approval.ts,
              result,
              request.body.requestor,
            );
          },
    );
  });
  server.post<{ Body: ApplyBody }>("/api/migrations/rollback", async (request, reply) => {
    assertTargets(migrator, request.body.targets);
    const statuses = await getAvailableTargetStatuses(migrator, request.body.targets);
    // rollback은 데이터를 지울 수 있으므로 apply와 같은 Slack 승인을 거칩니다.
    const approval = await requireApproved(migrator, "rollback", request.body, statuses);
    return sendMigrationStream(
      reply,
      "rollback",
      request.body.targets,
      (onProgress) => migrator.rollback(request.body.targets, { onProgress }),
      approval === null
        ? undefined
        : async (result) => {
            await new SlackConfirm().logExecution(
              approval.channel,
              approval.ts,
              result,
              request.body.requestor,
              "rollback",
            );
          },
    );
  });

  server.post<{ Body: { compareConnKey?: MigrationTarget } }>(
    "/api/migrations/generatePreparedCodes",
    (request) =>
      forwardAsyncErrors(async () => migrator.generatePreparedCodes(request.body.compareConnKey)),
  );

  // 이전 UI 번들과 외부 스크립트가 새 서버에서도 한 릴리스 동안 동작하도록 유지합니다.
  server.post<{
    Body: {
      action: "apply" | "rollback" | "shadow";
      targets: (keyof SonamuDBConfig)[];
      force?: boolean;
      forceReason?: string;
      requestor?: string;
    };
  }>("/api/migrations/runAction", (request) =>
    forwardAsyncErrors(async () => {
      if (request.body.action === "shadow") {
        return migrator.runShadowTest();
      }
      if (request.body.action === "apply") {
        return runLegacyApply(migrator, request.body);
      }
      return runLegacyRollback(migrator, request.body);
    }),
  );
}
