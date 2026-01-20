import { z } from "zod";

/**
 * Dialog 폼 스키마
 */
export const DialogFormSchema = z.object({
  name: z.string().min(1, "이름을 입력해주세요"),
  email: z.string().email("유효한 이메일을 입력해주세요"),
  message: z.string().min(10, "메시지는 최소 10자 이상이어야 합니다"),
});

export type DialogFormValues = z.infer<typeof DialogFormSchema>;

/**
 * Drawer 폼 스키마
 */
export const DrawerFormSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요"),
  description: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]),
});

export type DrawerFormValues = z.infer<typeof DrawerFormSchema>;

/**
 * Sheet 폼 스키마
 */
export const SheetFormSchema = z.object({
  username: z.string().min(3, "사용자명은 최소 3자 이상이어야 합니다"),
  bio: z.string().max(200, "자기소개는 최대 200자까지 입력 가능합니다").optional(),
  notifications: z.boolean(),
});

export type SheetFormValues = z.infer<typeof SheetFormSchema>;
