import { useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { type ReactNode, Suspense } from "react";
import { useAuth } from "./admin-common/auth";
import Sidebar from "./components/Sidebar";

interface AppProps {
  children?: ReactNode;
}

function App({ children }: AppProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user: _ } = useAuth();

  const isLoginPage = pathname === "/admin/login" || pathname === "/admin/login-test";

  return (
    <div className="h-screen">
      <div className="flex h-screen md:flex-row flex-col">
        {!isLoginPage && <Sidebar />}
        <div className="flex-1 p-8 md:p-4 bg-white overflow-auto">
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </div>
      </div>
      {import.meta.env.DEV && <TanStackRouterDevtools initialIsOpen={false} />}
    </div>
  );
}

export default App;
