import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildPhysicalIndexName, buildWriteAliasName } from "../../src/definition/names";
import {
  compareSemanticVersions,
  parseSemanticVersion,
  SUPPORTED_OPENSEARCH_MAX_EXCLUSIVE,
  SUPPORTED_OPENSEARCH_MIN,
  SUPPORTED_POSTGRES_MAJOR,
  SUPPORTED_SDK_MAX_EXCLUSIVE,
  SUPPORTED_SDK_MIN,
  versionFromImageTag,
} from "../helpers/env";
import { useIntegrationHarness } from "../helpers/harness";
import { type JsonLine, readEngineVersion, sendBulk } from "../helpers/opensearch-ops";

/**
 * Pins engine behaviour the package relies on and that no other test exercises through package code. CI reruns it
 * with SONAMU_OPENSEARCH_TEST_IMAGE=opensearchproject/opensearch:3.9.0.
 */

const harness = useIntegrationHarness({ sampleDomain: false });
const requireFromHere = createRequire(import.meta.url);

type Target = { physical: string; alias: string };

function sdkVersion(packageJsonPath: string): string {
  return z
    .looseObject({ version: z.string() })
    .parse(JSON.parse(readFileSync(requireFromHere.resolve(packageJsonPath), "utf8"))).version;
}

/** Creates the index and its write alias in one request, with the package's create body. */
async function createTarget(logicalKey = "chat"): Promise<Target> {
  const targetId = randomUUID();
  const physical = buildPhysicalIndexName(harness.namespace, logicalKey, targetId);
  const alias = buildWriteAliasName(physical);
  await harness.opensearch.indices.create({
    index: physical,
    body: {
      settings: { number_of_shards: 1, number_of_replicas: 0 },
      aliases: { [alias]: { is_write_index: true } },
      mappings: {
        dynamic: "strict",
        _meta: {
          sonamu: {
            target_id: targetId,
            namespace: harness.namespace,
            logical_key: logicalKey,
            fingerprint: "fp-test",
            hash_version: "sonamu-c14n-v1",
            envelope: 1,
          },
        },
        properties: {
          sonamu_meta: {
            dynamic: "strict",
            properties: {
              deleted: { type: "boolean" },
              revision: { type: "long" },
              hash_version: { type: "keyword" },
              projection_hash: { type: "keyword" },
            },
          },
          doc: {
            dynamic: "strict",
            properties: { body: { type: "text" }, room_id: { type: "long" } },
          },
        },
      },
    },
  });
  return { physical, alias };
}

function present(id: string, version: number, body: string): JsonLine[] {
  return [
    { index: { _id: id, version, version_type: "external" } },
    {
      sonamu_meta: {
        deleted: false,
        revision: version,
        hash_version: "sonamu-c14n-v1",
        projection_hash: `h${version}`,
      },
      doc: { body, room_id: 1 },
    },
  ];
}

function tombstone(id: string, version: number): JsonLine[] {
  return [
    { index: { _id: id, version, version_type: "external" } },
    {
      sonamu_meta: {
        deleted: true,
        revision: version,
        hash_version: "sonamu-c14n-v1",
        projection_hash: "tombstone",
      },
    },
  ];
}

const WORKER_QUERY = {
  require_alias: true,
  filter_path:
    "errors,items.*._id,items.*.status,items.*._version,items.*.error.type,items.*.error.reason",
};

const mgetSchema = z.looseObject({
  docs: z.array(
    z.looseObject({
      _id: z.string(),
      found: z.boolean(),
      _version: z.number().optional(),
      _source: z
        .looseObject({ sonamu_meta: z.looseObject({ revision: z.number(), deleted: z.boolean() }) })
        .optional(),
    }),
  ),
});

async function mget(
  index: string,
  ids: readonly string[],
): Promise<z.infer<typeof mgetSchema>["docs"]> {
  const response = await harness.opensearch.transport.request({
    method: "POST",
    path: `/${encodeURIComponent(index)}/_mget`,
    querystring: { _source_includes: "sonamu_meta" },
    body: { ids },
  });
  return mgetSchema.parse(response.body).docs;
}

describe("엔진 버전 매트릭스", () => {
  it("실행 중인 엔진, PostgreSQL, SDK 버전이 지원 범위 안이다", async () => {
    const engine = await readEngineVersion(harness.opensearch);
    expect(engine.distribution).toBe("opensearch");
    const parsed = parseSemanticVersion(engine.number);
    expect(parsed, `엔진 버전 ${engine.number}`).not.toBeNull();
    if (parsed === null) {
      return;
    }
    const min = parseSemanticVersion(SUPPORTED_OPENSEARCH_MIN);
    const max = parseSemanticVersion(SUPPORTED_OPENSEARCH_MAX_EXCLUSIVE);
    if (min === null || max === null) {
      throw new Error("지원 범위 상수가 x.y.z 형식이 아닙니다.");
    }
    expect(compareSemanticVersions(parsed, min)).toBeGreaterThanOrEqual(0);
    expect(compareSemanticVersions(parsed, max)).toBeLessThan(0);
    // When the image tag is a version, that engine must really be running, proving the override took effect.
    const expected = versionFromImageTag(harness.env.opensearch?.image ?? "");
    if (expected !== null) {
      expect(engine.number).toBe(expected);
    }

    const { rows } = await harness.knex.raw<{ rows: { server_version_num: string }[] }>(
      "SHOW server_version_num",
    );
    const postgresVersion = Number(rows[0].server_version_num);
    expect(Math.floor(postgresVersion / 10_000)).toBe(SUPPORTED_POSTGRES_MAJOR);

    const sdk = parseSemanticVersion(sdkVersion("@opensearch-project/opensearch/package.json"));
    const sdkMin = parseSemanticVersion(SUPPORTED_SDK_MIN);
    const sdkMax = parseSemanticVersion(SUPPORTED_SDK_MAX_EXCLUSIVE);
    if (sdk === null || sdkMin === null || sdkMax === null) {
      throw new Error("SDK 버전을 읽지 못했습니다.");
    }
    expect(compareSemanticVersions(sdk, sdkMin)).toBeGreaterThanOrEqual(0);
    expect(compareSemanticVersions(sdk, sdkMax)).toBeLessThan(0);
    expect(sdkVersion("opensearch-sdk-floor/package.json")).toBe(SUPPORTED_SDK_MIN);
  });

  describe("external 버전 bulk", () => {
    it("더 높은 버전은 받고, 같거나 낮은 버전은 항목별 409로 거부하며 이웃 항목은 성공한다", async () => {
      const target = await createTarget();
      const first = await sendBulk(
        harness.opensearch,
        target.alias,
        [...present("a", 5, "v5"), ...present("b", 1, "b1")],
        WORKER_QUERY,
      );
      expect(first.statusCode).toBe(200);
      expect(first.errors).toBe(false);
      expect(first.items.map((item) => [item.id, item.status, item.version])).toEqual([
        ["a", 201, 5],
        ["b", 201, 1],
      ]);

      const second = await sendBulk(
        harness.opensearch,
        target.alias,
        [
          ...present("a", 6, "v6"),
          ...present("a", 6, "v6-dup"),
          ...present("a", 4, "v4"),
          ...present("b", 2, "b2"),
        ],
        WORKER_QUERY,
      );
      expect(second.statusCode).toBe(200);
      expect(second.errors).toBe(true);
      expect(
        second.items.map((item) => [item.id, item.status, item.version, item.error?.type]),
      ).toEqual([
        ["a", 200, 6, undefined],
        ["a", 409, undefined, "version_conflict_engine_exception"],
        ["a", 409, undefined, "version_conflict_engine_exception"],
        ["b", 200, 2, undefined],
      ]);

      const docs = await mget(target.physical, ["a", "b", "absent"]);
      expect(
        docs.map((doc) => [doc._id, doc.found, doc._version, doc._source?.sonamu_meta.revision]),
      ).toEqual([
        ["a", true, 6, 6],
        ["b", true, 2, 2],
        ["absent", false, undefined, undefined],
      ]);
    });

    it("버전으로 Number.MAX_SAFE_INTEGER를 받고 그대로 돌려준다", async () => {
      const target = await createTarget();
      const result = await sendBulk(
        harness.opensearch,
        target.alias,
        tombstone("big", Number.MAX_SAFE_INTEGER),
        WORKER_QUERY,
      );
      expect(result.items.map((item) => [item.status, item.version])).toEqual([
        [201, Number.MAX_SAFE_INTEGER],
      ]);
    });
  });

  describe("_id 바이트 상한", () => {
    it("512바이트 _id는 받는다", async () => {
      const target = await createTarget();
      const ascii = "a".repeat(512);
      // A Hangul character is 3 bytes in UTF-8, so 170 of them are 510 bytes.
      const korean = "가".repeat(170);
      const result = await sendBulk(
        harness.opensearch,
        target.alias,
        [...tombstone(ascii, 1), ...tombstone(korean, 1)],
        WORKER_QUERY,
      );
      expect(result.items.map((item) => item.status)).toEqual([201, 201]);
    });
  });
});
