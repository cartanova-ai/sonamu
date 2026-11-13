import { type SonamuConfig } from "sonamu";
import { describe, expect, it, vi } from "vitest";

import { type SearchSynchronization } from "../../src/postgres";

/**
 * Applying Sonamu's default locale. It happens once per process, so every case reloads the package modules with
 * vi.resetModules(). No database: markChanged without an active transaction fails, and its message shows the locale.
 */

const unusedSynchronization: SearchSynchronization = {
  namespace: "app",
  schema: "sonamu_search",
  markChanged: () => Promise.reject(new Error("호출되면 안 됩니다.")),
};

async function loadFresh() {
  vi.resetModules();
  const sonamu = await import("sonamu");
  const entry = await import("../../src/sonamu");
  const i18n = await import("../../src/i18n");
  const english = (await import("../../src/i18n/en")).searchMessagesEn;
  const korean = (await import("../../src/i18n/ko")).searchMessagesKo;
  return { sonamu, entry, i18n, english, korean };
}

type Fresh = Awaited<ReturnType<typeof loadFresh>>;

function setDefaultLocale(fresh: Fresh, defaultLocale: string): void {
  // SAFETY: the package reads only i18n from Sonamu.config.
  fresh.sonamu.Sonamu.config = {
    i18n: { defaultLocale, supportedLocales: [defaultLocale] },
  } as SonamuConfig;
}

async function operationMessage(fresh: Fresh): Promise<string> {
  const search = fresh.entry.createSonamuSynchronization(unusedSynchronization);
  const error = await search.markChanged("messages", ["x"]).catch((caught: Error) => caught);
  if (!(error instanceof Error)) throw new Error("markChanged가 실패해야 했습니다.");
  return error.message;
}

describe("Sonamu 기본 locale", () => {
  it("import와 팩토리 시점이 아니라 첫 연산에서 적용하고, Sonamu 초기화 전이면 다음 연산에서 다시 시도한다", async () => {
    const fresh = await loadFresh();
    expect(() => fresh.sonamu.Sonamu.config).toThrow();

    // Before Sonamu is initialized the locale stays English and nothing throws.
    expect(await operationMessage(fresh)).toBe(fresh.english["sonamu.noActiveTransaction"]);
    expect(fresh.i18n.getSearchLocale()).toBe("en");

    setDefaultLocale(fresh, "ko");
    fresh.entry.createSonamuSynchronization(unusedSynchronization);
    expect(fresh.i18n.getSearchLocale()).toBe("en");

    expect(await operationMessage(fresh)).toBe(fresh.korean["sonamu.noActiveTransaction"]);
    expect(fresh.i18n.getSearchLocale()).toBe("ko");

    // Applied once per process: a later config change is ignored.
    setDefaultLocale(fresh, "en");
    await operationMessage(fresh);
    expect(fresh.i18n.getSearchLocale()).toBe("ko");
  });

  it("카탈로그가 없는 locale(ja)이면 영어에 머물고 예외를 던지지 않는다", async () => {
    const fresh = await loadFresh();
    setDefaultLocale(fresh, "ja");
    expect(await operationMessage(fresh)).toBe(fresh.english["sonamu.noActiveTransaction"]);
    expect(fresh.i18n.getSearchLocale()).toBe("en");
  });

  it("기본 언어 카탈로그로 해석되는 태그(ko-KR)는 그 태그로 적용된다", async () => {
    const fresh = await loadFresh();
    setDefaultLocale(fresh, "ko-KR");
    expect(await operationMessage(fresh)).toBe(fresh.korean["sonamu.noActiveTransaction"]);
    expect(fresh.i18n.getSearchLocale()).toBe("ko-KR");
  });

  it("애플리케이션이 setSearchLocale을 먼저 부르면 Sonamu 기본 locale이 덮어쓰지 않는다", async () => {
    const fresh = await loadFresh();
    fresh.i18n.setSearchLocale("en");
    setDefaultLocale(fresh, "ko");
    expect(await operationMessage(fresh)).toBe(fresh.english["sonamu.noActiveTransaction"]);
    expect(fresh.i18n.getSearchLocale()).toBe("en");
  });

  it("애플리케이션이 등록한 카탈로그가 있으면 그 locale을 적용하고 빠진 키는 영어로 대체한다", async () => {
    const fresh = await loadFresh();
    fresh.i18n.registerSearchMessages("ja", {
      "sonamu.noActiveTransaction": "トランザクションがありません。",
    });
    setDefaultLocale(fresh, "ja");
    expect(await operationMessage(fresh)).toBe("トランザクションがありません。");
    expect(fresh.i18n.getSearchLocale()).toBe("ja");
    expect(fresh.i18n.formatSearchMessage({ key: "error.timeout" })).toBe(
      fresh.english["error.timeout"],
    );
  });

  it("형식이 잘못된 기본 locale도 예외 없이 영어에 머문다", async () => {
    const fresh = await loadFresh();
    setDefaultLocale(fresh, "not a locale!");
    expect(await operationMessage(fresh)).toBe(fresh.english["sonamu.noActiveTransaction"]);
    expect(fresh.i18n.getSearchLocale()).toBe("en");
  });
});
