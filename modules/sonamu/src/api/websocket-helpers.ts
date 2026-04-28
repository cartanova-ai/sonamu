import { type Server } from "http";

import { type FastifyReply } from "fastify";

import { isSoException } from "../exceptions/so-exceptions";
import { isPlainObject } from "../utils/utils";
import { type ExtendedApi } from "./decorators";

// Fastify websocket route와 Vite HMR websocket이 같은 server socket을 두고 충돌하는 것을 방지하기 위해,
// WS route가 존재하면 HMR을 별도 포트로 분리해 띄움
export function resolveIntegratedViteHmrOptions({
  httpServer,
  requiresDedicatedWebSocketServer,
  rawPort = process.env.SONAMU_VITE_HMR_PORT,
}: {
  httpServer: Server;
  requiresDedicatedWebSocketServer: boolean;
  rawPort?: string | undefined;
}): { server: Server } | { port: number } {
  if (!requiresDedicatedWebSocketServer) {
    return { server: httpServer };
  }

  const parsedPort = rawPort?.trim() ? Number(rawPort) : 24678;
  return Number.isFinite(parsedPort) && parsedPort > 0 ? { port: parsedPort } : { port: 24678 };
}

// route-level maxPayload를 서버 plugin options으로 승격시켜, 큰 frame을 받은 뒤 닫는 대신
// transport 레벨에서 먼저 제한되도록 함
export function resolveWebSocketPluginOptions({
  rawPluginOption,
  apis,
}: {
  rawPluginOption: boolean | Record<string, unknown> | undefined;
  apis: ExtendedApi[];
}): Record<string, unknown> | undefined {
  const pluginOptions =
    rawPluginOption && rawPluginOption !== true
      ? { ...rawPluginOption }
      : ({} as Record<string, unknown>);
  const serverOptions = isPlainObject(pluginOptions.options)
    ? { ...(pluginOptions.options as Record<string, unknown>) }
    : {};

  if (isPositiveNumber(pluginOptions.maxPayload) && serverOptions.maxPayload === undefined) {
    serverOptions.maxPayload = pluginOptions.maxPayload;
    delete pluginOptions.maxPayload;
  }

  if (serverOptions.maxPayload === undefined) {
    const routeMaxPayloads = apis
      .map((api) => api.websocketOptions?.maxPayload)
      .filter(isPositiveNumber);

    if (routeMaxPayloads.length > 0) {
      serverOptions.maxPayload = Math.max(...routeMaxPayloads);
    }
  }

  if (Object.keys(serverOptions).length > 0) {
    pluginOptions.options = serverOptions;
  }

  return Object.keys(pluginOptions).length > 0 ? pluginOptions : undefined;
}

// handshake/auth/validation 실패를 generic 1011로 뭉개지 않고 1008(policy violation)로 매핑해,
// close code policy를 한 곳에서 정의함
export function resolveWebSocketCloseDescriptor(error: unknown): {
  code: number;
  reason: string;
  logLevel: "warn" | "error";
} {
  if (isSoException(error)) {
    if (error.statusCode === 400) {
      return {
        code: 1008,
        reason: "Invalid websocket handshake",
        logLevel: "warn",
      };
    }

    if (error.statusCode === 401 || error.statusCode === 403) {
      return {
        code: 1008,
        reason: "Unauthorized websocket connection",
        logLevel: "warn",
      };
    }

    if (error.statusCode >= 400 && error.statusCode < 500) {
      return {
        code: 1008,
        reason: "Rejected websocket connection",
        logLevel: "warn",
      };
    }
  }

  return {
    code: 1011,
    reason: "WebSocket handler failed",
    logLevel: "error",
  };
}

// WS 경로에서는 reply가 존재하지 않으므로 접근 시도를 즉시 에러로 surface해 transport misuse를 빨리 드러냄
// SSE/reply에 의존하는 contextProvider가 있으면 websocketContextProvider를 따로 정의하라는 가이드 역할도 함
export function createWebSocketReplyStub(): FastifyReply {
  return new Proxy({} as FastifyReply, {
    get() {
      throw new Error(
        "FastifyReply is not available in websocket context. Define websocketContextProvider if your context setup depends on reply mutation.",
      );
    },
  });
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
