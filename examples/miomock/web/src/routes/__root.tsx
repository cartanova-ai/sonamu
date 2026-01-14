import { SonamuProvider } from "@sonamu-kit/react-components";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type React from "react";
import App from "@/App";
import { createSonamuConfig } from "@/config/sonamu-provider.config";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Miomock: Sonamu shines evergreen" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/sonamu.svg" />
        <HeadContent />
      </head>
      <body>
        <div id="root">
          <QueryClientProvider client={queryClient}>
            <SonamuProviderWrapper>
              <App>
                <Outlet />
              </App>
            </SonamuProviderWrapper>
          </QueryClientProvider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

function SonamuProviderWrapper({ children }: { children: React.ReactNode }) {
  const sonamuConfig = createSonamuConfig();
  return <SonamuProvider {...sonamuConfig}>{children}</SonamuProvider>;
}
