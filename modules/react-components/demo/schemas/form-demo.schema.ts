import { z } from "zod";

import type { SonamuFile } from "@/contexts";

/**
 * Form 페이지의 모든 컴포넌트를 포함하는 Zod 스키마
 */
export const FormDemoSchema = z.object({
  // Input 컴포넌트
  text: z.string(),
  email: z.string().email("유효한 이메일을 입력해주세요"),
  password: z.string().min(6, "비밀번호는 최소 6자 이상이어야 합니다"),

  // Checkbox
  checkbox1: z.boolean(),
  checkbox2: z.boolean(),

  // Radio Group
  radioGroup: z.enum(["option-1", "option-2", "option-3"]),

  // Switch
  airplaneMode: z.boolean(),

  // Textarea
  textarea: z.string(),

  // Slider
  slider: z.number().min(0).max(100),

  // Combobox
  combobox: z.string().optional(),

  // FileInput - Single modes
  singleEagerImage: z.union([z.custom<SonamuFile>(), z.instanceof(File), z.null()]).optional(),
  singleLazyImage: z.union([z.custom<SonamuFile>(), z.instanceof(File), z.null()]).optional(),
  singleEagerFile: z.union([z.custom<SonamuFile>(), z.instanceof(File), z.null()]).optional(),
  singleLazyFile: z.union([z.custom<SonamuFile>(), z.instanceof(File), z.null()]).optional(),

  // FileInput - Multiple modes
  multipleEagerImage: z.array(z.union([z.custom<SonamuFile>(), z.instanceof(File)])),
  multipleLazyImage: z.array(z.union([z.custom<SonamuFile>(), z.instanceof(File)])),
  multipleEagerFile: z.array(z.union([z.custom<SonamuFile>(), z.instanceof(File)])),
  multipleLazyFile: z.array(z.union([z.custom<SonamuFile>(), z.instanceof(File)])),

  // Input OTP
  otp: z.string().length(6, "OTP는 6자리여야 합니다"),

  // Toggle
  toggleBold: z.boolean(),

  // Toggle Group
  toggleGroup: z.string(),
});

export type FormDemoValues = z.infer<typeof FormDemoSchema>;
