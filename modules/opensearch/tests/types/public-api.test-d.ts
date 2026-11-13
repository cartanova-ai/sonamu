import { type API } from "@opensearch-project/opensearch";
import { expectTypeOf, test } from "vitest";
import { z } from "zod";

import {
  canonicalizeJson,
  computeProjectionHash,
  type DefinedSearch,
  defineSearch,
  HASH_VERSION,
  type HashVersion,
  type JsonObject,
  type NativeSearchBody,
  type Projection,
  type SearchDefinition,
} from "../../src";

const messageSchema = z.object({
  body: z.string(),
  roomId: z.string(),
  score: z.number().nullable(),
  tags: z.array(z.string()),
});
type Message = z.infer<typeof messageSchema>;

const messageDefinition = {
  key: "chat-messages",
  projectionVersion: "1",
  schema: messageSchema,
  settings: { index: { number_of_shards: 1 } },
  mappings: { properties: { body: { type: "text" } }, dynamic: "strict" },
  requiredPlugins: [],
  materialize: async (_context, ids) =>
    new Map(ids.map((id) => [id, { state: "deleted" }] as const)),
  captureScanBoundary: async () => "0",
  scanSourceIds: async () => ({ ids: [] }),
} satisfies SearchDefinition<Message>;

test("defineSearch는 schema에서 TDocument를 추론한다", () => {
  const defined = defineSearch(messageDefinition);
  expectTypeOf(defined).toEqualTypeOf<DefinedSearch<Message>>();
  expectTypeOf(defined.fingerprint).toEqualTypeOf<string>();
  expectTypeOf(defined.hashVersion).toEqualTypeOf<HashVersion>();
  expectTypeOf<
    Parameters<(typeof defined)["schema"]["~standard"]["validate"]>[0]
  >().toEqualTypeOf<unknown>();
});

test("구체 타입의 DefinedSearch는 레지스트리 원소 타입(DefinedSearch)에 넣을 수 있다", () => {
  const registry: readonly DefinedSearch[] = [defineSearch(messageDefinition)];
  expectTypeOf(registry).toExtend<readonly DefinedSearch<JsonObject>[]>();
  expectTypeOf<DefinedSearch<Message>>().toExtend<DefinedSearch>();
});

test("materialize가 스키마와 다른 문서를 돌려주면 컴파일 오류다", () => {
  defineSearch({
    ...messageDefinition,
    materialize: async (_context, ids) =>
      // @ts-expect-error -- a document without body is not a Message
      new Map(ids.map((id) => [id, { state: "present", document: { roomId: "r" } }] as const)),
  });
});

test("NativeSearchBody는 허용 목록의 7개 키만 갖고 SDK 검색 본문으로 보낼 수 있다", () => {
  expectTypeOf<keyof NativeSearchBody>().toEqualTypeOf<
    "query" | "sort" | "size" | "search_after" | "_source" | "highlight" | "track_total_hits"
  >();
  expectTypeOf<NativeSearchBody>().toExtend<API.Search_RequestBody>();
  const allowed: NativeSearchBody = { query: { match_all: {} }, size: 10, track_total_hits: false };
  expectTypeOf(allowed).toExtend<NativeSearchBody>();
  // @ts-expect-error -- aggs is outside the allowlist
  const withAggs: NativeSearchBody = { query: { match_all: {} }, aggs: {} };
  // @ts-expect-error -- pit is attached only through package cursors
  const withPit: NativeSearchBody = { pit: { id: "p" } };
  expectTypeOf(withAggs).toExtend<NativeSearchBody>();
  expectTypeOf(withPit).toExtend<NativeSearchBody>();
});

test("정규화 API는 JSON 값만 받는다", () => {
  expectTypeOf(HASH_VERSION).toEqualTypeOf<"sonamu-c14n-v1">();
  expectTypeOf(canonicalizeJson).returns.toEqualTypeOf<string>();
  // @ts-expect-error -- not a JSON value
  canonicalizeJson(undefined);
  // @ts-expect-error -- not a JSON value
  canonicalizeJson(new Date(0));
  // @ts-expect-error -- not a JSON value
  canonicalizeJson(1n);
  // @ts-expect-error -- undefined inside an object is not a JSON value either
  canonicalizeJson({ a: undefined });
  const deleted: Projection<JsonObject> = { state: "deleted" };
  expectTypeOf(computeProjectionHash(deleted)).toEqualTypeOf<string>();
  // @ts-expect-error -- a deleted projection has no document
  const deletedWithDocument: Projection<JsonObject> = { state: "deleted", document: {} };
  expectTypeOf(deletedWithDocument).toExtend<Projection<JsonObject>>();
});
