import path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { ViteDevServer } from "vite";
import type { SonamuFastifyConfig } from "../types/types";
import type { PreloadedData, SSRRoute } from "./types";

export async function renderSSR(
  url: string,
  route: SSRRoute,
  params: Record<string, string>,
  request: FastifyRequest,
  reply: FastifyReply,
  config: SonamuFastifyConfig,
  vite: ViteDevServer,
): Promise<string> {
  const { Sonamu } = await import("../api/sonamu");

  // 1. preload 실행 → SSRQuery[] 획득
  const preloadConfig = route.preload ? route.preload(params) : [];

  // 2. Sonamu.invokeApiForSSR로 API 직접 호출
  const preloadedData: PreloadedData[] = [];

  for (const { modelName, methodName, params: apiParams, serviceKey } of preloadConfig) {
    // ExtendedApi 찾기
    const api = Sonamu.syncer.apis.find(
      (a) => a.modelName === modelName && a.methodName === methodName,
    );

    if (!api) {
      console.warn(`API not found: ${modelName}.${methodName}`);
      continue;
    }

    try {
      // API 직접 호출 (HTTP 오버헤드 없음)
      const result = await Sonamu.invokeApiForSSR(api, apiParams, config, request, reply);

      // queryKey 생성: serviceKey + 파라미터
      preloadedData.push({
        queryKey: [...serviceKey, ...apiParams],
        data: result,
      });
    } catch (e) {
      console.error(`Failed to preload ${modelName}.${methodName}:`, e);
      // 에러 발생 시 해당 쿼리는 스킵 (CSR로 fallback)
    }
  }

  // 3. index.html 읽기
  const fs = await import("node:fs/promises");
  const indexHtmlPath = path.join(vite.config.root, "index.html");
  let template = await fs.readFile(indexHtmlPath, "utf-8");
  template = await vite.transformIndexHtml(url, template);

  // 4. entry-server 로드 및 렌더링
  const { render } = await vite.ssrLoadModule("/src/entry-server.generated.tsx");
  const { html: appHtml, dehydratedState } = await render(url, preloadedData);

  // 5. SSR 데이터 스크립트 생성
  const ssrDataScript = `
    <script>
      ${dehydratedState ? `window.__SONAMU_SSR__ = ${JSON.stringify(dehydratedState).replace(/</g, "\\u003c")};` : ""}
    </script>
  `;

  // 6. head 생성
  const headTags = route.head ? generateHeadTags(route.head(dehydratedState)) : "";
  const devCssLinks = `
  <link rel="stylesheet" href="/src/styles/tailwind.css" />
`;

  // 7. 치환
  const html = template
    .replace("<!--app-head-->", `${devCssLinks}\n    ${headTags}\n    ${ssrDataScript}`)
    .replace("<!--app-html-->", appHtml);

  return html;
}

function generateHeadTags(head: ReturnType<NonNullable<SSRRoute["head"]>>): string {
  const tags: string[] = [];

  if (head.title) {
    tags.push(`<title>${escapeHtml(head.title)}</title>`);
  }

  if (head.meta) {
    for (const meta of head.meta) {
      const attrs: string[] = [];
      if (meta.name) attrs.push(`name="${escapeHtml(meta.name)}"`);
      if (meta.property) attrs.push(`property="${escapeHtml(meta.property)}"`);
      attrs.push(`content="${escapeHtml(meta.content)}"`);
      tags.push(`<meta ${attrs.join(" ")} />`);
    }
  }

  return tags.join("\n    ");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
