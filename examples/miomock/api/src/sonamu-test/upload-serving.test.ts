import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import fastify, { type FastifyInstance } from "fastify";
import { Sonamu, type SonamuFastifyConfig } from "sonamu";
import { createUploadStaticHeaders, drivers, StorageManager } from "sonamu/storage";
import { bootstrap, test } from "sonamu/test";
import { afterAll, beforeAll, describe, expect, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

type MultipartPart = {
  name: string;
  value: string;
  filename?: string;
  contentType?: string;
};

const BOUNDARY = "----sonamu-upload-serving";

/** fastify inject 에 넘길 multipart/form-data 본문을 만든다. */
function buildMultipart(parts: MultipartPart[]) {
  const chunks = parts.map((part) => {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`;
    const contentType = part.contentType ? `\r\nContent-Type: ${part.contentType}` : "";
    return `--${BOUNDARY}\r\nContent-Disposition: ${disposition}${contentType}\r\n\r\n${part.value}\r\n`;
  });
  return {
    payload: Buffer.from(`${chunks.join("")}--${BOUNDARY}--\r\n`),
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
  };
}

const EVIL_HTML = "<script>fetch('/api/auth/get-session')</script>";
const EVIL_SVG = "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'></svg>";

/** buffer 모드 업로드 응답에서 테스트가 읽는 필드만 검증한다. 파일이 최소 1개 있어야 한다. */
const BufferedUploadFile = z.object({ url: z.string() });
const BufferedUploadResponse = z.object({
  files: z.tuple([BufferedUploadFile]).rest(BufferedUploadFile),
});

/** stream 모드 업로드 응답에서 테스트가 읽는 필드만 검증한다. 파일이 최소 1개 있어야 한다. */
const StreamedUploadFile = z.object({ key: z.string(), url: z.string() });
const StreamedUploadResponse = z.object({
  files: z.tuple([StreamedUploadFile]).rest(StreamedUploadFile),
});

describe("업로드 파일 서빙 (SON-632)", () => {
  let originalStorage: StorageManager | null = null;
  let directory: string;
  let server: FastifyInstance;

  beforeAll(async () => {
    // API 목록(syncer)이 필요하므로 테스트 전용 초기화 대신 전체 초기화를 한다
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);
    originalStorage = Sonamu["storageValue"];

    directory = await mkdtemp(path.join(tmpdir(), "miomock-upload-serving-"));
    const uploadDir = path.join(directory, "uploaded");
    await mkdir(uploadDir, { recursive: true });

    // 실제 public/uploaded 대신 임시 디렉터리에 저장하되, URL 규칙은 miomock 설정과 같게 둔다
    Reflect.set(
      Sonamu,
      "storageValue",
      new StorageManager({
        drivers: {
          fs: drivers.fs({
            location: uploadDir,
            visibility: "public",
            urlBuilder: {
              async generateURL(key) {
                return `/api/public/uploaded/${key}`;
              },
              async generateSignedURL(key) {
                return `/api/public/uploaded/${key}`;
              },
            },
          }),
        },
      }),
    );

    server = fastify();
    await Sonamu["registerPlugins"](server, {
      multipart: Sonamu.config.server.plugins?.multipart,
      static: {
        root: directory,
        prefix: "/api/public",
        setHeaders: createUploadStaticHeaders({ uploadDir }),
      },
    });

    const config: SonamuFastifyConfig = {
      contextProvider: (defaultContext) => ({ ...defaultContext, ip: "127.0.0.1" }),
      guardHandler: () => true,
    };
    const findApi = (methodName: string) => {
      const api = Sonamu.syncer.apis.find(
        (candidate) => candidate.modelName === "FileModel" && candidate.methodName === methodName,
      );
      if (!api) {
        throw new Error(`FileModel.${methodName} API를 찾을 수 없습니다`);
      }
      return api;
    };
    const prefix = Sonamu.config.api.route.prefix;

    const uploadApi = findApi("upload");
    server.route({
      method: "POST",
      url: prefix + uploadApi.path,
      handler: Sonamu.createApiHandler(uploadApi, config),
    });

    const streamApi = findApi("testStreamUpload");
    server.route({
      method: "POST",
      url: prefix + streamApi.path,
      handler: Sonamu.createApiHandler(streamApi, config),
    });

    // 데코레이터 keyGenerator 를 빼서 프레임워크 기본 keyGenerator 경로를 검증한다
    const streamUploadOptions = streamApi.uploadOptions;
    if (streamUploadOptions?.consume !== "stream") {
      throw new Error("FileModel.testStreamUpload 는 stream 모드여야 합니다");
    }
    const defaultKeyApi = {
      ...streamApi,
      uploadOptions: { ...streamUploadOptions, keyGenerator: undefined },
    };
    server.route({
      method: "POST",
      url: `${prefix + streamApi.path}DefaultKey`,
      handler: Sonamu.createApiHandler(defaultKeyApi, config),
    });

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    Reflect.set(Sonamu, "storageValue", originalStorage);
    await rm(directory, { recursive: true, force: true });
  });

  async function expectNotExecutable(url: string) {
    const res = await server.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).not.toMatch(/text\/html|image\/svg\+xml/);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
    expect(res.headers["content-disposition"]).toBe("attachment");
  }

  test.each([
    ["evil.html", "text/html", EVIL_HTML],
    ["evil.svg", "image/svg+xml", EVIL_SVG],
  ])(
    "buffer 모드: %s(%s) 업로드는 bin 확장자로 저장되고 실행되지 않게 서빙된다",
    async (filename, contentType, value) => {
      const { payload, headers } = buildMultipart([{ name: "file", filename, contentType, value }]);
      const res = await server.inject({
        method: "POST",
        url: "/api/file/upload",
        payload,
        headers,
      });
      expect(res.statusCode).toBe(200);
      const { url } = BufferedUploadResponse.parse(res.json()).files[0];
      expect(url).toMatch(/\.bin$/);
      const served = await server.inject({ method: "GET", url });
      expect(served.headers["content-type"]).toBe("application/octet-stream");
      await expectNotExecutable(url);
    },
  );

  test("buffer 모드: png 업로드는 png 로 저장되고 attachment 없이 서빙된다", async () => {
    const { payload, headers } = buildMultipart([
      { name: "file", filename: "pic.png", contentType: "image/png", value: "png" },
    ]);
    const res = await server.inject({ method: "POST", url: "/api/file/upload", payload, headers });
    const { url } = BufferedUploadResponse.parse(res.json()).files[0];
    expect(url).toMatch(/\.png$/);
    const served = await server.inject({ method: "GET", url });
    expect(served.headers["content-type"]).toBe("image/png");
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    expect(served.headers["content-disposition"]).toBeUndefined();
  });

  test("stream 모드 기본 keyGenerator: text/html 업로드는 bin 확장자로 저장된다", async () => {
    const { payload, headers } = buildMultipart([
      { name: "params[name]", value: "x" },
      { name: "file", filename: "evil.html", contentType: "text/html", value: EVIL_HTML },
    ]);
    const res = await server.inject({
      method: "POST",
      url: "/api/file/testStreamUploadDefaultKey",
      payload,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const file = StreamedUploadResponse.parse(res.json()).files[0];
    expect(file.key).toMatch(/^uploads\/\d+-[a-z0-9]+\.bin$/);
    await expectNotExecutable(file.url);
  });

  test("stream 모드 사용자 keyGenerator: 파일명이 .html 이어도 실행되지 않게 서빙된다", async () => {
    const { payload, headers } = buildMultipart([
      { name: "params[name]", value: "x" },
      { name: "file", filename: "pic.html", contentType: "image/png", value: EVIL_HTML },
    ]);
    const res = await server.inject({
      method: "POST",
      url: "/api/file/testStreamUpload",
      payload,
      headers,
    });
    expect(res.statusCode).toBe(200);
    const file = StreamedUploadResponse.parse(res.json()).files[0];
    expect(file.key).toMatch(/-pic\.html$/);
    await expectNotExecutable(file.url);
  });

  test("miomock 설정의 정적 서빙에 업로드 보안 헤더가 연결되어 있다", () => {
    expect(Sonamu.config.server.plugins?.static).toMatchObject({
      setHeaders: expect.any(Function),
    });
  });
});
