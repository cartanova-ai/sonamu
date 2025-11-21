import fastify from "fastify";

declare module "fastify" {
  export interface PassportUser {}

  export interface FastifyRequest {
    user: PassportUser | null;
    login: (user: PassportUser) => Promise<void>;
    logout: () => void;
  }
}
