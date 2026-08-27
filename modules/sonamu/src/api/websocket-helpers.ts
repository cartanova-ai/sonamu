import { type Server } from "http";

import { type WebsocketPluginOptions } from "@fastify/websocket";
import { type FastifyReply } from "fastify";

import { isSoException } from "../exceptions/so-exceptions";
import { isPlainObject } from "../utils/utils";

interface WebSocketCloseDescriptor {
  code: number;
  reason: string;
  logLevel: "warn" | "error";
}

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

// @fastify/websocket transport option은 server.plugins.ws에 명시된 값만 사용함.
export function resolveWebSocketPluginOptions({
  rawPluginOption,
}: {
  rawPluginOption: boolean | WebsocketPluginOptions | undefined;
}): WebsocketPluginOptions | undefined {
  const pluginOptions = rawPluginOption && rawPluginOption !== true ? { ...rawPluginOption } : {};
  const serverOptions: NonNullable<WebsocketPluginOptions["options"]> = isPlainObject(
    pluginOptions.options,
  )
    ? { ...pluginOptions.options }
    : {};

  if (Object.keys(serverOptions).length > 0) {
    pluginOptions.options = serverOptions;
  }

  return Object.keys(pluginOptions).length > 0 ? pluginOptions : undefined;
}

// handshake/auth/validation 실패를 generic 1011로 뭉개지 않고 1008(policy violation)로 매핑해,
// close code policy를 한 곳에서 정의함
export function resolveWebSocketCloseDescriptor(cause: unknown): WebSocketCloseDescriptor {
  if (isSoException(cause)) {
    if (cause.statusCode === 400) {
      return {
        code: 1008,
        reason: "Invalid websocket handshake",
        logLevel: "warn",
      };
    }

    if (cause.statusCode === 401 || cause.statusCode === 403) {
      return {
        code: 1008,
        reason: "Unauthorized websocket connection",
        logLevel: "warn",
      };
    }

    if (cause.statusCode >= 400 && cause.statusCode < 500) {
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
  return new Proxy(
    /* SAFETY: API 데코레이터와 Zod 검증기 등록 계약이 이 값의 타입을 보장한다. */ {} as FastifyReply,
    {
      get() {
        throw new Error(
          "FastifyReply is not available in websocket context. Define websocketContextProvider if your context setup depends on reply mutation.",
        );
      },
    },
  );
}
