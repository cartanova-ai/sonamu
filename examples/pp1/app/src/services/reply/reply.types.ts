import { z } from "zod";
import { ReplyBaseSchema, ReplyBaseListParams } from "./reply.generated";

// Reply - ListParams
export const ReplyListParams = ReplyBaseListParams;
export type ReplyListParams = z.infer<typeof ReplyListParams>;

// Reply - SaveParams
export const ReplySaveParams = ReplyBaseSchema.partial({ id: true });
export type ReplySaveParams = z.infer<typeof ReplySaveParams>;
