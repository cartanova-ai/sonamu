import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "http";

import type { Session, User } from "better-auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { RouteGenericInterface } from "fastify/types/route";
import type { ZodObject } from "zod";

import type { NaiteStore } from "../naite/naite";
import type { BufferedFile } from "../storage/buffered-file";
import type { UploadedFile } from "../storage/uploaded-file";
import type { createSSEFactory } from "../stream/sse";

// oxlint-disable-next-line @typescript-eslint/no-empty-interface -- Context 확장 타입
export interface ContextExtend {}
export type Context = {
  request: FastifyRequest;
  reply: FastifyReply<Server, IncomingMessage, ServerResponse, RouteGenericInterface, unknown>;
  headers: IncomingHttpHeaders;
  createSSE: <T extends ZodObject>(events: T) => ReturnType<typeof createSSEFactory<T>>;
  naiteStore: NaiteStore;
  /** 현재 요청의 locale */
  locale: string;
  /** buffer 모드에서 업로드된 파일 */
  bufferedFiles?: BufferedFile[];
  /** stream 모드에서 업로드된 파일 */
  uploadedFiles?: UploadedFile[];

  /** 현재 로그인한 사용자 (null이면 미인증) */
  user: User | null;
  /** 현재 세션 정보 (null이면 미인증) */
  session: Session | null;
} & ContextExtend;
