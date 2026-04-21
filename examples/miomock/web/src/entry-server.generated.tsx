/**
 * @generated
 * 직접 수정하지 마세요.
 */


import { QueryClient, dehydrate } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { renderToString } from 'react-dom/server';
import { routeTree } from './routeTree.gen';
import { Suspense } from "react";

export type PreloadedData = {
  queryKey: any[];
  data: any;
};

export async function render(url: string, preloadedData: PreloadedData[] = []) {
  // QueryClient 생성
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5000,
        retry: false,
      },
    },
  });

  // Preloaded 데이터를 queryClient에 직접 주입
  for (const { queryKey, data } of preloadedData) {
    queryClient.setQueryData(queryKey, data);
  }

  // Dehydrate
  const dehydratedState = dehydrate(queryClient);

  // SSR용 메모리 히스토리 생성
  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  });

  // Router 생성 (SSR 모드)
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: memoryHistory,
    defaultPreload: 'intent',
  });

  // 라우터 초기화: SSR에서 반드시 await router.load() 호출 필요
  await router.load();

  // RouterProvider만 렌더링 (Suspense로 래핑 - hydration mismatch 방지)
  const appHtml = renderToString(<Suspense fallback={null}><RouterProvider router={router} /></Suspense>);

  return {
    html: appHtml,
    dehydratedState,
  };
}