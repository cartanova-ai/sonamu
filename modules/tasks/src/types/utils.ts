export type Resolvable<T> = T | Promise<T> | (() => T | Promise<T>);
export type Callback<TArg, TReturn> = ((arg: TArg) => TReturn) | ((arg: TArg) => Promise<TReturn>);

export async function resolve<T>(value: Resolvable<T>): Promise<T> {
  if (value instanceof Function) {
    return value();
  }

  return value;
}
