import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_WEBSOCKET_MAX_PAYLOAD_BYTES,
  resolveWebSocketPluginOptions,
} from "../websocket-helpers";

type CloseResult = { code: number; reason: string } | "message";

// 프레임 하나를 보내고 서버가 연결을 닫는지(코드) 또는 echo로 응답하는지 기다린다
function sendFrameAndAwaitOutcome(url: string, payload: string): Promise<CloseResult> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url);
    client.addEventListener("open", () => {
      client.send(payload);
    });
    client.addEventListener("message", () => {
      resolve("message");
      client.close();
    });
    client.addEventListener("close", (event) => {
      resolve({ code: event.code, reason: event.reason });
    });
    client.addEventListener("error", () => {
      // close 이벤트가 뒤따르므로 여기서는 결과를 정하지 않는다
    });
    setTimeout(() => reject(new Error("websocket outcome timeout")), 5000);
  });
}

describe("resolveWebSocketPluginOptions", () => {
  it("plugins.ws: true이면 maxPayload 기본값 64KiB를 넣는다", () => {
    expect(DEFAULT_WEBSOCKET_MAX_PAYLOAD_BYTES).toBe(64 * 1024);
    expect(resolveWebSocketPluginOptions({ rawPluginOption: true })).toEqual({
      options: { maxPayload: 64 * 1024 },
    });
  });

  it("maxPayload를 지정하지 않은 객체 설정에도 기본값을 넣고 다른 옵션은 유지한다", () => {
    expect(
      resolveWebSocketPluginOptions({
        rawPluginOption: { options: { perMessageDeflate: false } },
      }),
    ).toEqual({
      options: { perMessageDeflate: false, maxPayload: 64 * 1024 },
    });
  });

  it("사용자가 지정한 maxPayload는 그대로 둔다", () => {
    expect(
      resolveWebSocketPluginOptions({
        rawPluginOption: { options: { maxPayload: 1024 * 1024 } },
      }),
    ).toEqual({
      options: { maxPayload: 1024 * 1024 },
    });
  });
});

describe("WebSocket 프레임 상한 (실제 @fastify/websocket 서버)", () => {
  let server: FastifyInstance | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
  });

  async function startEchoServer(): Promise<string> {
    server = fastify();
    const websocketPlugin = (await import("@fastify/websocket")).default;
    const options = resolveWebSocketPluginOptions({ rawPluginOption: true });
    await server.register(websocketPlugin, options);
    server.register(async (instance) => {
      instance.get("/echo", { websocket: true }, (socket) => {
        socket.on("message", (data) => {
          // ws의 RawData는 Buffer | ArrayBuffer | Buffer[]이므로 형태별로 바이트 길이를 구한다
          const byteLength = Array.isArray(data)
            ? data.reduce((sum, chunk) => sum + chunk.length, 0)
            : data.byteLength;
          socket.send(String(byteLength));
        });
      });
    });
    // listen()이 돌려주는 실제 주소(http://127.0.0.1:<port>)를 URL로 파싱해 OS가 배정한 포트를 얻는다
    const { port } = new URL(await server.listen({ port: 0, host: "127.0.0.1" }));
    return `ws://127.0.0.1:${port}/echo`;
  }

  it("기본 설정에서 64KiB를 넘는 프레임은 1009로 닫는다", async () => {
    const url = await startEchoServer();
    const outcome = await sendFrameAndAwaitOutcome(url, "x".repeat(64 * 1024 + 1));
    expect(outcome).toMatchObject({ code: 1009 });
  });

  it("기본 설정에서 64KiB 이하 프레임은 그대로 받는다", async () => {
    const url = await startEchoServer();
    const outcome = await sendFrameAndAwaitOutcome(url, "x".repeat(64 * 1024));
    expect(outcome).toBe("message");
  });
});
