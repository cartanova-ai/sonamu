import type { FastifyReply } from "fastify";
import type { RouteGenericInterface } from "fastify/types/route";
import {
  type Server,
  type IncomingMessage,
  type ServerResponse,
  type IncomingHttpHeaders,
} from "http";

export interface ContextExtend {}
export type Context = {
  reply: FastifyReply<
    Server,
    IncomingMessage,
    ServerResponse,
    RouteGenericInterface,
    unknown
  >;
  headers: IncomingHttpHeaders;
} & ContextExtend;
