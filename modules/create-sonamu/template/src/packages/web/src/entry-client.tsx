import { hydrate, QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { routeTree } from "./routeTree.gen";
import "./styles/tailwind.css";
import { dateReviver } from "./services/sonamu.shared";

// SSR 데이터 타입
declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: SSR 데이터를 any 타입으로 받아야 함
    __SONAMU_SSR__?: any;
    __SONAMU_SSR_CONFIG__?: {
      disableHydrate?: boolean;
    };
  }
}

// QueryClient 생성
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: false,
      refetchOnMount: true,
    },
  },
});

// SSR 데이터 복원
const dehydratedState = window.__SONAMU_SSR__
  ? JSON.parse(JSON.stringify(window.__SONAMU_SSR__), dateReviver)
  : undefined;
if (dehydratedState) {
  hydrate(queryClient, dehydratedState);
}

// SSR Config 확인
const ssrConfig = window.__SONAMU_SSR_CONFIG__;

// Router 생성
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

// async IIFE로 감싸서 top-level await 제거
// (top-level await가 있으면 Vite 빌드 시 코드 스플릿 청크가 메인 엔트리를 import하면서 순환 의존성 데드락 발생)
(async () => {
  await router.load();

  // SSR/CSR 모두 document 전체에 렌더링
  if (document.documentElement.innerHTML && dehydratedState) {
    // SSR 페이지
    if (ssrConfig?.disableHydrate) {
      // disableHydrate: document 전체 새로 렌더링
      console.log("[Sonamu] Hydration disabled, rendering as CSR");
      ReactDOM.createRoot(document).render(<RouterProvider router={router} />);
    } else {
      // 정상 hydration: document 전체 hydrate
      ReactDOM.hydrateRoot(document, <RouterProvider router={router} />);
    }
  } else {
    // Pure CSR 페이지: document 전체 렌더링
    ReactDOM.createRoot(document).render(<RouterProvider router={router} />);
  }
})();

// Chrome Extension용 Devtools
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: typeof queryClient;
  }
}
window.__TANSTACK_QUERY_CLIENT__ = queryClient;
