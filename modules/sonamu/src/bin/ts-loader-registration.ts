import { createRequire } from "node:module";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const tsLoaderRegisterStateKey = Symbol.for("sonamu.ts-loader-register.state");
const require = createRequire(import.meta.url);

type TsLoaderRegisterState = {
  registered: boolean;
};

type GlobalWithTsLoaderRegisterState = typeof globalThis & {
  [tsLoaderRegisterStateKey]?: TsLoaderRegisterState;
};

function getTsLoaderRegisterState(): TsLoaderRegisterState {
  const globalState = globalThis as GlobalWithTsLoaderRegisterState;

  if (!globalState[tsLoaderRegisterStateKey]) {
    globalState[tsLoaderRegisterStateKey] = { registered: false };
  }

  return globalState[tsLoaderRegisterStateKey];
}

export async function ensureTsLoaderRegistered(apiRoot: string): Promise<void> {
  const state = getTsLoaderRegisterState();
  if (state.registered) {
    return;
  }

  void apiRoot;
  const loaderPath = require.resolve("@sonamu-kit/ts-loader/loader");

  register(pathToFileURL(loaderPath).href, {
    parentURL: import.meta.url,
  });
  state.registered = true;
}
