import { FastifyReply } from "fastify";
import { RouteGenericInterface } from "fastify/types/route";
import {
  Server,
  IncomingMessage,
  ServerResponse,
  IncomingHttpHeaders,
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
