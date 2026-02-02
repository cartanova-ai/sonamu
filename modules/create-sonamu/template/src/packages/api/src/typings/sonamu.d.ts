/** biome-ignore-all lint/correctness/noUnusedImports: d.ts */

import {} from "sonamu";

declare module "sonamu" {
  export interface ContextExtend {
    ip: string;
  }

  export interface GuardKeys {
    query: true;
    user: true;
    admin: true;
    // 새로운 커스텀 가드키를 추가하는 경우
    // CustomGuardKey: true
  }
}
