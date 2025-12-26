import { hydrate, QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import Main from "./main";
import { routeTree } from "./routeTree.gen";
import "./styles/tailwind.css";

// SSR 데이터 타입
declare global {
  interface Window {
    // biome-ignore lint/suspicious/noExplicitAny: SSR 데이터를 any 타입으로 받아야 함
    __SONAMU_SSR__?: any;
  }
}

// QueryClient 생성 (서버와 동일한 설정 사용)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: false, // 서버와 동일하게 설정
      refetchOnMount: false,
    },
  },
});

// SSR 데이터 복원
const dehydratedState = window.__SONAMU_SSR__;
if (dehydratedState) {
  hydrate(queryClient, dehydratedState);
}

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

// Root element
const root = document.getElementById("root");
if (!root) {
  throw new Error("Root element not found");
}

await router.load();

const app = (
  <Main queryClient={queryClient}>
    <RouterProvider router={router} />
  </Main>
);

if (root.innerHTML && dehydratedState) {
  // React hydration 시도 (서버 HTML 재사용)
  ReactDOM.hydrateRoot(root, app);

  // 디버깅: hydration 후 클라이언트 HTML과 비교
  setTimeout(() => {
    // detectHydrationMismatch(serverHTML, root.innerHTML);
  }, 100);
} else {
  // CSR 페이지 - 새로 렌더링
  ReactDOM.createRoot(root).render(app);
}

// Chrome Extension용 Devtools
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: typeof queryClient;
  }
}
window.__TANSTACK_QUERY_CLIENT__ = queryClient;
