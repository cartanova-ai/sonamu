import type { FastifyReply, FastifyRequest, PassportUser } from "fastify";
import type { RouteGenericInterface } from "fastify/types/route";
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "http";
import type { ZodObject } from "zod";
import type { NaiteStore } from "../naite/naite";
import type { BufferedFile } from "../storage/buffered-file";
import type { UploadedFile } from "../storage/uploaded-file";
import type { createSSEFactory } from "../stream/sse";

// biome-ignore lint/suspicious/noEmptyInterface: Context 확장 타입
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
} & AuthContext &
  ContextExtend;

export type AuthContext = {
  user: PassportUser | null;
  passport: {
    login: (user: PassportUser) => Promise<void>;
    logout: () => void;
  };
};
