import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { type InsertData } from "../database/puri.types";

type GeneratedTemplateRow = {
  id: number;
  title: string;
  code: string;
  slug: string;
  search_text: string;
  __hasDefault__: readonly ["id"];
  __generated__: readonly ["slug", "search_text"];
};

type VirtualQueryTemplateRow = {
  id: number;
  title: string;
  required_virtual_value: string;
  nullable_virtual_value: string | null;
  __hasDefault__: readonly ["id"];
  __virtual_query__: readonly ["required_virtual_value", "nullable_virtual_value"];
};

describe("generated template __generated__ metadata", () => {
  it("searchText와 기존 generated 컬럼을 write payload에서 제외해야 한다", () => {
    type Result = InsertData<GeneratedTemplateRow>;

    expectTypeOf<Result>().branded.toEqualTypeOf<{
      id?: number;
      title: string;
      code: string;
    }>();
  });

  it("SaveParams와 동등한 write schema 추론도 generated/searchText 컬럼을 제외해야 한다", () => {
    const GeneratedTemplateSaveParams = z
      .object({
        id: z.number(),
        title: z.string(),
        code: z.string(),
        slug: z.string(),
        search_text: z.string(),
      })
      .omit({ slug: true, search_text: true })
      .partial({ id: true });

    type Result = z.infer<typeof GeneratedTemplateSaveParams>;

    expectTypeOf<Result>().toEqualTypeOf<{
      id?: number;
      title: string;
      code: string;
    }>();
  });
});

describe("generated template __virtual_query__ metadata", () => {
  it("virtualQuery 컬럼을 nullability와 무관하게 write payload에서 제외해야 한다", () => {
    type Result = InsertData<VirtualQueryTemplateRow>;

    expectTypeOf<Result>().branded.toEqualTypeOf<{
      id?: number;
      title: string;
    }>();
  });
});
