import { type Knex } from "knex";
import { describe, expect, it } from "vitest";

import { type DBPreset, DBClass } from "../db";
import { PuriTransactionWrapper } from "../puri-wrapper";
import { UpsertBuilder } from "../upsert-builder";

type TransactionScopeDB = DBClass & {
  runWithTransactionScope?<T>(
    preset: DBPreset,
    transaction: PuriTransactionWrapper,
    callback: () => Promise<T>,
  ): Promise<T>;
};

function createTransactionWrapper(): PuriTransactionWrapper {
  // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
  return new PuriTransactionWrapper({} as Knex.Transaction, new UpsertBuilder());
}

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function expectScopeRunner(db: TransactionScopeDB) {
  expect(db.runWithTransactionScope).toBeTypeOf("function");
  return db.runWithTransactionScope;
}

describe("DB.runWithTransactionScope", () => {
  it("저장소가 없어도 루트 scope를 설치하고 콜백 결과를 반환한 뒤 정리한다", async () => {
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const db = new DBClass() as TransactionScopeDB;
    const transaction = createTransactionWrapper();
    const runScope = expectScopeRunner(db);
    if (!runScope) return;

    let callbackContext: ReturnType<DBClass["getTransactionContext"]> | undefined;
    const result = await runScope.call(db, "w", transaction, async () => {
      callbackContext = db.getTransactionContext();
      expect(db.transactionStorage.getStore()).toBe(callbackContext);
      expect(callbackContext.getActiveTransaction()).toBe(transaction);
      expect(callbackContext.getTransaction("w")).toBe(transaction);
      return "완료";
    });

    expect(result).toBe("완료");
    expect(callbackContext?.getActiveTransaction()).toBeUndefined();
    expect(callbackContext?.getTransaction("w")).toBeUndefined();
    expect(db.transactionStorage.getStore()).toBeUndefined();
  });

  it("scope 안에서 생성된 detached descendant가 완료된 자식 트랜잭션을 다시 사용하지 않는다", async () => {
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const db = new DBClass() as TransactionScopeDB;
    const parentTransaction = createTransactionWrapper();
    const childTransaction = createTransactionWrapper();
    const descendantReady = createDeferred();
    const resumeDescendant = createDeferred();
    const runScope = expectScopeRunner(db);
    if (!runScope) return;

    let parentContext: ReturnType<DBClass["getTransactionContext"]> | undefined;
    let childContext: ReturnType<DBClass["getTransactionContext"]> | undefined;

    await runScope.call(db, "r", parentTransaction, async () => {
      parentContext = db.getTransactionContext();

      let descendantPromise:
        | Promise<{
            context: ReturnType<DBClass["getTransactionContext"]>;
            active: PuriTransactionWrapper | undefined;
            write: PuriTransactionWrapper | undefined;
            read: PuriTransactionWrapper | undefined;
          }>
        | undefined;

      childContext = await runScope.call(db, "w", childTransaction, async () => {
        const scopedContext = db.getTransactionContext();
        descendantPromise = (async () => {
          descendantReady.resolve();
          await resumeDescendant.promise;
          const context = db.getTransactionContext();
          return {
            context,
            active: context.getActiveTransaction(),
            write: context.getTransaction("w"),
            read: context.getTransaction("r"),
          };
        })();

        await descendantReady.promise;
        return scopedContext;
      });

      expect(db.getTransactionContext()).toBe(parentContext);
      expect(childContext.getActiveTransaction()).toBe(parentTransaction);
      expect(childContext.getTransaction("w")).toBeUndefined();
      expect(childContext.getTransaction("r")).toBe(parentTransaction);

      resumeDescendant.resolve();
      if (!descendantPromise) {
        throw new Error("detached descendant가 생성되지 않았습니다");
      }
      const descendantResult = await descendantPromise;

      expect(descendantResult.context).toBe(childContext);
      expect(descendantResult.active).toBe(parentTransaction);
      expect(descendantResult.write).toBeUndefined();
      expect(descendantResult.read).toBe(parentTransaction);
    });

    expect(parentContext?.getActiveTransaction()).toBeUndefined();
    expect(parentContext?.getTransaction("r")).toBeUndefined();
    expect(childContext?.getActiveTransaction()).toBeUndefined();
    expect(childContext?.getTransaction("r")).toBeUndefined();
    expect(db.transactionStorage.getStore()).toBeUndefined();
  });

  it("같거나 다른 preset의 중첩 범위를 복원하고 같은 오류를 다시 던진다", async () => {
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const db = new DBClass() as TransactionScopeDB;
    const outer = createTransactionWrapper();
    const samePresetInner = createTransactionWrapper();
    const differentPresetInner = createTransactionWrapper();
    const expectedError = new Error("의도한 scope 오류");
    const runScope = expectScopeRunner(db);
    if (!runScope) return;

    await runScope.call(db, "w", outer, async () => {
      const outerContext = db.getTransactionContext();
      expect(outerContext.getActiveTransaction()).toBe(outer);

      await runScope.call(db, "w", samePresetInner, async () => {
        expect(db.getTransactionContext().getActiveTransaction()).toBe(samePresetInner);
        expect(db.getTransactionContext().getTransaction("w")).toBe(samePresetInner);
      });
      expect(db.getTransactionContext()).toBe(outerContext);
      expect(outerContext.getActiveTransaction()).toBe(outer);

      await expect(
        runScope.call(db, "fixture", differentPresetInner, async () => {
          const innerContext = db.getTransactionContext();
          expect(innerContext.getActiveTransaction()).toBe(differentPresetInner);
          expect(innerContext.getTransaction("w")).toBe(outer);
          expect(innerContext.getTransaction("fixture")).toBe(differentPresetInner);
          throw expectedError;
        }),
      ).rejects.toBe(expectedError);

      expect(db.getTransactionContext()).toBe(outerContext);
      expect(outerContext.getActiveTransaction()).toBe(outer);
      expect(outerContext.getTransaction("fixture")).toBeUndefined();
    });

    expect(db.transactionStorage.getStore()).toBeUndefined();
  });

  it("겹치는 sibling 범위가 완료 순서와 무관하게 서로의 활성 트랜잭션을 보지 않는다", async () => {
    // SAFETY: 테스트 입력은 선언된 타입 검증 시나리오에 맞게 고정됩니다.
    const db = new DBClass() as TransactionScopeDB;
    const parentTransaction = createTransactionWrapper();
    const firstTransaction = createTransactionWrapper();
    const secondTransaction = createTransactionWrapper();
    const firstReady = createDeferred();
    const secondReady = createDeferred();
    const firstExited = createDeferred();
    const runScope = expectScopeRunner(db);
    if (!runScope) return;

    let firstContext: ReturnType<DBClass["getTransactionContext"]> | undefined;
    let secondContext: ReturnType<DBClass["getTransactionContext"]> | undefined;

    await runScope.call(db, "r", parentTransaction, async () => {
      const parentContext = db.getTransactionContext();
      const firstPromise = runScope.call(db, "w", firstTransaction, async () => {
        firstReady.resolve();
        await secondReady.promise;
        return {
          context: db.getTransactionContext(),
          active: db.getTransactionContext().getActiveTransaction(),
          write: db.getTransactionContext().getTransaction("w"),
          inheritedRead: db.getTransactionContext().getTransaction("r"),
        };
      });

      await firstReady.promise;
      const secondPromise = runScope.call(db, "w", secondTransaction, async () => {
        secondReady.resolve();
        await firstExited.promise;
        return {
          context: db.getTransactionContext(),
          active: db.getTransactionContext().getActiveTransaction(),
          write: db.getTransactionContext().getTransaction("w"),
          inheritedRead: db.getTransactionContext().getTransaction("r"),
        };
      });

      const firstResult = await firstPromise;
      firstExited.resolve();
      const secondResult = await secondPromise;
      firstContext = firstResult.context;
      secondContext = secondResult.context;

      expect(firstResult.context).not.toBe(secondResult.context);
      expect(firstResult.active).toBe(firstTransaction);
      expect(firstResult.write).toBe(firstTransaction);
      expect(firstResult.inheritedRead).toBe(parentTransaction);
      expect(secondResult.active).toBe(secondTransaction);
      expect(secondResult.write).toBe(secondTransaction);
      expect(secondResult.inheritedRead).toBe(parentTransaction);
      expect(firstResult.context.getActiveTransaction()).toBe(parentTransaction);
      expect(secondResult.context.getActiveTransaction()).toBe(parentTransaction);
      expect(db.getTransactionContext()).toBe(parentContext);
      expect(parentContext.getActiveTransaction()).toBe(parentTransaction);
    });

    expect(firstContext?.getActiveTransaction()).toBeUndefined();
    expect(secondContext?.getActiveTransaction()).toBeUndefined();
    expect(db.transactionStorage.getStore()).toBeUndefined();
  });

  it("기존 bootstrap helper를 런타임 API로 노출하지 않는다", () => {
    const db = new DBClass();

    expect(db).not.toHaveProperty("runWithTransaction");
  });
});
