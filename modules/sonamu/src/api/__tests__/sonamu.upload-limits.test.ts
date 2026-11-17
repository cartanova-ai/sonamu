import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SonamuFastifyConfig } from "../../types/types";
import { type ExtendedApi, type UploadDecoratorOptions } from "../decorators";
import { Sonamu } from "../sonamu";

const BOUNDARY = "son631boundary";
// 전역(plugin) multipart 한도: 실제 앱의 `plugins.multipart.limits` 설정에 해당한다.
const GLOBAL_FILE_SIZE = 1024;
const GLOBAL_PARTS = 10;

type Part = { name: string; filename?: string; content: string };

function createMultipartBody(parts: Part[]): Buffer {
  const chunks = parts.map((part) => {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: application/octet-stream`
      : `form-data; name="${part.name}"`;
    return `--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n\r\n${part.content}\r\n`;
  });
  return Buffer.from(`${chunks.join("")}--${BOUNDARY}--\r\n`);
}

function createUploadApi(uploadOptions: UploadDecoratorOptions): ExtendedApi {
  return {
    modelName: "FileModel",
    methodName: "upload",
    path: "/file/upload",
    options: { httpMethod: "POST" },
    uploadOptions,
    typeParameters: [],
    parameters: [],
    returnType: "unknown",
  };
}

describe("@upload multipart 한도", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  let server: FastifyInstance;

  beforeEach(() => {
    Reflect.set(Sonamu, "httpValidators", new WeakMap());
    Reflect.set(Sonamu, "pendingHttpValidators", new WeakMap());
    Reflect.set(Sonamu, "aotHttpValidatorRegistry", undefined);
    Reflect.set(Sonamu, "preparedApis", []);
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
      i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
    });
    Reflect.set(Sonamu, "syncerValue", { types: {} });
    // 핸들러가 채운 context.bufferedFiles를 그대로 응답으로 돌려준다.
    vi.spyOn(Sonamu, "invokeModelMethod").mockImplementation(async () => {
      const context = Sonamu.getContext();
      return { sizes: (context.bufferedFiles ?? []).map((file) => file.size) };
    });
  });

  afterEach(async () => {
    await server?.close();
    Sonamu.restoreTestingSnapshot(originalState);
    vi.restoreAllMocks();
  });

  async function createServer(uploadOptions: UploadDecoratorOptions) {
    server = Fastify();
    await server.register(multipart, {
      limits: { fileSize: GLOBAL_FILE_SIZE, parts: GLOBAL_PARTS },
    });
    // 실제 createContext가 만든 기본 HTTP context를 그대로 사용한다.
    const config: SonamuFastifyConfig = {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => {},
    };
    const handler = Sonamu.createApiHandler(createUploadApi(uploadOptions), config);
    server.post("/upload", handler);
    await server.ready();
    return server;
  }

  function post(parts: Part[]) {
    return server.inject({
      method: "POST",
      url: "/upload",
      headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
      payload: createMultipartBody(parts),
    });
  }

  it("인자 없는 @upload()에서도 전역 fileSize 한도를 넘는 파일은 413으로 거부한다", async () => {
    await createServer({ consume: "buffer" });

    const response = await post([
      { name: "file", filename: "big.bin", content: "x".repeat(GLOBAL_FILE_SIZE + 1) },
    ]);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "FST_REQ_FILE_TOO_LARGE" });
  });

  it("인자 없는 @upload()에서도 전역 parts 한도를 넘는 요청은 413으로 거부한다", async () => {
    await createServer({ consume: "buffer" });

    const parts = Array.from({ length: GLOBAL_PARTS + 1 }, (_, index) => ({
      name: `f${index}`,
      filename: `a${index}.bin`,
      content: "x",
    }));
    const response = await post(parts);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "FST_PARTS_LIMIT" });
  });

  it("데코레이터 limits의 undefined 항목은 전역 한도를 지우지 않는다", async () => {
    await createServer({ limits: { fileSize: undefined, files: 2 } });

    const response = await post([
      { name: "file", filename: "big.bin", content: "x".repeat(GLOBAL_FILE_SIZE + 1) },
    ]);

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({ code: "FST_REQ_FILE_TOO_LARGE" });
  });

  it("데코레이터 limits는 전역 한도와 병합되어 함께 적용된다", async () => {
    await createServer({ limits: { files: 1 } });

    const tooMany = await post([
      { name: "a", filename: "a.bin", content: "x" },
      { name: "b", filename: "b.bin", content: "x" },
    ]);
    expect(tooMany.statusCode).toBe(413);
    expect(tooMany.json()).toMatchObject({ code: "FST_FILES_LIMIT" });

    const tooLarge = await post([
      { name: "a", filename: "a.bin", content: "x".repeat(GLOBAL_FILE_SIZE + 1) },
    ]);
    expect(tooLarge.statusCode).toBe(413);
    expect(tooLarge.json()).toMatchObject({ code: "FST_REQ_FILE_TOO_LARGE" });
  });

  it("한도 안의 업로드는 그대로 받아 context.bufferedFiles로 전달한다", async () => {
    await createServer({ consume: "buffer" });

    const response = await post([
      { name: "a", filename: "a.bin", content: "x".repeat(GLOBAL_FILE_SIZE) },
      { name: "title", content: "hello" },
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sizes: [GLOBAL_FILE_SIZE] });
  });
});
