import { fastifySession } from "@fastify/session";
import {} from "sonamu";
import { UserSubsetSS } from "../application/sonamu.generated";

declare module "sonamu" {
  export interface ContextExtend {
    ip: string;
    session: fastifySession;
    user: UserSubsetSS | null;
    passport: {
      login: (user: UserSubsetSS) => Promise<void>;
      logout: () => void;
    };
  }
}
