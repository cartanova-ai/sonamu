import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SearchStoreMismatch } from "../../src/errors";
import { useIntegrationHarness } from "../helpers/harness";
import { rewriteIndexStoreId } from "../helpers/index-meta";
import { aliasExists, indexExists } from "../helpers/opensearch-ops";
import { type RecordedRequest } from "../helpers/request-recorder";
import { audit, errorOf, KEY, useRetirementFixture } from "../helpers/retirement-fixture";
import { qualified, sql } from "../helpers/sql";
import { useWorkerFixture } from "../helpers/worker-fixture";

/**
 * _meta.sonamu.store_id is compared with the current store wherever _meta is read. An index without it (created
 * before schema version 2) is accepted; another store's id is refused with remote-store-mismatch before any remote
 * object is touched.
 */

const h = useIntegrationHarness();
const kit = useWorkerFixture(h);
const fixture = useRetirementFixture(h, kit);
const path = (request: RecordedRequest) => `${request.method} ${request.path}`;

async function currentStoreId(): Promise<string> {
  const { rows } = await h.knex.raw<{ rows: { store_id: string }[] }>(
    sql`SELECT store_id::text FROM ${qualified(h.searchSchema, "store")}`,
  );
  return rows[0]?.store_id ?? "";
}

describe("_meta.sonamu.store_id", () => {
  it("은퇴: 다른 저장소의 store_id가 찍힌 인덱스는 alias를 떼기 전에 거부되고 _mapping 읽기 말고는 아무 요청도 보내지 않는다", async () => {
    const prepared = await fixture.prepare({ shortGrace: true });
    await fixture.replaceFirst(prepared);
    const { first } = prepared;
    const foreign = randomUUID();
    await rewriteIndexStoreId(h.opensearch, first.physicalIndex, foreign);
    await fixture.waitForGrace(first.targetId);
    const sent = prepared.requests.length;
    const error = await errorOf(prepared.admin.retireTarget(first.targetId, audit()));
    expect(error).toBeInstanceOf(SearchStoreMismatch);
    expect(error.details).toMatchObject({
      reason: "remote-store-mismatch",
      targetId: first.targetId,
      storeId: await currentStoreId(),
      remoteStoreId: foreign,
    });
    expect(prepared.requests.slice(sent).map(path)).toEqual([
      // A read-only fence check comes first; the _meta check then refuses.
      `POST /${first.physicalIndex}/_mget`,
      `GET /${first.physicalIndex}/_mapping`,
    ]);
    expect(await aliasExists(h.opensearch, first.writeAlias)).toBe(true);
    expect(await indexExists(h.opensearch, first.physicalIndex)).toBe(true);
    expect(await fixture.target(first.targetId)).toMatchObject({
      alias_removed: false,
      index_deleted: false,
    });
    expect(await fixture.leaseToken()).toBeNull();
  });

  it("은퇴: alias를 뗀 뒤 인덱스의 store_id가 다른 저장소의 것이면 인덱스를 지우지 않는다", async () => {
    let armed = false;
    const foreign = randomUUID();
    let physicalIndex = "";
    const prepared = await fixture.prepare({
      shortGrace: true,
      hooks: {
        after: async (request) => {
          if (armed && request.method === "DELETE" && request.path.includes("/_alias/")) {
            armed = false;
            await rewriteIndexStoreId(h.opensearch, physicalIndex, foreign);
          }
          return undefined;
        },
      },
    });
    await fixture.replaceFirst(prepared);
    const { first } = prepared;
    physicalIndex = first.physicalIndex;
    await fixture.waitForGrace(first.targetId);
    armed = true;
    const sent = prepared.requests.length;
    const error = await errorOf(prepared.admin.retireTarget(first.targetId, audit()));
    expect(error).toBeInstanceOf(SearchStoreMismatch);
    expect(error.details).toMatchObject({
      reason: "remote-store-mismatch",
      remoteStoreId: foreign,
    });
    expect(prepared.requests.slice(sent).map(path)).toEqual([
      `POST /${first.physicalIndex}/_mget`,
      `GET /${first.physicalIndex}/_mapping`,
      `DELETE /${first.physicalIndex}/_alias/${first.writeAlias}`,
      `GET /${first.physicalIndex}/_mapping`,
    ]);
    expect(await indexExists(h.opensearch, first.physicalIndex)).toBe(true);
    expect(await fixture.target(first.targetId)).toMatchObject({
      alias_removed: true,
      index_deleted: false,
    });
  });

  it("cutover: 새 대상 인덱스의 store_id가 다르면 읽기 헤드를 옮기기 전에 거부되고, store_id가 없으면 옮긴다", async () => {
    const prepared = await fixture.prepare();
    await fixture.serveOpenBuild(prepared.admin);
    const second = await prepared.admin.beginRebuild(
      { logicalKey: KEY, fingerprint: prepared.fingerprint },
      audit(),
    );
    await fixture.backfill(prepared.admin, second.buildId);
    await rewriteIndexStoreId(h.opensearch, second.target.physicalIndex, randomUUID());
    const refused = await errorOf(prepared.admin.cutover(second.buildId, audit()));
    expect(refused).toBeInstanceOf(SearchStoreMismatch);
    expect(refused.details?.reason).toBe("remote-store-mismatch");
    expect((await prepared.admin.inspect(KEY)).readHead.targetId).toBe(prepared.first.targetId);

    await rewriteIndexStoreId(h.opensearch, second.target.physicalIndex, undefined);
    const moved = await prepared.admin.cutover(second.buildId, audit());
    expect(moved.readTargetId).toBe(second.target.targetId);
  });
});
