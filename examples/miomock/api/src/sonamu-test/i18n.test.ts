import { Sonamu } from "sonamu";
import { bootstrap, runWithContext } from "sonamu/test";
import { describe, expect, test, vi } from "vitest";
import { localizedColumn } from "../i18n/sd.generated";

bootstrap(vi);
describe("i18n", () => {
  describe("localizedColumn", () => {
    const tag = {
      name: "test",
      name_ko: "test_ko",
      name_en: "test_en",
    };

    test("ko locale인 경우, name_ko 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test_ko");
        },
      );
    });

    test("en locale인 경우, name_en 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test_en");
        },
      );
    });

    test("unknown locale인 경우, name 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ja",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test");
        },
      );
    });
  });
});
