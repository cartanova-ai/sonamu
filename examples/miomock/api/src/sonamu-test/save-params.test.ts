import { describe, expect, test } from "vitest";

import { TagBaseSaveParams } from "../application/sonamu.generated";

describe("BaseSaveParams", () => {
  // 스캐폴드된 SaveParams(BaseSaveParams.partial({ id }))가 시스템 컬럼 입력을 버리는지 확인
  test("created_at 입력은 파싱 결과에서 제거되어야 한다", () => {
    const TagSaveParams = TagBaseSaveParams.partial({ id: true });

    const parsed = TagSaveParams.parse({
      id: 1,
      name: "태그",
      name_ko: null,
      name_en: null,
      created_at: new Date("1999-01-01T00:00:00Z"),
    });

    expect(parsed).toEqual({ id: 1, name: "태그", name_ko: null, name_en: null });
    expect("created_at" in parsed).toBe(false);
  });
});
