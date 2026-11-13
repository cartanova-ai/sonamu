import { randomUUID } from "node:crypto";

import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import {
  type ClaimedDelivery,
  renderDeliveryStatements,
} from "../../../src/postgres/delivery-store";
import { renderSql, schemaIdentifier } from "../../../src/postgres/sql";
import {
  type DeliveryFixture,
  GATE_KEY,
  LONG_LEASE_MS,
  useDeliveryFixture,
} from "../../helpers/delivery-fixture";
import { useIntegrationHarness } from "../../helpers/harness";
import { type PgSession } from "../../helpers/pg-sessions";
import { identifier, sql } from "../../helpers/sql";
import { waitForLockWait } from "../../helpers/test-targets";

/**
 * Worker A's claim is parked after it took its snapshot and before it locks the first row: a test-only statement trigger
 * on delivery_runtime waits on an advisory lock, only on connections with sonamu_test.gate = on. Worker B then claims or
 * acknowledges, and the gate is opened to see what A's stale snapshot does.
 */

const h = useIntegrationHarness({ opensearch: false, sampleDomain: false });
const fixture = useDeliveryFixture(h);
const { workerPool, poolPid, setUp, mark, intents, runtimes, waitForExpiry, installGate } = fixture;
type Fixture = DeliveryFixture;

type Race = { f: Fixture; gated: Knex; gatedPid: number; other: Knex; holder: PgSession };

async function prepareRace(): Promise<Race> {
  const f = await setUp();
  await installGate();
  await mark(f, ["a", "c"]);
  const gated = workerPool();
  // Single-connection pool, so the session setting sticks to every later statement.
  await gated.raw("SET sonamu_test.gate = 'on'");
  const gatedPid = await poolPid(gated);
  const { sessions } = await h.openSessions(["holder"]);
  return { f, gated, gatedPid, other: workerPool(), holder: sessions.holder };
}

const claimInput = (f: Fixture, token: string, leaseMs = LONG_LEASE_MS) => ({
  targetIds: [f.target.targetId],
  limit: 10,
  leaseToken: token,
  leaseMs,
});

// The promise is wrapped in an object: returning it bare from an async function would make the caller await the claim.
async function startStaleClaim(
  race: Race,
  token: string,
): Promise<{ pending: Promise<ClaimedDelivery[]> }> {
  await race.holder.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);
  const pending = race.f.store.claim(race.gated, claimInput(race.f, token));
  pending.catch(() => {});
  await waitForLockWait(h.knex, race.gatedPid, race.holder.pid);
  return { pending };
}

async function openGate(race: Race): Promise<void> {
  await race.holder.run("SELECT pg_advisory_unlock($1)", [GATE_KEY]);
}

describe("낡은 스냅샷의 claim", () => {
  it("낡은 스냅샷으로 시작한 claim은 다른 워커가 이미 잡은 임대를 가져가지 못한다: 삽입 경로", async () => {
    const race = await prepareRace();
    const staleToken = randomUUID();
    const { pending } = await startStaleClaim(race, staleToken);

    const winnerToken = randomUUID();
    const winner = await race.f.store.claim(race.other, claimInput(race.f, winnerToken));
    expect(winner.map((row) => row.documentId)).toEqual(["a", "c"]);
    await openGate(race);

    expect(await pending).toEqual([]);
    expect((await runtimes()).map((row) => [row.document_id, row.lease_token, row.live])).toEqual([
      ["a", winnerToken, true],
      ["c", winnerToken, true],
    ]);
  });

  it("낡은 스냅샷으로 시작한 claim은 다른 워커가 이미 잡은 임대를 가져가지 못한다: 갱신 경로", async () => {
    const race = await prepareRace();
    // Expired runtime rows make both documents look claimable in A's snapshot.
    const expiredToken = randomUUID();
    await race.f.store.claim(race.other, claimInput(race.f, expiredToken, 50));
    await waitForExpiry(expiredToken);

    const { pending } = await startStaleClaim(race, randomUUID());
    const winnerToken = randomUUID();
    const winner = await race.f.store.claim(race.other, claimInput(race.f, winnerToken));
    expect(winner.map((row) => row.documentId)).toEqual(["a", "c"]);
    await openGate(race);

    expect(await pending).toEqual([]);
    expect((await runtimes()).map((row) => [row.document_id, row.lease_token, row.live])).toEqual([
      ["a", winnerToken, true],
      ["c", winnerToken, true],
    ]);
  });

  it("이미 적용된 리비전은 낡은 claim으로 다시 임대되지 않는다", async () => {
    const race = await prepareRace();
    const { pending } = await startStaleClaim(race, randomUUID());

    const winnerToken = randomUUID();
    const winner = await race.f.store.claim(race.other, claimInput(race.f, winnerToken));
    const acknowledged = await race.f.store.acknowledge(race.other, {
      leaseToken: winnerToken,
      items: winner.map((row) => ({ ...row, materializedRevision: 1 })),
    });
    expect(acknowledged.map((row) => row.outcome)).toEqual(["deleted", "deleted"]);
    await openGate(race);

    expect(await pending).toEqual([]);
    expect({ intents: await intents(), runtimes: await runtimes() }).toEqual({
      intents: [],
      runtimes: [],
    });
  });

  it("대조: claim 문장에서 현재 런타임 행의 재확인(DO UPDATE WHERE)을 빼면 같은 순서에서 살아 있는 임대를 덮어쓴다", async () => {
    const race = await prepareRace();
    // The claim statement without the WHERE of ON CONFLICT ... DO UPDATE: proves the race above is really reproduced.
    const planned = renderSql(renderDeliveryStatements(schemaIdentifier(h.searchSchema)).claim);
    const recheck = /\nWHERE \(r\.lease_expires_at IS NULL[\s\S]*?(?=\nRETURNING)/;
    expect(planned).toMatch(recheck);
    const wrong = planned.replace(recheck, "");

    const { sessions } = await h.openSessions(["wrong"]);
    await sessions.wrong.run(sql`SET ROLE ${identifier(fixture.workerRole().name)}`);
    await sessions.wrong.run("SET sonamu_test.gate = 'on'");
    await race.holder.run("SELECT pg_advisory_lock($1)", [GATE_KEY]);
    const staleToken = randomUUID();
    const blocked = await sessions.wrong.block(
      wrong,
      [[race.f.target.targetId], 10, staleToken, LONG_LEASE_MS],
      {
        blockedBy: race.holder,
      },
    );
    const winnerToken = randomUUID();
    expect(await race.f.store.claim(race.other, claimInput(race.f, winnerToken))).toHaveLength(2);
    await openGate(race);

    const stolen = await blocked.expectSuccess();
    expect(stolen.rowCount).toBe(2);
    expect((await runtimes()).map((row) => row.lease_token)).toEqual([staleToken, staleToken]);
  });
});
