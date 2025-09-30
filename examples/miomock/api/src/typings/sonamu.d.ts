import {} from "sonamu";

declare module "sonamu" {
  export interface ContextExtend {
    ip: string;
  }
}
