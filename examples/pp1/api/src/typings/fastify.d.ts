import { UserSubsetSS } from "../application/user/user.generated";

declare module "fastify" {
  export interface PassportUser extends UserSubsetSS {}
}
