import { SearchError } from "@sonamu-kit/opensearch";
import { defineConfig } from "sonamu";

import { searchClient } from "./search/client";
import { toSearchErrorResponse } from "./search/errors";
import { initializeSearchStore } from "./search/startup";

/** Fix the store identity in onReady, after database setup and before listen; the worker runs in standalone-worker.ts. */
export default defineConfig({
  api: { dir: "api", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en"] },
  sync: { targets: ["web"] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => {},
    },
    plugins: {
      custom: (server) => {
        server.addHook("onReady", initializeSearchStore);
      },
    },
    lifecycle: {
      onShutdown: () => searchClient.close(),
      onError: async (error, request, reply) => {
        if (!(error instanceof SearchError)) throw error;
        const response = toSearchErrorResponse(error, request.headers["accept-language"] ?? "en");
        await reply.status(response.status).send(response.body);
      },
    },
  },
});
