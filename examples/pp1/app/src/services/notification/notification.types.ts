import { z } from "zod";
import {
  NotificationBaseSchema,
  NotificationBaseListParams,
} from "./notification.generated";

// Notification - ListParams
export const NotificationListParams = NotificationBaseListParams;
export type NotificationListParams = z.infer<typeof NotificationListParams>;

// Notification - SaveParams
export const NotificationSaveParams = NotificationBaseSchema.partial({
  id: true,
});
export type NotificationSaveParams = z.infer<typeof NotificationSaveParams>;

// AppPushMessage
export type AppPushMessage = {
  title: string;
  content: string;
  url: string;
};
