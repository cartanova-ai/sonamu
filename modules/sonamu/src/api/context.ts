import type { FastifyReply, FastifyRequest, PassportUser } from "fastify";
import type { RouteGenericInterface } from "fastify/types/route";
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "http";
import type { ZodObject } from "zod";
import type { FileStorage } from "../file-storage/file-storage";
import type { NaiteStore } from "../naite/naite";
import type { createSSEFactory } from "../stream/sse";

// biome-ignore lint/suspicious/noEmptyInterface: Context 확장 타입
export interface ContextExtend {}
export type Context = {
  request: FastifyRequest;
  reply: FastifyReply<Server, IncomingMessage, ServerResponse, RouteGenericInterface, unknown>;
  headers: IncomingHttpHeaders;
  createSSE: <T extends ZodObject>(events: T) => ReturnType<typeof createSSEFactory<T>>;
  naiteStore: NaiteStore;
} & AuthContext &
  ContextExtend;

export type AuthContext = {
  user: PassportUser | null;
  passport: {
    login: (user: PassportUser) => Promise<void>;
    logout: () => void;
  };
};

export type UploadContext = {
  file?: FileStorage;
  files: FileStorage[];
};
