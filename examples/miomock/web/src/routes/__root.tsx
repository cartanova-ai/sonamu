import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";
import App from "@/App";
import { AuthProvider } from "@/admin-common/auth";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AuthProvider>
      <App>
        <Outlet />
      </App>
      <TanStackRouterDevtools />
    </AuthProvider>
  ),
});
