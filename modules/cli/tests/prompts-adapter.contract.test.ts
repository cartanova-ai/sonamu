import { describe, expect, it, vi } from "vitest";

const clack = vi.hoisted(() => {
  const cancellation = Symbol("clack-cancellation");
  return {
    cancellation,
    text: vi.fn(async () => cancellation),
    isCancel: vi.fn((value: symbol) => value === cancellation),
  };
});

// 기본 어댑터와 Clack의 경계를 검증하기 위해 모듈 구현만 대체합니다.
// oxlint-disable-next-line anti-slop/no-module-mocking
vi.mock("@clack/prompts", () => ({
  text: clack.text,
  confirm: vi.fn(),
  multiselect: vi.fn(),
  select: vi.fn(),
  isCancel: clack.isCancel,
}));

import { createPromptsAdapter } from "../src/runtime.js";

describe("기본 Clack 프롬프트 어댑터", () => {
  it("텍스트 프롬프트 취소 신호를 값 없이 취소 결과로 변환한다", async () => {
    const adapter = createPromptsAdapter();

    const result = await adapter.text({ message: "엔티티 이름", initial: "User" });

    expect(clack.text).toHaveBeenCalledWith({
      message: "엔티티 이름",
      initialValue: "User",
    });
    expect(clack.isCancel).toHaveBeenCalledWith(clack.cancellation);
    expect(result).toEqual({ cancelled: true });
    expect(result).not.toHaveProperty("value");
  });
});
