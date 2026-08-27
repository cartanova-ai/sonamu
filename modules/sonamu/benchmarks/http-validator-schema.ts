import { z } from "zod";

import { fastifyCaster } from "../src/api/caster";

export const validInput = {
  page: "3",
  active: "true",
  createdAt: "2026-08-09T12:30:00.000Z",
  filter: { score: "12", tags: ["api", "zod"] },
  // caster가 union 내부를 순회하지 않으므로 accepted fixture는 실제 wire shape와 schema를 맞춥니다.
  selection: { type: "ids", ids: [1, 2, 3] },
};
export const invalidInput = {
  ...validInput,
  filter: { score: "invalid", tags: [] },
};
export const inputs = [validInput, validInput, validInput, invalidInput] as const;

export function buildFinalValidator() {
  return fastifyCaster(
    z.object({
      page: z.number().int().positive(),
      active: z.boolean(),
      createdAt: z.date(),
      filter: z.object({
        score: z.number().min(0),
        tags: z.array(z.string().min(1)).min(1),
      }),
      selection: z.union([
        z.object({ type: z.literal("ids"), ids: z.array(z.number().int()).min(1) }),
        z.object({ type: z.literal("all") }),
      ]),
    }),
  );
}

export type FinalValidator = ReturnType<typeof buildFinalValidator>;
export type ValidationResult = ReturnType<FinalValidator["safeParse"]>;
