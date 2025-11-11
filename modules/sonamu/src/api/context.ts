import type { FastifyReply, FastifyRequest, PassportUser } from "fastify";
import type { RouteGenericInterface } from "fastify/types/route";
import type {
  Server,
  IncomingMessage,
  ServerResponse,
  IncomingHttpHeaders,
} from "http";
import type { FileStorage } from "../file-storage/file-storage";
import type { ZodObject } from "zod";
import type { createSSEFactory } from "../stream/sse";

export interface ContextExtend {}
export type Context = {
  request: FastifyRequest;
  reply: FastifyReply<
    Server,
    IncomingMessage,
    ServerResponse,
    RouteGenericInterface,
    unknown
  >;
  headers: IncomingHttpHeaders;
  createSSE: <T extends ZodObject>(
    events: T
  ) => ReturnType<typeof createSSEFactory<T>>;
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
