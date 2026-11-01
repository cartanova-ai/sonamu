import { describe, expect, it } from "vitest";

import { parseClusterEnvelope } from "../src/cluster-bus";

const common = { id: "e", sourceNodeId: "a", targetNodeIds: ["b"], emittedAt: 0 };

describe("클러스터 envelope 검증", () => {
  it("kind가 없는 구버전 메시지는 publish로 정규화한다", () => {
    const legacy = {
      ...common,
      audience: { type: "all" },
      event: "message",
      frames: { "/chat": "{}" },
    };
    expect(parseClusterEnvelope(JSON.stringify(legacy))).toEqual({ ...legacy, kind: "publish" });
  });

  it.each([1, "1"])("퇴장 제어 메시지의 사용자 타입을 보존한다: %s", (userId) => {
    const control = { ...common, kind: "leaveUser", userId, roomId: "room", namespace: "chat" };
    expect(parseClusterEnvelope(JSON.stringify(control))).toEqual(control);
  });

  it("알 수 없는 kind와 잘못된 JSON은 수신하지 않는다", () => {
    expect(parseClusterEnvelope(JSON.stringify({ ...common, kind: "unknown" }))).toBeUndefined();
    expect(parseClusterEnvelope("{")).toBeUndefined();
  });
});
