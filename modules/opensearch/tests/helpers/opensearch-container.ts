import { Client } from "@opensearch-project/opensearch";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";

import { CONTAINER_LABEL_KEY, CONTAINER_LABEL_VALUE, type OpenSearchEndpoint } from "./env";

export type StartedOpenSearch = OpenSearchEndpoint & {
  containerId: string;
  stop(): Promise<void>;
};

const OPENSEARCH_PORT = 9200;

export async function startOpenSearch(image: string): Promise<StartedOpenSearch> {
  const container: StartedTestContainer = await new GenericContainer(image)
    .withEnvironment({
      "discovery.type": "single-node",
      DISABLE_SECURITY_PLUGIN: "true",
      DISABLE_INSTALL_DEMO_CONFIG: "true",
      OPENSEARCH_JAVA_OPTS: "-Xms512m -Xmx512m",
    })
    .withUlimits({ nofile: { soft: 65536, hard: 65536 } })
    .withExposedPorts(OPENSEARCH_PORT)
    .withLabels({ [CONTAINER_LABEL_KEY]: CONTAINER_LABEL_VALUE })
    .withWaitStrategy(
      Wait.forHttp(
        "/_cluster/health?wait_for_status=yellow&timeout=5s",
        OPENSEARCH_PORT,
      ).forStatusCode(200),
    )
    .withStartupTimeout(240_000)
    .start();
  let stopped = false;
  return {
    image,
    url: `http://${container.getHost()}:${container.getMappedPort(OPENSEARCH_PORT)}`,
    containerId: container.getId(),
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      await container.stop({ remove: true, removeVolumes: true });
    },
  };
}

export function createOpenSearchClient(url: string): Client {
  return new Client({ node: url, maxRetries: 0, requestTimeout: 30_000 });
}
