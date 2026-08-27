import { useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Suspense, useEffect } from "react";
import { type ReactNode } from "react";

import Sidebar from "./components/Sidebar";
import { SUPPORTED_LOCALES, setLocale } from "./i18n/sd.generated";

type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(locale: string): locale is SupportedLocale {
  return SUPPORTED_LOCALES.some((supportedLocale) => supportedLocale === locale);
}

interface AppProps {
  children?: ReactNode;
}

function App({ children }: AppProps) {
  useEffect(() => {
    // 브라우저 locale 감지
    const browserLocale = navigator.language.split("-")[0];
    if (isSupportedLocale(browserLocale)) {
      setLocale(browserLocale);
    }
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isLoginPage = pathname === "/admin/login";

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
