import { Knex } from "knex";

export function createKnexProxy(
  knexInstance: Knex,
  signal: AbortSignal,
  originalKnex: Knex | null = null
): Knex {
  const DEBUG = false;

  function checkAbort(signal: AbortSignal) {
    if (signal.aborted) {
      throw new Error("The query was aborted");
    }
  }

  async function getConnectionId(knexInstance: Knex): Promise<string> {
    const result = await knexInstance.raw("SELECT CONNECTION_ID()");
    return result[0][0]["CONNECTION_ID()"];
  }

  async function initializeConnectionId() {
    const connectionId = await getConnectionId(knexInstance);
    DEBUG && console.log(`Connection ID: ${connectionId}`);

    signal.addEventListener("abort", async () => {
      DEBUG && console.log("중단 이벤트 받음");
      try {
        await (originalKnex ?? knexInstance).raw(`KILL ${connectionId}`);
        DEBUG && console.log(`Connection ${connectionId} killed.`);
      } catch {
        DEBUG && console.log(`Connection ${connectionId} already killed.`);
      }
    });
  }

  const proxyForThen = (result: any) => {
    return new Proxy(result, {
      get(target, prop, receiver) {
        if (prop === "then") {
          return async function (onFulfilled: any, onRejected: any) {
            await initializeConnectionId();
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
