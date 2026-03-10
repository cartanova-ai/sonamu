import { describe, expect, it } from "vitest";
import { findMissingResolvedPaths, findSourcesOutsideRoot } from "./validation-shared.js";

describe("findSourcesOutsideRoot", () => {
  it("루트 내부 경로는 빈 배열을 반환한다", () => {
    expect(findSourcesOutsideRoot(["src/index.ts", "lib/util.ts"], "/project")).toEqual([]);
  });

  it("루트 외부로 탈출하는 경로만 반환한다", () => {
    const result = findSourcesOutsideRoot(
      ["src/index.ts", "../../etc/passwd", "../secret.ts"],
      "/project",
    );
    expect(result).toEqual(["../../etc/passwd", "../secret.ts"]);
  });

  it("빈 배열 입력 시 빈 배열을 반환한다", () => {
    expect(findSourcesOutsideRoot([], "/project")).toEqual([]);
  });
});

describe("findMissingResolvedPaths", () => {
  it("모든 경로가 known set에 있으면 빈 배열을 반환한다", () => {
    const known = new Set(["/a", "/b"]);
    expect(findMissingResolvedPaths(["/a", "/b"], known)).toEqual([]);
  });

  it("known set에 없는 경로만 반환한다", () => {
    const known = new Set(["/a"]);
    expect(findMissingResolvedPaths(["/a", "/b", "/c"], known)).toEqual(["/b", "/c"]);
  });

  it("빈 배열 입력 시 빈 배열을 반환한다", () => {
    expect(findMissingResolvedPaths([], new Set(["/a"]))).toEqual([]);
  });
});
