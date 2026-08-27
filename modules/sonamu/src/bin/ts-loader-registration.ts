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

export interface TsLoaderRegistrationDependencies {
  registerLoader: (specifier: string, options: { parentURL: string }) => void;
  resolveLoaderPath: () => string;
}

const tsLoaderRegistrationDependencies: TsLoaderRegistrationDependencies = {
  registerLoader(specifier, options) {
    register(specifier, options);
  },
  resolveLoaderPath() {
    return require.resolve("@sonamu-kit/ts-loader/loader");
  },
};

function getTsLoaderRegisterState(): TsLoaderRegisterState {
  const globalState =
    /* SAFETY: CLI 파서와 빌드 도구 입력 계약이 이 값의 타입을 보장한다. */ globalThis as GlobalWithTsLoaderRegisterState;

  if (!globalState[tsLoaderRegisterStateKey]) {
    globalState[tsLoaderRegisterStateKey] = { registered: false };
  }

  return globalState[tsLoaderRegisterStateKey];
}

export async function ensureTsLoaderRegistered(
  apiRoot: string,
  dependencies: TsLoaderRegistrationDependencies = tsLoaderRegistrationDependencies,
): Promise<void> {
  const state = getTsLoaderRegisterState();
  if (state.registered) {
    return;
  }

  void apiRoot;
  const loaderPath = dependencies.resolveLoaderPath();

  dependencies.registerLoader(pathToFileURL(loaderPath).href, {
    parentURL: import.meta.url,
  });
  state.registered = true;
}
