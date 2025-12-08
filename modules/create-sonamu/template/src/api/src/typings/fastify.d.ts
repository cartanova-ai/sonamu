/** biome-ignore-all lint/correctness/noUnusedImports: d.ts */
import type fastify from "fastify";
import type { UserSubsetSS } from "../application/sonamu.generated";

declare module "fastify" {
  export interface PassportUser extends UserSubsetSS {}
}
