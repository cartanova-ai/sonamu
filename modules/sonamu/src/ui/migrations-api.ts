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

type ApprovalReady = { type: "ready" };
type ApprovalResult = ApprovalReady | SlackConfirmPendingResult;
type ApplyBody = { targets: MigrationTarget[]; requestor?: string };
type LegacyApplyBody = ApplyBody & { force?: boolean; forceReason?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function assertTargets(migrator: Migrator, targets: MigrationTarget[]): void {
  const allowed = new Set(migrator.getConnections().map(({ connKey }) => connKey));
  const invalid = targets.filter((target) => !allowed.has(target));
  if (targets.length === 0 || invalid.length > 0) {
    throw new BadRequestException(SD("error.badRequest"), {
      message: `Invalid migration targets: ${invalid.length === 0 ? "(empty)" : invalid.join(", ")}`,
    });
  }
}

function targetRequiresApproval(slack: SlackConfirm, target: MigrationTarget): boolean {
  const connection = Sonamu.dbConfig[target]?.connection as { host?: string } | undefined;
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

async function requestApproval(
  migrator: Migrator,
  targets: MigrationTarget[],
  requestor?: string,
): Promise<ApprovalResult> {
  assertTargets(migrator, targets);
  const statuses = await getAvailableTargetStatuses(migrator, targets);
  const slack = new SlackConfirm();
  const requiresApproval = targets.some((target) => targetRequiresApproval(slack, target));
  if (!requiresApproval || !slack.isConfigured()) {
    return { type: "ready" };
  }

  const pending = getPendingMigrations(statuses);
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

  const created = await slack.postApprovalRequest(pending, targets, requestor);
  await slack.saveRequest(pending, created.channel, created.ts);
  return { type: "pending", ...created };
}

async function requireApprovedApply(
  body: ApplyBody,
  statuses: MigrationConnectionStatus[],
): Promise<{ channel: string; ts: string } | null> {
  const slack = new SlackConfirm();
  const requiresApproval = body.targets.some((target) => targetRequiresApproval(slack, target));
  if (!requiresApproval || !slack.isConfigured()) {
    return null;
  }

  const pending = getPendingMigrations(statuses);
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
  const migrator = new Migrator();

  server.get("/api/migrations/connections", async () => ({
    connections: migrator.getConnections(),
  }));
  server.get("/api/migrations/codes", async () => ({ codes: await migrator.getMigrationCodes() }));
  server.get<{ Querystring: { codeName: string } }>("/api/migrations/code", async (request) => {
    const migrationCode = (await migrator.getMigrationCodes()).find(
      ({ name }) => name === request.query.codeName,
    );
    if (migrationCode === undefined) {
      throw new BadRequestException(SD("error.badRequest"));
    }
    return { code: await readFile(migrationCode.path, "utf8") };
  });
  server.get<{ Querystring: { connKey?: MigrationTarget } }>(
    "/api/migrations/status",
    async (request) => {
      if (request.query.connKey === undefined) {
        return { status: await migrator.getStatus() };
      }
      return { status: await migrator.getConnectionStatus(request.query.connKey) };
    },
  );
  server.get<{ Querystring: { compareConnKey: MigrationTarget } }>(
    "/api/migrations/prepared-codes",
    async (request) => ({
      preparedCodes: await migrator.getPreparedCodes(request.query.compareConnKey),
    }),
  );

  server.post<{ Body: ApplyBody }>("/api/migrations/request-approval", async (request) => {
    return requestApproval(migrator, request.body.targets, request.body.requestor);
  });
  server.post<{ Body: { channel: string; ts: string } }>(
    "/api/migrations/checkApproval",
    async (request) => {
      const slack = new SlackConfirm();
      return slack.isConfigured()
        ? slack.checkApproval(request.body.channel, request.body.ts)
        : { approved: true, rejected: false };
    },
  );
  server.post<{
    Body: { channel: string; ts: string; reason: string; requestor?: string };
  }>("/api/migrations/forceApproval", async (request) => {
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
  });

  server.post("/api/migrations/shadow", async (_request, reply) => {
    return sendMigrationStream(reply, "shadow", [], (onProgress) => {
      return migrator.runShadowTest({ onProgress });
    });
  });
  server.post<{ Body: ApplyBody }>("/api/migrations/apply", async (request, reply) => {
    assertTargets(migrator, request.body.targets);
    const statuses = await getAvailableTargetStatuses(migrator, request.body.targets);
    const approval = await requireApprovedApply(request.body, statuses);
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
  server.post<{ Body: { targets: MigrationTarget[] } }>(
    "/api/migrations/rollback",
    async (request, reply) => {
      assertTargets(migrator, request.body.targets);
      await getAvailableTargetStatuses(migrator, request.body.targets);
      return sendMigrationStream(reply, "rollback", request.body.targets, (onProgress) => {
        return migrator.rollback(request.body.targets, { onProgress });
      });
    },
  );

  server.post<{ Body: { codeNames: string[] } }>("/api/migrations/delCodes", async (request) =>
    migrator.deleteCodes(request.body.codeNames),
  );
  server.post<{ Body: { compareConnKey?: MigrationTarget } }>(
    "/api/migrations/generatePreparedCodes",
    async (request) => migrator.generatePreparedCodes(request.body.compareConnKey),
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
  }>("/api/migrations/runAction", async (request) => {
    if (request.body.action === "shadow") {
      return migrator.runShadowTest();
    }
    if (request.body.action === "apply") {
      return runLegacyApply(migrator, request.body);
    }
    assertTargets(migrator, request.body.targets);
    await getAvailableTargetStatuses(migrator, request.body.targets);
    return migrator.runAction(request.body.action, request.body.targets);
  });
}
