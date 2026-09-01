import path from "node:path";

import { type FastifyReply, type FastifyRequest } from "fastify";
import { type ViteDevServer } from "vite";

import { applyCacheHeaders } from "../cache-control/cache-control";
import { type CacheControlRequest } from "../cache-control/types";
import { type SonamuFastifyConfig } from "../types/types";
import { HMR_OPT_OUT_SCRIPT, isHmrDisabledByQuery } from "./hmr-opt-out";
import { type PreloadedData, type SSRRoute } from "./types";

export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite?: ViteDevServer,
): Promise<string> {
  const { Sonamu } = await import("../api/sonamu");

  // 1. preload 실행 → SSRQuery[] 획득 (dev/prod 공통)
  const preloadConfig = route.preload ? route.preload(params) : [];
  const preloadedData: PreloadedData[] = [];

  for (const { modelName, methodName, params: apiParams, serviceKey } of preloadConfig) {
    const api = Sonamu.syncer.apis.find(
      (a) => a.modelName === modelName && a.methodName === methodName,
    );

    if (!api) {
      console.warn(`API not found: ${modelName}.${methodName}`);
      continue;
    }

    try {
      const result = await Sonamu.invokeApiForSSR(api, apiParams, config, request, reply);
      preloadedData.push({
        queryKey: [...serviceKey, ...apiParams],
        data: result,
      });
    } catch (e) {
      console.error(`Failed to preload ${modelName}.${methodName}:`, e);
    }
  }

  // 2. Dev/Prod 스크립트 추출
  let viteScripts: string;
  let render: (
    url: string,
    preloadedData: PreloadedData[],
  ) => Promise<{ html: string; dehydratedState: unknown }>;

  if (vite) {
    // Dev: Vite Dev Server
    const fs = await import("node:fs/promises");
    const indexHtmlPath = path.join(vite.config.root, "index.html");
    const originalHtml = await fs.readFile(indexHtmlPath, "utf-8");
    const transformedHtml = await vite.transformIndexHtml(url, originalHtml);

    // Vite가 주입한 스크립트 추출
    viteScripts = extractScriptTags(transformedHtml);

    // ?hmr=false로 연 페이지는 HMR 웹소켓만 끊어 새로고침되지 않게 한다.
    if (isHmrDisabledByQuery(url)) {
      viteScripts = `${HMR_OPT_OUT_SCRIPT}\n${viteScripts}`;
    }

    const entryModule = await vite.ssrLoadModule("/src/entry-server.generated.tsx");
    render = entryModule.render;
  } else {
    // Prod: 빌드된 파일
    const fs = await import("node:fs");
    const webDistPath = path.join(Sonamu.apiRootPath, "web-dist", "client");
    const ssrPath = path.join(Sonamu.apiRootPath, "web-dist", "server");

    // 빌드된 index.html에서 스크립트 추출
    const builtHtml = fs.readFileSync(path.join(webDistPath, "index.html"), "utf-8");
    viteScripts = extractScriptTags(builtHtml);

    const entryModule = await import(path.join(ssrPath, "entry-server.generated.js"));
    render = entryModule.render;
  }

  // 3. RouterProvider 렌더링 (full document)
  const { html: fullDocHtml, dehydratedState } = await render(url, preloadedData);

  // 4. SSR 데이터 스크립트 생성
  const ssrDataScript = dehydratedState
    ? `<script>window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")};</script>`
    : "";

  // 5. SSR Config 스크립트 생성 (disableHydrate)
  const ssrConfigScript = route.disableHydrate
    ? `<script>window.__SONAMU_SSR_CONFIG__ = ${JSON.stringify({ disableHydrate: true })};</script>`
    : "";

  // 6. Vite 스크립트와 SSR 데이터를 </body> 직전에 주입
  const finalHtml = fullDocHtml.replace(
    "</body>",
    `${ssrConfigScript}\n${ssrDataScript}\n${viteScripts}\n</body>`,
  );

  // 7. Cache-Control 헤더 설정
  const ssrCacheConfig = getSSRCacheControl(url, route, request, config);
  if (ssrCacheConfig) {
    applyCacheHeaders(reply, ssrCacheConfig);
  }

  return finalHtml;
}

/**
 * SSR 응답에 적용할 Cache-Control 설정을 결정합니다.
 * 우선순위: 개별 지정 > cacheControlHandler
 */
function getSSRCacheControl(
  url: string,
  route: SSRRoute,
  request: FastifyRequest,
  config: SonamuFastifyConfig,
) {
  // 개별 지정 (registerSSR.cacheControl)
  if (route.cacheControl) {
    return route.cacheControl;
  }

  // 전역 핸들러
  if (config.cacheControlHandler) {
    const cacheReq: CacheControlRequest = {
      type: "ssr",
      url: request.url,
      path: url.split("?")[0],
      method: request.method,
      route,
    };
    const result = config.cacheControlHandler(cacheReq);
    if (result) return result;
  }

  return null;
}

/**
 * HTML에서 <script>, <link> 태그를 추출
 */
function extractScriptTags(html: string): string {
  const scriptRegex = /<script[^>]*>[\s\S]*?<\/script>|<link[^>]*>/gi;
  const matches = html.match(scriptRegex) || [];
  return matches.join("\n");
}
