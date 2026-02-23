import type { FastifyInstance } from "fastify";
import type { SonamuDevRunnerConfig } from "../api/config";
import { Sonamu } from "../api/sonamu";
import type { ManagerStatus, RunResult } from "./dev-vitest-manager";
import { DevVitestManager } from "./dev-vitest-manager";

export async function registerDevTestRoutes(
  server: FastifyInstance,
  config: SonamuDevRunnerConfig,
): Promise<void> {
  const prefix = config.routePrefix ?? "/__test__";

  const manager = new DevVitestManager();
  await manager.start(config.vitestConfigPath);
  Sonamu.devVitestManager = manager;

  server.post(`${prefix}/run`, async (request, reply) => {
    if (!Sonamu.devVitestManager) {
      reply.status(503);
      return { ok: false, error: "DevVitestManager is not initialized" };
    }
    try {
      const body = request.body as { files?: string[]; pattern?: string } | null;
      const result: RunResult = await Sonamu.devVitestManager.run({
        files: body?.files,
        pattern: body?.pattern,
      });
      return result;
    } catch (err) {
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
    return status;
  });

  server.addHook("onClose", async () => {
    await Sonamu.devVitestManager?.shutdown();
    Sonamu.devVitestManager = null;
  });
}
