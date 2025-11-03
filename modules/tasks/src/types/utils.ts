export type Resolvable<T> = T | (() => T) | (() => Promise<T>);
export type Callback<TArg, TReturn> =
  | ((arg: TArg) => TReturn)
  | ((arg: TArg) => Promise<TReturn>);
