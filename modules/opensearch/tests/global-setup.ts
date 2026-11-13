import { type TestProject } from "vitest/node";

import {
  type OpenSearchEndpoint,
  type PostgresEndpoint,
  resolveOpenSearchImage,
  resolvePostgresImage,
  TEST_ENVIRONMENT_KEY,
} from "./helpers/env";
import { type StartedOpenSearch, startOpenSearch } from "./helpers/opensearch-container";
import { type StartedPostgres, startPostgres } from "./helpers/postgres-container";

type Stoppable = { stop(): Promise<void> };

/** Reference-counted container, stopped when the last reference is released. */
class SharedContainer<T extends Stoppable> {
  private references = 0;
  private started: Promise<T> | null = null;

  async acquire(start: () => Promise<T>): Promise<T> {
    this.references += 1;
    if (this.started === null) {
      const started = start();
      this.started = started;
      // A failed start is forgotten so the next acquire retries.
      started.catch(() => {
        if (this.started === started) {
          this.started = null;
        }
      });
    }
    try {
      return await this.started;
    } catch (error) {
      this.references -= 1;
      throw error;
    }
  }

  async release(): Promise<void> {
    this.references -= 1;
    if (this.references > 0 || this.started === null) {
      return;
    }
    const started = this.started;
    this.started = null;
    await (await started).stop();
  }
}

type ContainerRegistry = {
  postgres: SharedContainer<StartedPostgres>;
  opensearch: SharedContainer<StartedOpenSearch>;
};

// On globalThis, not in a module variable: vitest may evaluate this module once per project, and the integration and
// sonamu projects of one run must share the containers.
const REGISTRY_KEY = Symbol.for("sonamu.opensearch.test.containers");
type RegistryHost = { [REGISTRY_KEY]?: ContainerRegistry };

function registry(): ContainerRegistry {
  // SAFETY: only this module reads and writes the REGISTRY_KEY property, and it always holds a ContainerRegistry.
  const host = globalThis as typeof globalThis & RegistryHost;
  host[REGISTRY_KEY] ??= { postgres: new SharedContainer(), opensearch: new SharedContainer() };
  return host[REGISTRY_KEY];
}

// The sonamu project starts PostgreSQL only. If either start fails, the started one is stopped first; if the process is
// killed, testcontainers' Ryuk removes the session's containers.
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const containers = registry();
  const needsOpenSearch = project.name !== "sonamu";
  const acquired: Stoppable[] = [];
  const releaseAcquired = async (): Promise<void> => {
    const results = await Promise.allSettled(acquired.map((shared) => shared.stop()));
    acquired.length = 0;
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    if (failures.length > 0) {
      throw new AggregateError(failures, "테스트 컨테이너 정리에 실패했습니다.");
    }
  };
  const track = <T>(kind: SharedContainer<Stoppable>, started: T): T => {
    acquired.push({ stop: () => kind.release() });
    return started;
  };

  const [postgresResult, opensearchResult] = await Promise.allSettled([
    containers.postgres
      .acquire(() => startPostgres(resolvePostgresImage()))
      .then((started) => track(containers.postgres, started)),
    needsOpenSearch
      ? containers.opensearch
          .acquire(() => startOpenSearch(resolveOpenSearchImage()))
          .then((started) => track(containers.opensearch, started))
      : Promise.resolve(null),
  ]);
  if (postgresResult.status === "rejected" || opensearchResult.status === "rejected") {
    await releaseAcquired().catch(() => {});
    const reasons = [postgresResult, opensearchResult].flatMap((result) =>
      result.status === "rejected" ? [result.reason] : [],
    );
    throw new AggregateError(reasons, "테스트 컨테이너를 시작하지 못했습니다.");
  }

  const postgres = postgresResult.value;
  const postgresEndpoint: PostgresEndpoint = {
    image: postgres.image,
    host: postgres.host,
    port: postgres.port,
    user: postgres.user,
    password: postgres.password,
    database: postgres.database,
    url: postgres.url,
    containerId: postgres.containerId,
    twinPort: postgres.twinPort,
  };
  const opensearch = opensearchResult.value;
  const opensearchEndpoint: OpenSearchEndpoint | null =
    opensearch === null ? null : { image: opensearch.image, url: opensearch.url };
  project.provide(TEST_ENVIRONMENT_KEY, {
    postgres: postgresEndpoint,
    opensearch: opensearchEndpoint,
  });

  return releaseAcquired;
}
