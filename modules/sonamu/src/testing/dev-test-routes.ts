import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SonamuDevRunnerConfig } from "../api/config";
import { Sonamu } from "../api/sonamu";
import type { SerializedTrace } from "../naite/naite";
import { createSSEFactory, type SSEConnection } from "../stream/sse";
import type { ManagerStatus, RunResult, TestCaseResult } from "./dev-vitest-manager";
import { DevVitestManager } from "./dev-vitest-manager";

const SCHEMA_VERSION = 1;
const HEARTBEAT_INTERVAL_MS = 30_000;

const SerializedTraceSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  filePath: z.string(),
  lineNumber: z.number(),
  at: z.string(),
});

const TestCaseResultSchema: z.ZodType<TestCaseResult> = z.lazy(() =>
  z.object({
    id: z.string(),
    kind: z.enum(["file", "suite", "test"]),
    name: z.string(),
    fullName: z.string(),
    file: z.string(),
    state: z.enum(["passed", "failed", "skipped", "todo", "running", "unknown"]),
    durationMs: z.number().nullable(),
    counts: z.object({
      total: z.number(),
      passed: z.number(),
      failed: z.number(),
      skipped: z.number(),
    }),
    error: z
      .object({
        message: z.string(),
        stack: z.string().optional(),
      })
      .nullable(),
    traces: z.array(SerializedTraceSchema),
    children: z.array(TestCaseResultSchema),
  }),
);

const TestEventSchema = z.object({
  snapshot: z.object({
    schemaVersion: z.number(),
    serverTime: z.string(),
    status: z.object({
      ready: z.boolean(),
      running: z.boolean(),
      lastRunAt: z.string().nullable(),
    }),
  }),
  runQueued: z.object({
    schemaVersion: z.number(),
    runId: z.string(),
    queuedAt: z.string(),
    request: z.object({
      files: z.array(z.string()).optional(),
      pattern: z.string().optional(),
    }),
  }),
  runStarted: z.object({
    schemaVersion: z.number(),
    runId: z.string(),
    startedAt: z.string(),
  }),
  runCompleted: z.object({
    schemaVersion: z.number(),
    runId: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
    result: z.record(z.string(), z.unknown()),
  }),
  runErrored: z.object({
    schemaVersion: z.number(),
    runId: z.string(),
    finishedAt: z.string(),
    error: z.object({
      message: z.string(),
      stack: z.string().optional(),
    }),
  }),
  runNodeProgress: z.object({
    schemaVersion: z.literal(1),
    runId: z.string(),
    startedAt: z.string(),
    at: z.string(),
    kind: z.enum(["file", "suite", "test"]),
    phase: z.enum(["ready", "result"]),
    fileId: z.string(),
    nodeId: z.string(),
    parentId: z.string().nullable(),
    node: TestCaseResultSchema,
  }),
  heartbeat: z.object({
    schemaVersion: z.number(),
    at: z.string(),
  }),
});

type TestEvents = z.infer<typeof TestEventSchema>;

function toPathPrefix(basePath: string): string {
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

function relativizeTrace(trace: SerializedTrace, prefix: string): SerializedTrace {
  return { ...trace, filePath: trace.filePath.replace(prefix, "") };
}

function relativizeNode(node: TestCaseResult, basePath: string): TestCaseResult {
  const prefix = toPathPrefix(basePath);
  return {
    ...node,
    name: node.name.replace(prefix, ""),
    file: node.file.replace(prefix, ""),
    traces: node.traces.map((t) => relativizeTrace(t, prefix)),
    children: node.children.map((c) => relativizeNode(c, prefix)),
  };
}

function isRunNodeProgressData(data: unknown): data is TestEvents["runNodeProgress"] {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d.schemaVersion === 1 &&
    typeof d.runId === "string" &&
    typeof d.startedAt === "string" &&
    typeof d.at === "string" &&
    (d.kind === "file" || d.kind === "suite" || d.kind === "test") &&
    (d.phase === "ready" || d.phase === "result") &&
    typeof d.fileId === "string" &&
    typeof d.nodeId === "string" &&
    (d.parentId === null || typeof d.parentId === "string") &&
    typeof d.node === "object" &&
    d.node !== null
  );
}

function relativizeResult(result: RunResult, basePath: string): RunResult {
  const prefix = toPathPrefix(basePath);
  return {
    ...result,
    results: result.results.map((n) => relativizeNode(n, prefix)),
  };
}

export async function registerDevTestRoutes(
  server: FastifyInstance,
  config: SonamuDevRunnerConfig,
): Promise<void> {
  const prefix = config.routePrefix ?? "/__test__";

  const manager = new DevVitestManager();
  await manager.start(config.vitestConfigPath);
  Sonamu.devVitestManager = manager;

  const sseAvailable = !!Sonamu.config.server.plugins?.sse;

  if (sseAvailable) {
    server.get(`${prefix}/events`, (request, reply): void => {
      const sse: SSEConnection<typeof TestEventSchema> = createSSEFactory(
        request.socket,
        reply,
        TestEventSchema,
      );

      const status: ManagerStatus = manager.getStatus();
      sse.publish("snapshot", {
        schemaVersion: SCHEMA_VERSION,
        serverTime: new Date().toISOString(),
        status,
      });

      const heartbeatTimer = setInterval(() => {
        sse.publish("heartbeat", {
          schemaVersion: SCHEMA_VERSION,
          at: new Date().toISOString(),
        });
      }, HEARTBEAT_INTERVAL_MS);

      const basePath = Sonamu.apiRootPath;
      const listener = (event: string, data: unknown) => {
        const key = event as keyof TestEvents;
        if (key === "runNodeProgress") {
          if (!isRunNodeProgressData(data)) return;
          const relativized = {
            ...data,
            node: relativizeNode(data.node, basePath),
          };
          sse.publish(key, relativized);
          return;
        }
        sse.publish(key, data as TestEvents[typeof key]);
      };
      manager.addEventListener(listener);

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        clearInterval(heartbeatTimer);
        manager.removeEventListener(listener);
      };
      request.socket.on("close", cleanup);
      request.socket.on("error", cleanup);
    });
  }

  server.post(`${prefix}/run`, async (request, reply) => {
    if (!Sonamu.devVitestManager) {
      reply.status(503);
      return { ok: false, error: "DevVitestManager is not initialized" };
    }

    const runId = randomUUID();
    const body = request.body as { files?: string[]; pattern?: string } | null;
    const runRequest = {
      files: body?.files,
      pattern: body?.pattern,
    };

    manager.emitEvent("runQueued", {
      schemaVersion: SCHEMA_VERSION,
      runId,
      queuedAt: new Date().toISOString(),
      request: runRequest,
    });

    try {
      const startedAt = new Date().toISOString();
      manager.emitEvent("runStarted", {
        schemaVersion: SCHEMA_VERSION,
        runId,
        startedAt,
      });

      const rawResult: RunResult = await Sonamu.devVitestManager.run(runRequest, runId);
      const result = relativizeResult(rawResult, Sonamu.apiRootPath);

      const finishedAt = new Date().toISOString();
      manager.emitEvent("runCompleted", {
        schemaVersion: SCHEMA_VERSION,
        runId,
        startedAt,
        finishedAt,
        result,
      });

      return result;
    } catch (err) {
      const finishedAt = new Date().toISOString();
      manager.emitEvent("runErrored", {
        schemaVersion: SCHEMA_VERSION,
        runId,
        finishedAt,
        error: {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
      });

      reply.status(500);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  server.get(`${prefix}/status`, async () => {
    const status: ManagerStatus = Sonamu.devVitestManager?.getStatus() ?? {
      ready: false,
      running: false,
      lastRunAt: null,
    };
    return { ...status, sseAvailable };
  });

  server.addHook("onClose", async () => {
    await Sonamu.devVitestManager?.shutdown();
    Sonamu.devVitestManager = null;
  });
}
