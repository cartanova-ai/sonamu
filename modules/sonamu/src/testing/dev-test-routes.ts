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
  heartbeat: z.object({
    schemaVersion: z.number(),
    at: z.string(),
  }),
});

type TestEvents = z.infer<typeof TestEventSchema>;

function relativizeTrace(trace: SerializedTrace, prefix: string): SerializedTrace {
  return { ...trace, filePath: trace.filePath.replace(prefix, "") };
}

function relativizeNode(node: TestCaseResult, prefix: string): TestCaseResult {
  return {
    ...node,
    name: node.name.replace(prefix, ""),
    traces: node.traces.map((t) => relativizeTrace(t, prefix)),
    children: node.children.map((c) => relativizeNode(c, prefix)),
  };
}

function relativizeResult(result: RunResult, basePath: string): RunResult {
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
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

      const listener = (event: string, data: unknown) => {
        const key = event as keyof TestEvents;
        sse.publish(key, data as TestEvents[typeof key]);
      };
      manager.addEventListener(listener);

      request.socket.on("close", () => {
        clearInterval(heartbeatTimer);
        manager.removeEventListener(listener);
      });
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

      const rawResult: RunResult = await Sonamu.devVitestManager.run(runRequest);
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
