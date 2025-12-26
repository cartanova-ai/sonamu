import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, Suspense } from "react";
import "./App.css";
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
    <div className="app">
      <div className="app-layout">
        {!isLoginPage && <Sidebar />}
        <div className="app-content">
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </div>
      </div>
    </div>
  );
}

export default App;
