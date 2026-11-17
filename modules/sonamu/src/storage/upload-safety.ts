import { type Stats } from "node:fs";
import path from "node:path";

import { type FastifyReply } from "fastify";
import mime from "mime-types";

/** 브라우저가 내용을 판별하지 못하게 할 때 쓰는 기본 MIME 타입 */
export const UPLOAD_FALLBACK_CONTENT_TYPE = "application/octet-stream";

/** 허용 목록 밖의 업로드 파일에 붙이는 확장자 */
export const UPLOAD_FALLBACK_EXTENSION = "bin";

// 브라우저가 문서로 렌더링하거나 스크립트로 실행하지 않는 타입만 둔다.
// text/html, image/svg+xml, *+xml, JavaScript 같은 능동 콘텐츠는 의도적으로 빠져 있다.
const PASSIVE_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/rtf",
  "application/zip",
  "application/gzip",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
]);

const PASSIVE_UPLOAD_MIME_PREFIXES = [
  "image/",
  "audio/",
  "video/",
  "application/vnd.openxmlformats-officedocument.",
];

/** MIME 파라미터(charset 등)를 떼고 소문자로 맞춥니다. */
function normalizeMimeType(mimetype: string): string {
  return (mimetype.split(";")[0] ?? "").trim().toLowerCase();
}

/** XML 기반 타입은 SVG처럼 스크립트를 품을 수 있으므로 접두사가 맞아도 제외한다. */
function isXmlBasedMimeType(mimetype: string): boolean {
  return mimetype.endsWith("/xml") || mimetype.endsWith("+xml") || mimetype.includes("svg");
}

/**
 * 브라우저가 실행하지 않는 수동(passive) 콘텐츠 타입인지 판정합니다.
 * 업로드 MIME 은 클라이언트가 보낸 값이므로, 이 판정은 내용을 보장하지 않고
 * 저장 확장자와 Content-Type 을 안전한 쪽으로 고르는 데만 씁니다.
 */
export function isPassiveUploadMimeType(mimetype: string): boolean {
  const normalized = normalizeMimeType(mimetype);
  if (normalized === "" || isXmlBasedMimeType(normalized)) {
    return false;
  }
  return (
    PASSIVE_UPLOAD_MIME_TYPES.has(normalized) ||
    PASSIVE_UPLOAD_MIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

/** 브라우저가 문서가 아닌 미디어로 바로 보여주는 타입(이미지·오디오·비디오)인지 판정합니다. */
function isInlineMediaMimeType(mimetype: string): boolean {
  const normalized = normalizeMimeType(mimetype);
  if (isXmlBasedMimeType(normalized)) {
    return false;
  }
  return ["image/", "audio/", "video/"].some((prefix) => normalized.startsWith(prefix));
}

/**
 * 업로드 MIME 으로 저장 키의 확장자를 정합니다.
 * 허용 목록 밖이면 `bin` 을 돌려주고, MIME 을 알 수 없으면 `false` 를 돌려줍니다.
 */
export function resolveUploadExtension(mimetype: string): string | false {
  const extension = mime.extension(normalizeMimeType(mimetype));
  if (!extension) {
    return false;
  }
  // 확장자로 다시 서빙될 타입도 허용 목록 안이어야 한다(정적 서빙은 확장자로 Content-Type 을 정함).
  const servedType = mime.lookup(extension);
  if (!isPassiveUploadMimeType(mimetype) || !servedType || !isPassiveUploadMimeType(servedType)) {
    return UPLOAD_FALLBACK_EXTENSION;
  }
  return extension;
}

/**
 * 저장소에 기록할 Content-Type 을 정합니다.
 * 허용 목록 밖의 타입은 브라우저가 렌더링하지 않도록 `application/octet-stream` 으로 바꿉니다.
 */
export function resolveUploadContentType(mimetype: string): string {
  return isPassiveUploadMimeType(mimetype)
    ? normalizeMimeType(mimetype)
    : UPLOAD_FALLBACK_CONTENT_TYPE;
}

/** @fastify/static 의 setHeaders 시그니처 */
export type UploadStaticSetHeaders = (reply: FastifyReply, filePath: string, stat: Stats) => void;

/**
 * 업로드 디렉터리를 @fastify/static 으로 서빙할 때 쓰는 setHeaders 를 만듭니다.
 *
 * `uploadDir` 안의 파일에만 아래 헤더를 붙여, 업로드된 HTML·SVG 가 앱 오리진에서 실행되지 않게 합니다.
 * - `X-Content-Type-Options: nosniff`
 * - `Content-Security-Policy: sandbox`
 * - 이미지·오디오·비디오가 아니면 `Content-Disposition: attachment`
 * - 확장자로 정해진 타입이 허용 목록 밖이면(예: 원본 파일명의 `.html`) `Content-Type: application/octet-stream`
 *
 * @example
 * static: {
 *   root: publicDir,
 *   prefix: "/api/public",
 *   setHeaders: createUploadStaticHeaders({ uploadDir }),
 * }
 */
export function createUploadStaticHeaders(options: {
  /** 업로드 파일이 저장되는 디렉터리(fs 드라이버의 location) */
  uploadDir: string;
  /** 함께 실행할 기존 setHeaders */
  setHeaders?: UploadStaticSetHeaders;
}): UploadStaticSetHeaders {
  const uploadDir = path.resolve(options.uploadDir);

  return (reply, filePath, stat) => {
    options.setHeaders?.(reply, filePath, stat);

    const relative = path.relative(uploadDir, path.resolve(filePath));
    const isInsideUploadDir =
      relative !== "" &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative);
    if (!isInsideUploadDir) {
      return;
    }

    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Content-Security-Policy", "sandbox");

    // @fastify/static 은 확장자로 Content-Type 을 정하므로 같은 기준으로 판정한다.
    const servedType = mime.lookup(filePath);
    if (!servedType || !isPassiveUploadMimeType(servedType)) {
      reply.header("Content-Type", UPLOAD_FALLBACK_CONTENT_TYPE);
    }
    if (!servedType || !isInlineMediaMimeType(servedType)) {
      reply.header("Content-Disposition", "attachment");
    }
  };
}
