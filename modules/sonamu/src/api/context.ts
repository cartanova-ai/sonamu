import {
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";

import { type Session, type User } from "better-auth";
import { type FastifyReply, type FastifyRequest } from "fastify";
import { type RouteGenericInterface } from "fastify/types/route";
import { type ZodObject } from "zod";

import { type NaiteStore } from "../naite/naite";
import { type BufferedFile } from "../storage/buffered-file";
import { type UploadedFile } from "../storage/uploaded-file";
import { type createSSEFactory } from "../stream/sse";
import { type WebSocketConnection } from "../stream/ws";

// oxlint-disable-next-line @typescript-eslint/no-empty-interface -- Context 확장 타입
export interface ContextExtend {}
type BaseContext = {
  request: FastifyRequest;
  headers: IncomingHttpHeaders;
  naiteStore: NaiteStore;
  /** 현재 요청의 locale */
  locale: string;
  /** 현재 로그인한 사용자 (null이면 미인증) */
  user: User | null;
  /** 현재 세션 정보 (null이면 미인증) */
  session: Session | null;
};

export type Context = BaseContext & {
  transport: "http";
  reply: FastifyReply<Server, IncomingMessage, ServerResponse, RouteGenericInterface>;
  createSSE: <T extends ZodObject>(events: T) => ReturnType<typeof createSSEFactory<T>>;
  /** buffer 모드에서 업로드된 파일 */
  bufferedFiles?: BufferedFile[];
  /** stream 모드에서 업로드된 파일 */
  uploadedFiles?: UploadedFile[];
} & ContextExtend;

export type WebSocketContext<
  TOut extends object = object,
  TIn extends object = object,
> = BaseContext & {
  transport: "ws";
  ws: WebSocketConnection<TOut, TIn>;
} & ContextExtend;

export type RuntimeContext = Context | WebSocketContext;
