import { z } from "zod";

/**
 * Data Display 페이지의 모든 컴포넌트를 포함하는 Zod 스키마
 */
export const DataDisplayDemoSchema = z.object({
  // Pagination
  currentPage: z.number().int().min(1),

  // Multi Select
  selectedValues: z.array(z.string()),

  // Month Picker Multiple
  monthValue: z
    .object({
      type: z.enum(["single", "range"]),
      date: z.date().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    })
    .optional(),

  // Date Selector Multiple
  dateValue: z
    .object({
      type: z.enum(["single", "range"]),
      date: z.date().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    })
    .optional(),

  // Select
  selectValue: z.string().optional(),
});

export type DataDisplayDemoValues = z.infer<typeof DataDisplayDemoSchema>;
