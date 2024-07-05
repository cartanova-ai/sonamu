import { Knex } from "knex";

export function createKnexProxy(
  knexInstance: Knex,
  signal: AbortSignal,
  originalKnex: Knex | null = null
): Knex {
  const DEBUG = true;

  function checkAbort(signal: AbortSignal) {
    if (signal.aborted) {
      throw new Error("The query was aborted");
    }
  }

  function setupAbortHandler() {
    signal.addEventListener("abort", async () => {
      DEBUG && console.log("중단 이벤트 받음");

      const currentInstance = originalKnex ?? knexInstance;
      // console.log((currentInstance as any).context.client.pool);
      const usedPools = (currentInstance as any).context.client.pool.used;
      const threadId = usedPools[usedPools.length - 1].resource.threadId;
      try {
        await currentInstance.raw(`KILL CONNECTION ${threadId}`);
        DEBUG && console.log(`Connection ${threadId} killed.`);
      } catch {
        DEBUG && console.log(`Connection ${threadId} already killed.`);
      }
    });
  }

  const proxyForThen = (result: any) => {
    return new Proxy(result, {
      get(target, prop, receiver) {
        if (prop === "then") {
          return async function (onFulfilled: any, onRejected: any) {
            setupAbortHandler();
            checkAbort(signal);
            return target.then(onFulfilled, onRejected);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  };

  const handler: ProxyHandler<Knex> = {
    get(target, prop, receiver) {
      if (prop === "transaction") {
        return async function (callback: any) {
          return target.transaction(async (trx: Knex.Transaction) => {
            // 트랜잭션 내부에서도 프록시 적용
            return callback(createKnexProxy(trx, signal, knexInstance));
          });
        };
      }

      const originalValue = Reflect.get(target, prop, receiver);
      if (typeof originalValue === "function") {
        return function (...args: any[]) {
          const result = (originalValue as any).apply(target, args);
          if (result && typeof result.then === "function") {
            return proxyForThen(result);
          }
          return result;
        };
      }

      return originalValue;
    },
    apply(target, thisArg, argArray) {
      const result = Reflect.apply(target, thisArg, argArray);
      if (result && typeof result.then === "function") {
        return proxyForThen(result);
      }
      return result;
    },
  };

  return new Proxy(knexInstance, handler);
}
