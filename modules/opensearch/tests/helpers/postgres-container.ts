import { randomBytes } from "node:crypto";

import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

import { CONTAINER_LABEL_KEY, CONTAINER_LABEL_VALUE, type PostgresEndpoint } from "./env";

export type StartedPostgres = PostgresEndpoint & {
  containerId: string;
  twinPort: number;
  stop(): Promise<void>;
};

const POSTGRES_PORT = 5432;
export const POSTGRES_TWIN_PORT = 5433;

export async function startPostgres(image: string): Promise<StartedPostgres> {
  const password = randomBytes(12).toString("hex");
  const container: StartedTestContainer = await new GenericContainer(image)
    .withEnvironment({
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: "postgres",
    })
    .withCommand([
      "postgres",
      "-c",
      "fsync=off",
      "-c",
      "synchronous_commit=off",
      "-c",
      "full_page_writes=off",
      "-c",
      "max_connections=300",
    ])
    .withExposedPorts(POSTGRES_PORT, POSTGRES_TWIN_PORT)
    .withLabels({ [CONTAINER_LABEL_KEY]: CONTAINER_LABEL_VALUE })
    // The official entrypoint restarts once after initdb, so the ready message must appear twice.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .withStartupTimeout(120_000)
    .start();
  const host = container.getHost();
  const port = container.getMappedPort(POSTGRES_PORT);
  const twinPort = container.getMappedPort(POSTGRES_TWIN_PORT);
  let stopped = false;
  return {
    image,
    host,
    port,
    user: "postgres",
    password,
    database: "postgres",
    url: `postgres://postgres:${password}@${host}:${port}/postgres`,
    containerId: container.getId(),
    twinPort,
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      await container.stop({ remove: true, removeVolumes: true });
    },
  };
}
