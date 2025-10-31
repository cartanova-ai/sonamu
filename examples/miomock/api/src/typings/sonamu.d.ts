import {} from "sonamu";
import { Session } from "@fastify/secure-session";
import { UserSubsetSS } from "../application/sonamu.generated";

declare module "sonamu" {
  export interface ContextExtend {
    ip: string;
    session: Session;
    user: UserSubsetSS | null;
    passport: {
      login: (user: UserSubsetSS) => Promise<void>;
      logout: () => void;
    };
  }

  export interface GuardKeys {
    query: true;
    user: true;
    admin: true;
    // 새로운 커스텀 가드키를 추가하는 경우
    // CustomGuardKey: true
  }
}
