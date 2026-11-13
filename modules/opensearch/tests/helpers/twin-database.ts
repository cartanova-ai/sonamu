import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { type IntegrationHarness } from "./harness";
import { POSTGRES_TWIN_PORT } from "./postgres-container";

const run = promisify(execFile);
// A byte-for-byte pg_basebackup copy served by a second postmaster: system identifier, database OID and every row equal
// the source's, so origin records cannot tell them apart. One copy at a time (one port).
const TWIN_DIRECTORY = "/tmp/sonamu-twin";

export interface PhysicalTwin {
  url(database: string): string;
  stop(): Promise<void>;
  readonly startedInMs: number;
}

function containerOf(h: IntegrationHarness): string {
  const container = h.env.postgres.containerId;
  if (container === undefined) throw new Error("PostgreSQL 컨테이너 ID가 없습니다 (global-setup).");
  return container;
}

async function asPostgres(container: string, command: string): Promise<void> {
  await run("docker", ["exec", "-u", "postgres", container, "bash", "-c", command]);
}

async function stopTwin(container: string): Promise<void> {
  await asPostgres(
    container,
    `if [ -f ${TWIN_DIRECTORY}/postmaster.pid ]; then pg_ctl -D ${TWIN_DIRECTORY} -m immediate -w stop >/dev/null 2>&1 || true; fi; rm -rf ${TWIN_DIRECTORY}`,
  );
}

export async function startPhysicalTwin(h: IntegrationHarness): Promise<PhysicalTwin> {
  const container = containerOf(h);
  const twinPort = h.env.postgres.twinPort;
  if (twinPort === undefined) throw new Error("복사본 포트가 없습니다 (global-setup).");
  const started = performance.now();
  await stopTwin(container);
  await asPostgres(
    container,
    `pg_basebackup -D ${TWIN_DIRECTORY} -X stream -c fast -U postgres && pg_ctl -D ${TWIN_DIRECTORY} -w -t 60 -l ${TWIN_DIRECTORY}.log -o "-p ${POSTGRES_TWIN_PORT} -c listen_addresses='*' -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=100" start >/dev/null`,
  );
  const startedInMs = Math.round(performance.now() - started);
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    await stopTwin(container);
  };
  h.onCleanup(stop);
  return {
    url(database) {
      const parsed = new URL(h.env.postgres.url);
      parsed.port = String(twinPort);
      parsed.pathname = `/${database}`;
      return parsed.toString();
    },
    stop,
    startedInMs,
  };
}
