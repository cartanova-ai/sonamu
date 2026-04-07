import { type DurationString, type StepApi } from "@sonamu-kit/tasks/internal";
import inflection from "inflection";

export type StepFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult;
export type RunnableStep<TArgs extends unknown[], TResult> = {
  run: StepFunction<TArgs, Promise<TResult>>;
};

export type MethodNames<T, TKey extends keyof T> = T[TKey] extends (
  ...args: infer _TArgs
) => infer _TResult
  ? TKey
  : never;

export type MethodArguments<T, TKey extends keyof T> = T[TKey] extends (
  ...args: infer TArgs
) => unknown
  ? TArgs
  : never;

export type MethodReturnType<T, TKey extends keyof T> = T[TKey] extends (
  this: T,
  ...args: infer _TArgs
) => infer TResult
  ? TResult
  : never;

export class StepWrapper {
  readonly #stepApi: StepApi;

  constructor(stepApi: StepApi) {
    this.#stepApi = stepApi;
  }

  get<
    T,
    TKey extends keyof T,
    TArgs extends MethodArguments<T, TKey>,
    TResult extends MethodReturnType<T, TKey>,
  >(config: { name: string }, object: T, name: MethodNames<T, TKey>): RunnableStep<TArgs, TResult>;
  get<
    T,
    TKey extends keyof T,
    TArgs extends MethodArguments<T, TKey>,
    TResult extends MethodReturnType<T, TKey>,
  >(object: T, name: MethodNames<T, TKey>): RunnableStep<TArgs, TResult>;
  get<
    T,
    TKey extends keyof T,
    TArgs extends MethodArguments<T, TKey>,
    TResult extends MethodReturnType<T, TKey>,
  >(
    ...args: [{ name: string }, T, MethodNames<T, TKey>] | [T, MethodNames<T, TKey>]
  ): RunnableStep<TArgs, TResult> {
    let config: { name: string };
    let fn: StepFunction<TArgs, Exclude<TResult, never>>;

    if (args.length === 2) {
      const [rawObject, methodName] = args;
      const method = rawObject[methodName] as CallableFunction;
      config = { name: inflection.underscore(methodName.toString()) };

      fn = (...args: TArgs) => method.bind(rawObject)(...args);
    } else {
      const [rawConfig, rawObject, name] = args;
      const method = rawObject[name] as CallableFunction;

      config = { name: rawConfig.name ?? inflection.underscore(name.toString()) };
      fn = (...args: TArgs) => method.bind(rawObject)(...args);
    }

    return {
      run: ((stepApi: StepApi, ...args: TArgs) => {
        return stepApi.run(config, () => fn(...args));
      }).bind(null, this.#stepApi),
    };
  }

  define<TArgs extends unknown[], TResult>(
    config: { name: string },
    fn: StepFunction<TArgs, TResult>,
  ) {
    return {
      run: ((stepApi: StepApi, ...args: TArgs) => {
        return stepApi.run(config, () => fn(...args));
      }).bind(null, this.#stepApi),
    };
  }

  sleep(name: string, duration: DurationString) {
    return this.#stepApi.sleep(name, duration);
  }
}
