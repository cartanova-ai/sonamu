/* oxlint-disable @typescript-eslint/no-unused-vars */ // d.ts
import type fastify from "fastify";
import type { UserSubsetSS } from "../application/sonamu.generated";

declare module "fastify" {
  export interface PassportUser extends UserSubsetSS {}
}
