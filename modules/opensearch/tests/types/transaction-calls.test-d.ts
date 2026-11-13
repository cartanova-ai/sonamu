import { type Knex } from "knex";
import { type PuriTransactionWrapper, type PuriWrapper } from "sonamu";
import { describe, expectTypeOf, it } from "vitest";

import { type MarkChangedResult, type SearchSynchronization } from "../../src/postgres";
import { type SonamuSearchSynchronization } from "../../src/sonamu";

// Runtime refusal is covered by tests/integration/pg/mark-changed-transactions.test.ts and
// tests/sonamu/transaction-nesting.test.ts.

declare const synchronization: SearchSynchronization;
declare const sonamuSynchronization: SonamuSearchSynchronization;
declare const knex: Knex;
declare const trx: Knex.Transaction;
declare const puriWrapper: PuriWrapper;
declare const transactionWrapper: PuriTransactionWrapper;

describe("트랜잭션 호출 타입", () => {
  it("트랜잭션과 트랜잭션 래퍼만 받는다", () => {
    expectTypeOf(synchronization.markChanged(trx, "messages", ["a"])).toEqualTypeOf<
      Promise<MarkChangedResult>
    >();
    expectTypeOf(
      sonamuSynchronization.markChangedIn(transactionWrapper, "messages", ["a"]),
    ).toEqualTypeOf<Promise<MarkChangedResult>>();
    expectTypeOf(sonamuSynchronization.markChanged("messages", ["a"])).toEqualTypeOf<
      Promise<MarkChangedResult>
    >();
  });

  it("일반 Knex, PuriWrapper, 트랜잭션이 아닌 래퍼는 거부한다", () => {
    // @ts-expect-error -- a Knex instance that is not a transaction
    void synchronization.markChanged(knex, "messages", ["a"]);
    // @ts-expect-error -- a PuriWrapper is not a Knex transaction
    void synchronization.markChanged(puriWrapper, "messages", ["a"]);
    // @ts-expect-error -- a PuriWrapper outside a transaction
    void sonamuSynchronization.markChangedIn(puriWrapper, "messages", ["a"]);
    // @ts-expect-error -- markChangedIn takes a PuriTransactionWrapper, not a Knex transaction
    void sonamuSynchronization.markChangedIn(trx, "messages", ["a"]);
  });
});
