import { describe, expectTypeOf, it } from "vitest";
import { type infer as ZodInfer } from "zod";

import { type EntityJson, type EntityJsonSchema } from "./types";

declare module "./types" {
  interface EntityCustom {
    history?: boolean;
  }
}

describe("EntityJsonSchema custom", () => {
  it("declaration merging으로 정의한 확장 키만 타입에서 허용한다", () => {
    type Parsed = ZodInfer<typeof EntityJsonSchema>;

    expectTypeOf<Parsed>().toEqualTypeOf<EntityJson>();

    const withExtension: EntityJson = {
      id: "History",
      title: "이력",
      table: "histories",
      custom: { history: true },
      props: [],
      indexes: [],
      subsets: {},
      enums: {},
    };
    expectTypeOf(withExtension.custom?.history).toEqualTypeOf<boolean | undefined>();

    const withTypo: EntityJson = {
      id: "HistoryTypo",
      title: "이력 오타",
      table: "history_typos",
      // @ts-expect-error history 오타는 EntityCustom에 없으면 거부되어야 한다.
      custom: { histroy: true },
      props: [],
      indexes: [],
      subsets: {},
      enums: {},
    };
    expectTypeOf(withTypo).toEqualTypeOf<EntityJson>();
  });
});
