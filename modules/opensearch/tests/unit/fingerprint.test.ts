import { type StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type NativeIndexSettings, type SearchDocumentMappings } from "../../src/client/sdk-types";
import { HASH_VERSION } from "../../src/definition/canonical-json";
import {
  type DefinedSearch,
  defineSearch,
  type SearchDefinition,
} from "../../src/definition/define-search";
import {
  canonicalizeFingerprintInput,
  computeDefinitionFingerprint,
  type FingerprintInput,
} from "../../src/definition/fingerprint";
import { SearchConfigurationError, SearchError } from "../../src/errors";

// Digest computed independently with `printf '%s' ... | shasum -a 256`. A change makes every existing target
// unsupported: bump the input version instead of editing these values.
const CHAT_CANONICAL_INPUT =
  '{"envelope":1,"hashVersion":"sonamu-c14n-v1","key":"chat-messages",' +
  '"mappings":{"properties":{"body":{"analyzer":"ko","type":"text"},"room_id":{"type":"keyword"}}},' +
  '"projectionVersion":"2026-01-01.1","requiredPlugins":["analysis-nori"],' +
  '"settings":{"analysis":{"analyzer":{"ko":{"tokenizer":"nori_tokenizer","type":"custom"}}},' +
  '"index":{"number_of_replicas":0,"number_of_shards":1}},"v":1}';
const CHAT_FINGERPRINT = "fae8a6a8f43d0936e660d7e1dbbc0c0fb7cba41fc7cda3995bbedbbe54d54020";

const chatSchema = z.object({ body: z.string(), room_id: z.string() });
type ChatDocument = z.infer<typeof chatSchema>;

function chatSettings(): NativeIndexSettings {
  return {
    index: { number_of_shards: 1, number_of_replicas: 0 },
    analysis: { analyzer: { ko: { type: "custom", tokenizer: "nori_tokenizer" } } },
  };
}

function chatMappings(): SearchDocumentMappings {
  return {
    properties: { body: { type: "text", analyzer: "ko" }, room_id: { type: "keyword" } },
  };
}

function chatInput(): FingerprintInput {
  return {
    key: "chat-messages",
    projectionVersion: "2026-01-01.1",
    hashVersion: HASH_VERSION,
    settings: chatSettings(),
    mappings: chatMappings(),
    requiredPlugins: ["analysis-nori"],
  };
}

function chatDefinition(): SearchDefinition<ChatDocument> {
  return {
    key: "chat-messages",
    projectionVersion: "2026-01-01.1",
    schema: chatSchema,
    settings: chatSettings(),
    mappings: chatMappings(),
    requiredPlugins: ["analysis-nori"],
    materialize: async (_context, ids) => new Map(ids.map((id) => [id, { state: "deleted" }])),
    captureScanBoundary: async () => "0",
    scanSourceIds: async () => ({ ids: [] }),
  };
}

function forgeDefinition<Value>(value: Value): SearchDefinition<ChatDocument> {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as SearchDefinition<ChatDocument>;
}

function forgeInput<Value>(value: Value): FingerprintInput {
  // SAFETY: deliberate forgery to test runtime rejection.
  return value as FingerprintInput;
}

function captureSearchError(run: () => string | DefinedSearch<ChatDocument>): SearchError {
  try {
    run();
  } catch (error) {
    if (error instanceof SearchError) return error;
    throw error;
  }
  throw new Error("오류가 발생하지 않았습니다.");
}

describe("대상 fingerprint 고정 벡터", () => {
  it("정규 입력과 SHA-256이 고정 벡터와 같다", () => {
    expect(canonicalizeFingerprintInput(chatInput())).toBe(CHAT_CANONICAL_INPUT);
    expect(computeDefinitionFingerprint(chatInput())).toBe(CHAT_FINGERPRINT);
  });

  it("defineSearch가 같은 fingerprint와 hashVersion을 붙인다", () => {
    const defined = defineSearch(chatDefinition());
    expect(defined.fingerprint).toBe(CHAT_FINGERPRINT);
    expect(defined.hashVersion).toBe("sonamu-c14n-v1");
  });
});

describe("fingerprint가 바뀌지 않아야 하는 변경", () => {
  it("settings와 mappings의 키 순서, requiredPlugins 순서", () => {
    const reordered: FingerprintInput = {
      requiredPlugins: ["analysis-nori"],
      mappings: {
        properties: { room_id: { type: "keyword" }, body: { analyzer: "ko", type: "text" } },
      },
      settings: {
        analysis: { analyzer: { ko: { tokenizer: "nori_tokenizer", type: "custom" } } },
        index: { number_of_replicas: 0, number_of_shards: 1 },
      },
      hashVersion: HASH_VERSION,
      projectionVersion: "2026-01-01.1",
      key: "chat-messages",
    };
    expect(computeDefinitionFingerprint(reordered)).toBe(CHAT_FINGERPRINT);
    expect(fingerprintWithPlugins(["b-plugin", "a-plugin"])).toBe(
      fingerprintWithPlugins(["a-plugin", "b-plugin"]),
    );
  });

  it("함수와 schema는 fingerprint 입력이 아니다 (의미가 바뀌면 projectionVersion을 올려야 한다)", () => {
    const changed = defineSearch({
      ...chatDefinition(),
      schema: z.object({ body: z.string().min(1), room_id: z.string() }),
      materialize: async () => new Map(),
      captureScanBoundary: async () => "1",
    });
    expect(changed.fingerprint).toBe(CHAT_FINGERPRINT);
  });

  it("값이 undefined인 dynamic은 생략과 같다", () => {
    const explicitUndefined = computeDefinitionFingerprint({
      ...chatInput(),
      mappings: { ...chatMappings(), dynamic: undefined },
    });
    expect(explicitUndefined).toBe(CHAT_FINGERPRINT);
  });
});

describe("fingerprint가 바뀌어야 하는 변경", () => {
  it("명시적 dynamic 선언은 생략과 다른 fingerprint다", () => {
    // The engine treats omitted and "strict" alike, but the declaration differs.
    expect(
      computeDefinitionFingerprint({
        ...chatInput(),
        mappings: { ...chatMappings(), dynamic: "strict" },
      }),
    ).not.toBe(CHAT_FINGERPRINT);
  });
});

describe("fingerprint 입력 검증", () => {
  it.each<[string, readonly string[], string]>([
    ["빈 이름", [""], "invalid_required_plugins"],
    ["제어 문자", ["analysis\nnori"], "invalid_required_plugins"],
    ["중복", ["analysis-nori", "analysis-nori"], "duplicate_required_plugin"],
  ])("requiredPlugins: %s는 거부한다", (_label, requiredPlugins, reason) => {
    const error = captureSearchError(() =>
      computeDefinitionFingerprint({ ...chatInput(), requiredPlugins }),
    );
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details?.reason).toBe(reason);
  });

  it("settings 안의 undefined는 버리지 않고 필드와 경로를 알려 거부한다", () => {
    const error = captureSearchError(() =>
      computeDefinitionFingerprint(
        forgeInput({ ...chatInput(), settings: { index: { number_of_shards: undefined } } }),
      ),
    );
    expect(error).toBeInstanceOf(SearchConfigurationError);
    expect(error.details).toEqual({
      field: "settings",
      reason: "undefined",
      path: "/index/number_of_shards",
    });
  });

  it("다른 hash_version으로는 계산하지 않는다", () => {
    const hashVersion = forgeInput({ hashVersion: "sonamu-c14n-v2" }).hashVersion;
    const error = captureSearchError(() =>
      computeDefinitionFingerprint({ ...chatInput(), hashVersion }),
    );
    expect(error.details?.reason).toBe("unsupported_hash_version");
  });
});

describe("defineSearch", () => {
  it("정의를 깊게 동결한 복사본을 돌려주고 호출자의 객체는 동결하지 않는다", () => {
    const source = chatDefinition();
    const defined = defineSearch(source);
    expect(Object.isFrozen(defined)).toBe(true);
    expect(Object.isFrozen(defined.settings)).toBe(true);
    expect(Object.isFrozen(defined.settings.index)).toBe(true);
    expect(Object.isFrozen(defined.mappings.properties.body)).toBe(true);
    expect(Object.isFrozen(defined.requiredPlugins)).toBe(true);
    expect(Object.isFrozen(source.settings)).toBe(false);
    expect(defined.settings).not.toBe(source.settings);
    expect(defined.materialize).toBe(source.materialize);
    expect(defined.schema).toBe(source.schema);
  });

  it("정의한 뒤 원래 settings를 바꿔도 정의와 fingerprint가 어긋나지 않는다", () => {
    const source = chatDefinition();
    const defined = defineSearch(source);
    source.settings.index = { number_of_shards: 9 };
    source.mappings.properties.extra = { type: "keyword" };
    expect(defined.settings.index).toEqual({ number_of_shards: 1, number_of_replicas: 0 });
    expect(defined.mappings.properties.extra).toBeUndefined();
    expect(defined.fingerprint).toBe(CHAT_FINGERPRINT);
  });

  it("requiredPlugins는 선언 순서를 남기고 fingerprint에서만 정렬한다", () => {
    const defined = defineSearch({ ...chatDefinition(), requiredPlugins: ["b", "a"] });
    expect(defined.requiredPlugins).toEqual(["b", "a"]);
    expect(defined.fingerprint).toBe(
      computeDefinitionFingerprint({ ...chatInput(), requiredPlugins: ["a", "b"] }),
    );
  });

  it.each<[string, SearchDefinition<ChatDocument>, string]>([
    [
      "알 수 없는 키",
      forgeDefinition({ ...chatDefinition(), mapping: {} }),
      "unknown_definition_key",
    ],
    ["잘못된 logical key", { ...chatDefinition(), key: "Chat_Messages" }, ""],
    [
      "빈 projectionVersion",
      { ...chatDefinition(), projectionVersion: "" },
      "invalid_projection_version",
    ],
    [
      "제어 문자 projectionVersion",
      { ...chatDefinition(), projectionVersion: "1\n2" },
      "invalid_projection_version",
    ],
    [
      "Standard Schema가 아닌 schema",
      forgeDefinition({ ...chatDefinition(), schema: {} }),
      "invalid_schema",
    ],
    [
      "함수가 아닌 materialize",
      forgeDefinition({ ...chatDefinition(), materialize: "x" }),
      "missing_function",
    ],
    [
      "배열 settings",
      forgeDefinition({ ...chatDefinition(), settings: [] }),
      "settings_not_object",
    ],
    [
      "JSON이 아닌 settings",
      forgeDefinition({ ...chatDefinition(), settings: { index: { at: new Date(0) } } }),
      "unsupported_object",
    ],
  ])("%s는 SearchConfigurationError", (_label, definition, reason) => {
    const error = captureSearchError(() => defineSearch(definition));
    expect(error).toBeInstanceOf(SearchConfigurationError);
    if (reason !== "") expect(error.details?.reason).toBe(reason);
  });

  it("함수 형태의 Standard Schema도 받는다", () => {
    const callableSchema = Object.assign(() => undefined, {
      "~standard": { version: 1, vendor: "test", validate: validateEmptyChat },
    });
    const defined = defineSearch(forgeDefinition({ ...chatDefinition(), schema: callableSchema }));
    expect(defined.fingerprint).toBe(CHAT_FINGERPRINT);
  });
});

function fingerprintWithPlugins(plugins: readonly string[]): string {
  return computeDefinitionFingerprint({ ...chatInput(), requiredPlugins: plugins });
}

function validateEmptyChat(): StandardSchemaV1.SuccessResult<ChatDocument> {
  return { value: { body: "", room_id: "" } };
}
