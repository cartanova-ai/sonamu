import { useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { type ReactNode, Suspense, useEffect } from "react";
import { useAuth } from "./admin-common/auth";
import Sidebar from "./components/Sidebar";
import { setLocale } from "./i18n/sd.generated";

interface AppProps {
  children?: ReactNode;
}

function App({ children }: AppProps) {
  useEffect(() => {
    // 브라우저 locale 감지
    const browserLocale = navigator.language.split("-")[0];
    if (["ko", "en"].includes(browserLocale)) {
      setLocale(browserLocale);
    }
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user: _ } = useAuth();

  const isLoginPage = pathname === "/admin/login" || pathname === "/admin/login-test";

  return (
    <div className="h-screen">
      <div className="flex h-screen md:flex-row flex-col">
        {!isLoginPage && <Sidebar />}
        <div className="flex-1 p-8 md:p-4 bg-white">
          <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
        </div>
      </div>
      {import.meta.env.DEV && <TanStackRouterDevtools initialIsOpen={false} />}
    </div>
  );
}

export default App;
