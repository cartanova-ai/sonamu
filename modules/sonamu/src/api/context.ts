import type { FastifyReply, FastifyRequest } from "fastify";
import type { RouteGenericInterface } from "fastify/types/route";
import {
  type Server,
  type IncomingMessage,
  type ServerResponse,
  type IncomingHttpHeaders,
} from "http";
import type { FileStorage } from "../file-storage/file-storage";

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
} & ContextExtend;

export type UploadContext = {
  file?: FileStorage;
  files: FileStorage[];
};
