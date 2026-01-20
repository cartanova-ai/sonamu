import ReactDOM from "react-dom/client";
import "./index.css";
import { TooltipProvider } from "@sonamu-kit/react-components";
import { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <TooltipProvider>
    <RouterProvider router={router} />,
  </TooltipProvider>,
);

// Chrome Extension용 Devtools
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: typeof queryClient;
  }
}
window.__TANSTACK_QUERY_CLIENT__ = queryClient;
