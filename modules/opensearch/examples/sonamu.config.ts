import { SearchError, setSearchLocale } from "@sonamu-kit/opensearch";
import { createSearchCliPlugin } from "@sonamu-kit/opensearch/sonamu";
import { defineConfig } from "sonamu";

import { registerJapaneseSearchMessages, toSearchErrorResponse } from "./search/errors";
import { searchLifecycle } from "./search/worker";

registerJapaneseSearchMessages();
// An explicit setSearchLocale overrides Sonamu's i18n.defaultLocale.
if (process.env.SEARCH_LOCALE !== undefined) setSearchLocale(process.env.SEARCH_LOCALE);

export default defineConfig({
  api: { dir: "api", route: { prefix: "/api" } },
  i18n: { defaultLocale: "ko", supportedLocales: ["ko", "en", "ja"] },
  sync: { targets: ["web"] },
  database: {},
  cli: {
    // Loaded lazily, so evaluating this config never imports the search setup.
    plugins: [
      createSearchCliPlugin({
        load: async () => (await import("./search/cli-setup")).chatSearchCliSetup(),
      }),
    ],
  },
  server: {
    // Authenticate and authorize here; chat-message.search.ts re-checks authorization of each search hit.
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => {},
    },
    lifecycle: {
      onStart: () => searchLifecycle.onStart(),
      onShutdown: () => searchLifecycle.onShutdown(),
      onError: async (error, request, reply) => {
        if (!(error instanceof SearchError)) throw error;
        const locale = request.headers["accept-language"]?.split(",")[0] ?? "en";
        const response = toSearchErrorResponse(error, locale);
        await reply.status(response.status).send(response.body);
      },
    },
  },
});
