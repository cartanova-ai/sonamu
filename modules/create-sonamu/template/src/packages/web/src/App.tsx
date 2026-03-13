import { SidebarProvider } from "@sonamu-kit/react-components/components";
import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, Suspense, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import { SUPPORTED_LOCALES, setLocale } from "./i18n/sd.generated";

interface AppProps {
  children?: ReactNode;
}

// 사이드바를 숨길 경로 목록
// TODO: 로그인/회원가입 페이지 추가 시 여기에 추가
const hideSidebarPaths = ["/login", "/admin/login", "/signup"];

function App({ children }: AppProps) {
  useEffect(() => {
    // 브라우저 locale 감지
    const browserLocale = navigator.language.split("-")[0];
    if (SUPPORTED_LOCALES.includes(browserLocale as (typeof SUPPORTED_LOCALES)[number])) {
      setLocale(browserLocale as (typeof SUPPORTED_LOCALES)[number]);
    }
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const showSidebar = !hideSidebarPaths.includes(pathname);

  return (
    <>
      <SidebarProvider className="h-screen">
        <div className="flex h-screen md:flex-row flex-col w-full">
          {showSidebar && <Sidebar />}
          <div className="flex-1 p-8 md:p-4 bg-white overflow-auto">
            <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>
          </div>
        </div>
      </SidebarProvider>
    </>
  );
}

export default App;
