import { TooltipProvider } from "@sonamu-kit/react-components";

import "./index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { SonamuProviderWrapper } from "./contexts/sonamu-provider";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 3,
      retryDelay: 3000,
    },
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const router = createRouter({
  routeTree,
  context: { queryClient },
  basepath: import.meta.env.BASE_URL,
});

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Sonamu UI 루트 엘리먼트를 찾을 수 없습니다.");
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <SonamuProviderWrapper>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </SonamuProviderWrapper>
  </QueryClientProvider>,
);

// Chrome Extension용 Devtools
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: typeof queryClient;
  }
}
Object.assign(window, { __TANSTACK_QUERY_CLIENT__: queryClient });
