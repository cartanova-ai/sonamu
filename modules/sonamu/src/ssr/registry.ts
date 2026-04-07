import { type SSRRoute } from "./types";

const ssrRoutes: SSRRoute[] = [];

export function registerSSR(route: SSRRoute): void {
  ssrRoutes.push(route);
}

export function getSSRRoutes(): SSRRoute[] {
  return ssrRoutes;
}

export function clearSSRRoutes(): void {
  ssrRoutes.length = 0;
}

export function matchSSRRoute(
  url: string,
): { route: SSRRoute; params: Record<string, string> } | null {
  for (const route of ssrRoutes) {
    const params = matchPath(route.path, url);
    if (params !== null) {
      return { route, params };
    }
  }
  return null;
}

// 간단한 path matching
export function matchPath(pattern: string, url: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const urlParts = url.split("?")[0].split("/").filter(Boolean);

  if (patternParts.length !== urlParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const urlPart = urlParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = urlPart;
    } else if (patternPart !== urlPart) {
      return null;
    }
  }

  return params;
}
