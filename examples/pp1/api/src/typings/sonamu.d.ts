import { FastifyFile } from "../application/file/file.types";
import { UserSubsetSS } from "../application/sonamu.generated";
import { Session } from "@fastify/secure-session";

declare module "sonamu" {
  export interface ContextExtend {
    session: Session;
    user: UserSubsetSS | null;
    passport: {
      login: (user: UserSubsetSS) => Promise<void>;
      logout: () => void;
    };
    uploadedFile: FastifyFile;
  }
}
