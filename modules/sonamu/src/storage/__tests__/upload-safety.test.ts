import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

import { type MultipartFile } from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { FSDriver } from "flydrive/drivers/fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api/sonamu";
import {
  BufferedFile,
  createUploadStaticHeaders,
  resolveUploadContentType,
  resolveUploadExtension,
  StorageManager,
} from "../index";

/** BufferedFile 에 넘길 MultipartFile 을 모든 필드를 채워 만든다. */
function createMultipartFile(filename: string, mimetype: string, buffer: Buffer): MultipartFile {
  const file = Object.assign(Readable.from([buffer]), {
    truncated: false,
    bytesRead: buffer.length,
  });
  return {
    type: "file",
    toBuffer: async () => buffer,
    file,
    fieldname: "file",
    filename,
    encoding: "7bit",
    mimetype,
    fields: {},
  };
}

describe("업로드 확장자와 Content-Type 판정", () => {
  it.each([
    ["text/html", "bin"],
    ["TEXT/HTML; charset=utf-8", "bin"],
    ["image/svg+xml", "bin"],
    ["application/xhtml+xml", "bin"],
    ["text/xml", "bin"],
    ["text/javascript", "bin"],
    ["application/x-msdownload", "bin"],
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["application/pdf", "pdf"],
    ["text/plain", "txt"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ])("%s 는 확장자 %s 로 저장한다", (mimetype, extension) => {
    expect(resolveUploadExtension(mimetype)).toBe(extension);
  });

  it("알 수 없는 MIME 은 기존처럼 false 를 돌려준다", () => {
    expect(resolveUploadExtension("application/x-unknown-sonamu")).toBe(false);
  });

  it.each([
    ["text/html", "application/octet-stream"],
    ["image/svg+xml", "application/octet-stream"],
    ["application/x-unknown-sonamu", "application/octet-stream"],
    ["", "application/octet-stream"],
    ["Image/PNG", "image/png"],
    ["application/pdf", "application/pdf"],
  ])("%s 는 Content-Type %s 로 저장한다", (mimetype, contentType) => {
    expect(resolveUploadContentType(mimetype)).toBe(contentType);
  });

  it("BufferedFile.extname 은 text/html 업로드에 html 확장자를 주지 않는다", () => {
    const htmlBuffer = Buffer.from("<script></script>");
    const pngBuffer = Buffer.from("png");
    const html = createMultipartFile("evil.html", "text/html", htmlBuffer);
    const png = createMultipartFile("a.png", "image/png", pngBuffer);
    expect(new BufferedFile(html, htmlBuffer).extname).toBe("bin");
    expect(new BufferedFile(png, pngBuffer).extname).toBe("png");
  });
});

describe("BufferedFile.saveToDisk 의 Content-Type", () => {
  const originalStorage = Sonamu["storageValue"];
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "sonamu-upload-safety-"));
  });

  afterEach(async () => {
    Reflect.set(Sonamu, "storageValue", originalStorage);
    await rm(directory, { recursive: true, force: true });
  });

  it("클라이언트가 보낸 text/html 대신 application/octet-stream 으로 저장한다", async () => {
    const driver = new FSDriver({
      location: directory,
      visibility: "public",
      urlBuilder: {
        async generateURL(key) {
          return `/files/${key}`;
        },
        async generateSignedURL(key) {
          return `/files/${key}`;
        },
      },
    });
    const put = vi.spyOn(driver, "put");
    Reflect.set(Sonamu, "storageValue", new StorageManager({ drivers: { fs: () => driver } }));

    const buffer = Buffer.from("<script>1</script>");
    const multipart = createMultipartFile("evil.html", "text/html", buffer);
    const file = new BufferedFile(multipart, buffer);
    await file.saveToDisk("fs", "evil.bin");

    expect(put).toHaveBeenCalledWith("evil.bin", expect.anything(), {
      contentType: "application/octet-stream",
    });
  });
});

describe("createUploadStaticHeaders", () => {
  let directory: string;
  let server: FastifyInstance;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "sonamu-upload-static-"));
    const uploadDir = path.join(directory, "uploaded");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(directory, "page.html"), "<p>public</p>");
    await writeFile(path.join(uploadDir, "evil.html"), "<script>1</script>");
    await writeFile(path.join(uploadDir, "evil.svg"), "<svg onload='1'></svg>");
    await writeFile(path.join(uploadDir, "..evil.html"), "<script>1</script>");
    await writeFile(path.join(uploadDir, "pic.png"), "png");

    const userSetHeaders = vi.fn((reply: FastifyReply) => {
      reply.header("X-Custom", "1");
    });
    server = fastify();
    await server.register(fastifyStatic, {
      root: directory,
      prefix: "/api/public",
      setHeaders: createUploadStaticHeaders({ uploadDir, setHeaders: userSetHeaders }),
    });
  });

  afterEach(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(["evil.html", "evil.svg", "..evil.html"])(
    "업로드된 %s 는 nosniff·sandbox·attachment 로 서빙되어 실행되지 않는다",
    async (name) => {
      const res = await server.inject({ method: "GET", url: `/api/public/uploaded/${name}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe("application/octet-stream");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBe("sandbox");
      expect(res.headers["content-disposition"]).toBe("attachment");
      expect(res.headers["x-custom"]).toBe("1");
    },
  );

  it("업로드된 이미지는 attachment 없이 nosniff·sandbox 만 붙는다", async () => {
    const res = await server.inject({ method: "GET", url: "/api/public/uploaded/pic.png" });
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBe("sandbox");
    expect(res.headers["content-disposition"]).toBeUndefined();
  });

  it("업로드 디렉터리 밖의 정적 파일에는 헤더를 붙이지 않는다", async () => {
    const res = await server.inject({ method: "GET", url: "/api/public/page.html" });
    expect(res.headers["content-security-policy"]).toBeUndefined();
    expect(res.headers["content-disposition"]).toBeUndefined();
    expect(res.headers["x-custom"]).toBe("1");
  });
});
