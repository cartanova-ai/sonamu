import { describe, expect, it } from "vitest";

import { useIntegrationHarness } from "../helpers/harness";

/**
 * Every lock-wait assertion in the concurrency tests relies on block() failing when the statement does not wait; a
 * block() that passed vacuously would make them all pass vacuously too.
 */

const harness = useIntegrationHarness();

describe("pg-sessions", () => {
  it("기다려야 할 문장이 막히지 않고 끝나면 block이 실패한다", async () => {
    const { sessions } = await harness.openSessions(["solo"]);
    await expect(sessions.solo.block("SELECT 1")).rejects.toThrow(/대기 없이 끝났습니다/);
    // The session stays usable after the failure.
    expect((await sessions.solo.run<{ one: number }>("SELECT 1 AS one")).rows).toEqual([
      { one: 1 },
    ]);
  });
});
