import { register } from "node:module";
import * as path from "node:path";

import { exists } from "../utils/fs-utils.js";

const tsLoaderRegisterStateKey = Symbol.for("sonamu.ts-loader-register.state");

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

async function setupSwcConfig(apiRoot: string) {
  try {
    const projectSwcrcPath = path.join(apiRoot, ".swcrc");
    if (await exists(projectSwcrcPath)) {
      process.env.TS_LOADER_TRANSFORM_CONFIG_PATH = projectSwcrcPath;
      return;
    }

    const sonamuSwcrcPath = path.join(import.meta.dirname, "..", "..", ".swcrc.project-default");
    if (await exists(sonamuSwcrcPath)) {
      process.env.TS_LOADER_TRANSFORM_CONFIG_PATH = sonamuSwcrcPath;
      return;
    }
  } catch {
    // 환경 변수 설정 실패는 무시 (loader가 기본 설정 사용)
  }
}

export async function ensureTsLoaderRegistered(apiRoot: string): Promise<void> {
  const state = getTsLoaderRegisterState();
  if (state.registered) {
    return;
  }

  await setupSwcConfig(apiRoot);

  register("@sonamu-kit/ts-loader/loader", {
    parentURL: import.meta.url,
  });
  state.registered = true;
}
