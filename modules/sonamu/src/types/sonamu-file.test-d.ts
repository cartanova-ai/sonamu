import { describe, expectTypeOf, it } from "vitest";
import { type infer as ZodInfer } from "zod";

import { type SonamuFile, type SonamuFileSchema } from "./types";

declare module "./types" {
  interface SonamuFileExtend {
    facility_id?: number;
  }
}

describe("SonamuFileSchema", () => {
  it("declaration merging으로 정의한 확장 키만 타입에서 허용한다", () => {
    type Parsed = ZodInfer<typeof SonamuFileSchema>;

    expectTypeOf<Parsed>().toEqualTypeOf<SonamuFile>();

    const baseOnly: Parsed = {
      name: "report.pdf",
      url: "https://example.com/report.pdf",
      mime_type: "application/pdf",
      size: 1024,
    };
    expectTypeOf(baseOnly).toEqualTypeOf<Parsed>();

    const withExtension: Parsed = {
      name: "report.pdf",
      url: "https://example.com/report.pdf",
      mime_type: "application/pdf",
      size: 1024,
      facility_id: 1,
    };
    expectTypeOf(withExtension).toEqualTypeOf<Parsed>();

    const withTypo: Parsed = {
      name: "report.pdf",
      url: "https://example.com/report.pdf",
      mime_type: "application/pdf",
      size: 1024,
      // @ts-expect-error facility_id 오타는 SonamuFileExtend에 없으면 거부되어야 한다.
      faciliy_id: 1,
    };
    expectTypeOf(withTypo).toEqualTypeOf<Parsed>();
  });
});
