import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sonamuDictionary } from "../../dict/sonamu-dictionary";
import { type DictionaryResult } from "../../dict/types";
import { tooling } from "../cli-tooling";
import { attachSonamuTestRoot, detachSonamuTestRoot } from "./helpers/sonamu-test-root";

const DICTIONARY: DictionaryResult = {
  locales: ["ko", "en"],
  defaultLocale: "ko",
  stats: {},
  rows: [
    { key: "Post.title", source: "entity", isFunction: false, ko: "제목", en: "Title" },
    { key: "common.save", source: "project", isFunction: false, ko: "저장", en: "Save" },
  ],
};

function stubDictionary() {
  vi.spyOn(sonamuDictionary, "getDictionary").mockResolvedValue(DICTIONARY);
  return vi.spyOn(sonamuDictionary, "updateEntry").mockResolvedValue(undefined);
}

beforeEach(async () => {
  await attachSonamuTestRoot();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await detachSonamuTestRoot();
});

describe("i18n update의 source 결정", () => {
  it("entity 항목은 source를 생략해도 entity로 갱신한다", async () => {
    const updateEntry = stubDictionary();

    await tooling.i18n.update({ key: "Post.title", values: { ko: "게시글 제목" } });

    expect(updateEntry).toHaveBeenCalledWith({
      oldKey: "Post.title",
      newKey: "Post.title",
      source: "entity",
      values: { ko: "게시글 제목" },
    });
  });

  it("project 항목은 project로 갱신한다", async () => {
    const updateEntry = stubDictionary();

    await tooling.i18n.update({ key: "common.save", values: { ko: "보관" } });

    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ oldKey: "common.save", source: "project" }),
    );
  });

  it("사전에 없는 key는 project로 폴백한다", async () => {
    const updateEntry = stubDictionary();

    await tooling.i18n.update({ key: "unknown.key", values: { ko: "값" } });

    expect(updateEntry).toHaveBeenCalledWith(
      expect.objectContaining({ oldKey: "unknown.key", source: "project" }),
    );
  });

  it("명시한 source가 사전에서 조회한 source보다 우선한다", async () => {
    const updateEntry = stubDictionary();

    await tooling.i18n.update({
      key: "Post.title",
      source: "project",
      values: { ko: "게시글 제목" },
    });

    expect(updateEntry).toHaveBeenCalledWith(expect.objectContaining({ source: "project" }));
  });

  it("key 변경 시에도 기존 항목의 source를 유지한다", async () => {
    const updateEntry = stubDictionary();

    await tooling.i18n.update({
      key: "Post.title",
      newKey: "Post.headline",
      values: { ko: "게시글 제목" },
    });

    expect(updateEntry).toHaveBeenCalledWith({
      oldKey: "Post.title",
      newKey: "Post.headline",
      source: "entity",
      values: { ko: "게시글 제목" },
    });
  });

  it("dry run은 사전을 변경하지 않는다", async () => {
    const updateEntry = stubDictionary();

    await expect(
      tooling.i18n.update({ key: "Post.title", values: { ko: "게시글 제목" }, dryRun: true }),
    ).resolves.toMatchObject({ operation: "update", dryRun: true });

    expect(updateEntry).not.toHaveBeenCalled();
  });
});
