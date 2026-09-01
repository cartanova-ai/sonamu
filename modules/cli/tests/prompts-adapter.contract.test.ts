import { describe, expect, it, vi } from "vitest";

const clack = vi.hoisted(() => {
  const cancellation = Symbol("clack-cancellation");
  return {
    cancellation,
    text: vi.fn(async () => cancellation),
    select: vi.fn(),
    autocomplete: vi.fn(),
    isCancel: vi.fn((value: symbol) => value === cancellation),
  };
});

// 기본 어댑터와 Clack의 경계를 검증하기 위해 모듈 구현만 대체합니다.
// oxlint-disable-next-line anti-slop/no-module-mocking
vi.mock("@clack/prompts", () => ({
  text: clack.text,
  autocomplete: clack.autocomplete,
  confirm: vi.fn(),
  multiselect: vi.fn(),
  select: clack.select,
  isCancel: clack.isCancel,
}));

import { createPromptsAdapter } from "../src/runtime.js";

describe("기본 Clack 프롬프트 어댑터", () => {
  it("검색 가능한 단일 자동완성 프롬프트로 후보를 선택한다", async () => {
    clack.autocomplete.mockResolvedValueOnce("migrate");
    const adapter = createPromptsAdapter();

    const result = await adapter.select({
      message: "Command",
      choices: ["migrate", "fixture", "entity"],
      initial: "mig",
    });

    expect(clack.autocomplete).toHaveBeenCalledOnce();
    expect(clack.autocomplete).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Command",
        placeholder: expect.stringMatching(/search|type/i),
        initialUserInput: "mig",
        maxItems: expect.any(Number),
        options: [
          { label: "migrate", value: "migrate" },
          { label: "fixture", value: "fixture" },
          { label: "entity", value: "entity" },
        ],
      }),
    );
    const request = clack.autocomplete.mock.calls[0][0];
    expect(request.maxItems).toBeGreaterThan(0);
    expect(request.maxItems).toBeLessThanOrEqual(10);
    expect(clack.text).not.toHaveBeenCalled();
    expect(clack.select).not.toHaveBeenCalled();
    expect(result).toEqual({ value: "migrate" });
  });

  it("자동완성 취소 신호를 값 없이 취소 결과로 변환한다", async () => {
    clack.autocomplete.mockResolvedValueOnce(clack.cancellation);
    const adapter = createPromptsAdapter();

    const result = await adapter.select({ message: "Command", choices: ["migrate"] });

    expect(clack.isCancel).toHaveBeenCalledWith(clack.cancellation);
    expect(result).toEqual({ cancelled: true });
    expect(result).not.toHaveProperty("value");
  });

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
