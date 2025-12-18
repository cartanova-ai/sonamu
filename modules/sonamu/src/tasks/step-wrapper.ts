import type { DurationString, StepApi } from "@sonamu-kit/tasks/internal";

type SonamuStepFunction<TArgs extends unknown[], TResult> = (...args: TArgs) => TResult;

type RunnableStep<TArgs extends unknown[], TResult> = {
  run: (...args: TArgs) => Promise<TResult>;
};

export class StepWrapper {
  readonly #stepApi: StepApi;

  constructor(stepApi: StepApi) {
    this.#stepApi = stepApi;
  }

  get<TArgs extends unknown[], TResult>(
    fn: SonamuStepFunction<TArgs, TResult>,
  ): RunnableStep<TArgs, TResult>;
  get<TArgs extends unknown[], TResult>(
    config: { name?: string },
    fn: SonamuStepFunction<TArgs, TResult>,
  ): RunnableStep<TArgs, TResult>;
  get<TArgs extends unknown[], TResult>(
    ...args:
      | [{ name?: string }, SonamuStepFunction<TArgs, TResult>]
      | [SonamuStepFunction<TArgs, TResult>]
  ): RunnableStep<TArgs, TResult> {
    let config: { name: string };
    let fn: SonamuStepFunction<TArgs, TResult>;

    if (args.length === 1) {
      [fn] = args;
      config = { name: fn.name };
    } else {
      const [rawConfig, rawFn] = args;
      config = { name: rawConfig.name ?? rawFn.name };
      fn = rawFn;
    }

    const run = ((stepApi: StepApi, ...args: TArgs) => {
      const wrappedFn = () => fn.apply(this, args);
      return stepApi.run(config, wrappedFn);
    }).bind(this, this.#stepApi);

    return { run };
  }

  sleep(name: string, duration: DurationString) {
    return this.#stepApi.sleep(name, duration);
  }
}
