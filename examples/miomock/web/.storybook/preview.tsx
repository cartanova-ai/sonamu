import { type Decorator, type Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Agentation } from "agentation";
import { Provider as JotaiProvider, createStore } from "jotai";
import { useEffect, useMemo } from "react";
import { z } from "zod";

import { SonamuProvider } from "@/contexts/sonamu-provider";
import { SUPPORTED_LOCALES, setLocale } from "@/i18n/sd.generated";

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

import "../src/styles/tailwind.css";

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : input.toString();
  if (url.includes("/api/auth/get-session")) {
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

const withProviders: Decorator = (Story, ctx) => {
  const pathname = z.string().catch("/admin").parse(ctx.parameters.router?.pathname);
  const locale: SupportedLocale = z.enum(SUPPORTED_LOCALES).catch("ko").parse(ctx.globals.locale);

  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
        },
      }),
    [ctx.id],
  );

  const jotaiStore = useMemo(() => createStore(), [ctx.id]);

  const router = useMemo(() => {
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const splatRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "$",
      component: () => <Story />,
    });
    return createRouter({
      routeTree: rootRoute.addChildren([splatRoute]),
      history: createMemoryHistory({ initialEntries: [pathname] }),
    });
  }, [pathname, ctx.id, Story]);

  return (
    <QueryClientProvider client={queryClient}>
      <JotaiProvider store={jotaiStore}>
        <SonamuProvider>
          <RouterProvider key={`${pathname}:${ctx.id}`} router={router} />
          <Agentation endpoint="http://localhost:4747" />
        </SonamuProvider>
      </JotaiProvider>
    </QueryClientProvider>
  );
};

const preview: Preview = {
  parameters: {
    router: { pathname: "/admin" },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  globalTypes: {
    locale: {
      name: "Locale",
      description: "Internationalization locale",
      toolbar: {
        icon: "globe",
        items: [
          { value: "ko", title: "한국어" },
          { value: "en", title: "English" },
          { value: "ja", title: "日本語" },
        ],
      },
    },
  },
  initialGlobals: { locale: "ko" },
  decorators: [withProviders],
};

export default preview;
