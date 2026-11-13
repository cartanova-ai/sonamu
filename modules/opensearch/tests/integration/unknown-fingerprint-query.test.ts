import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SearchDefinitionMismatch } from "../../src/errors";
import { createTestDefinition } from "../../src/testing";
import { useIntegrationHarness } from "../helpers/harness";
import {
  audit,
  LONG_LIFETIMES,
  rejectionOf,
  SIGNING_KEY,
  useReadPathFixture,
} from "../helpers/read-path-fixture";
import { qualified, sql } from "../helpers/sql";

/**
 * When the read target's fingerprint or hash_version does not match the query handle's definitions, the handle sends
 * nothing to the engine and refuses with SearchDefinitionMismatch; after a cutover to a matching target the same handle
 * works. The worker side is in unknown-fingerprint.test.ts.
 */

const h = useIntegrationHarness({ sampleDomain: true });
const rp = useReadPathFixture(h);
const KEY = "messages";

type Doc = { body: string; seq: number };
const source = new Map<string, Doc>();
const documentSchema = z.object({ body: z.string(), seq: z.number().int() });
const PROPERTIES = { body: { type: "text" }, seq: { type: "integer" } } as const;
const V1 = createTestDefinition({
  key: KEY,
  schema: documentSchema,
  properties: PROPERTIES,
  documents: () => source,
});
// The new deployment's definition, unknown to the old process's handle.
const V2 = createTestDefinition({
  key: KEY,
  projectionVersion: "2",
  schema: documentSchema,
  properties: PROPERTIES,
  documents: () => source,
});
const BOTH = [V1, V2] as const;
const LIMITS = {
  maxPageSize: 100,
  timeoutMs: 10_000,
  maxSearchLifetimeMs: LONG_LIFETIMES.maxSearchLifetimeMs,
  maxCursorLifetimeMs: LONG_LIFETIMES.maxCursorLifetimeMs,
  maxPitKeepAliveMs: LONG_LIFETIMES.maxPitKeepAliveMs,
};
const PAGE = { query: { match_all: {} }, size: 2, sort: [{ "doc.seq": "asc" as const }] };

function handle(fingerprints: readonly string[]) {
  return rp.queries<Doc>({
    logicalKey: KEY,
    supportedFingerprints: fingerprints,
    limits: LIMITS,
    cursor: { signingKeys: [SIGNING_KEY] },
  });
}

async function seed(): Promise<void> {
  source.clear();
  for (let i = 1; i <= 5; i += 1) source.set(`doc-${i}`, { body: `본문 ${i}`, seq: i });
  await rp.reset();
}

describe("지원하지 않는 읽기 대상 (쿼리)", () => {
  it("지원하지 않는 fingerprint의 읽기 대상에서 쿼리 핸들은 SearchDefinitionMismatch이고 아무것도 읽지 않으며, 맞는 대상으로 cutover하면 같은 핸들이 동작한다", async () => {
    await seed();
    const admin = rp.admin(BOTH);
    const v2 = await rp.serve(admin, BOTH, V2);
    const old = handle([V1.fingerprint]);
    const both = handle([V1.fingerprint, V2.fingerprint]);

    for (const input of [{ body: PAGE }, { body: PAGE, paginate: { pit: true } }]) {
      const error = await rejectionOf(old.queries.search(input));
      expect(error).toBeInstanceOf(SearchDefinitionMismatch);
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual({
        reason: "unsupported-fingerprint",
        fingerprint: V2.fingerprint,
      });
    }
    // A cursor issued by another process is refused for the same reason.
    const cursor = (await both.queries.search({ body: PAGE, paginate: {} })).nextCursor ?? "";
    expect(cursor).not.toBe("");
    const continued = await rejectionOf(old.queries.search({ body: PAGE, cursor }));
    expect(continued).toBeInstanceOf(SearchDefinitionMismatch);
    expect(continued.details?.reason).toBe("unsupported-fingerprint");
    // The old handle sent no request at all, PIT creation included.
    expect(old.requests).toEqual([]);

    const v1 = await rp.serve(admin, BOTH, V1);
    const page = await old.queries.search({ body: PAGE });
    expect(page.target).toMatchObject({
      targetId: v1.target.targetId,
      fingerprint: V1.fingerprint,
    });
    expect(page.target.targetId).not.toBe(v2.target.targetId);
    expect(page.hits.map((hit) => hit.id)).toEqual(["doc-1", "doc-2"]);
  });

  it("읽기 대상의 hash_version이 이 패키지와 다르면 fingerprint가 맞아도 SearchDefinitionMismatch이다", async () => {
    await seed();
    const admin = rp.admin([V1]);
    const first = await rp.serve(admin, [V1], V1);
    const old = handle([V1.fingerprint]);
    expect((await old.queries.search({ body: PAGE })).hits).toHaveLength(2);
    const requestsBefore = old.requests.length;

    // Simulates a target registered by a package version with another canonicalizer.
    await h.knex.raw(
      sql`UPDATE ${qualified(h.searchSchema, "targets")} SET hash_version = 'sonamu-c14n-v2' WHERE target_id = ?`,
      [first.target.targetId],
    );
    const error = await rejectionOf(old.queries.search({ body: PAGE }));
    expect(error).toBeInstanceOf(SearchDefinitionMismatch);
    expect(error.details).toEqual({
      reason: "unsupported-hash-version",
      hashVersion: "sonamu-c14n-v2",
    });
    expect(old.requests.slice(requestsBefore)).toEqual([]);

    const rebuilt = await admin.beginRebuild(
      { logicalKey: KEY, fingerprint: V1.fingerprint },
      audit(),
    );
    await rp.backfill(admin, rebuilt.buildId);
    await rp.drain(rp.indexer([V1]));
    await rp.refresh();
    await admin.cutover(rebuilt.buildId, audit());
    const page = await old.queries.search({ body: PAGE });
    expect(page.target.targetId).toBe(rebuilt.target.targetId);
    expect(page.hits).toHaveLength(2);
  });
});
