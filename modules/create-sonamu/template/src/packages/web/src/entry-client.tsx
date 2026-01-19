import { hydrate, QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles/tailwind.css";

// SSR data types
declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: SSR data needs to be any type
    __SONAMU_SSR__?: any;
    __SONAMU_SSR_CONFIG__?: {
      disableHydrate?: boolean;
    };
  }
}

// Date reviver function for JSON.parse
// biome-ignore lint/suspicious/noExplicitAny: reviver needs to handle any type
function dateReviver(_key: string, value: any) {
  if (typeof value === "string") {
    const datePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    if (datePattern.test(value)) {
      return new Date(value);
    }
  }
  return value;
}

// Create QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: false,
      refetchOnMount: true,
    },
  },
});

// Restore SSR data
const dehydratedState = window.__SONAMU_SSR__
  ? JSON.parse(JSON.stringify(window.__SONAMU_SSR__), dateReviver)
  : undefined;
if (dehydratedState) {
  hydrate(queryClient, dehydratedState);
}

// Check SSR Config
const ssrConfig = window.__SONAMU_SSR_CONFIG__;

// Create Router
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML || ssrConfig?.disableHydrate) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
} else {
  ReactDOM.hydrateRoot(rootElement, <RouterProvider router={router} />);
}
