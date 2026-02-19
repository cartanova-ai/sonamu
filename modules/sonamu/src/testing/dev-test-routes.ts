import type { FastifyInstance } from "fastify";
import type { SonamuDevRunnerConfig } from "../api/config";
import type { ManagerStatus, RunResult } from "./dev-vitest-manager";
import { DevVitestManager } from "./dev-vitest-manager";

const manager = new DevVitestManager();

export async function registerDevTestRoutes(
  server: FastifyInstance,
  config: SonamuDevRunnerConfig,
): Promise<void> {
  const prefix = config.routePrefix ?? "/__test__";

  await manager.start(config.vitestConfigPath);

  server.post(`${prefix}/run`, async (request, reply) => {
    try {
      const body = request.body as { files?: string[]; pattern?: string } | null;
      const result: RunResult = await manager.run({
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
    const status: ManagerStatus = manager.getStatus();
    return status;
  });

  server.addHook("onClose", async () => {
    await manager.shutdown();
  });
}
