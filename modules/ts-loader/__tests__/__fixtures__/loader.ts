import * as assert from "node:assert/strict";
import {
  type LoadFnOutput,
  type LoadHookContext,
  type ResolveFnOutput,
  type ResolveHookContext,
} from "node:module";
import { createContext, SourceTextModule } from "node:vm";

import {
  makeAsyncFileSystemFromSyncForTesting,
  makeTestFileSystem,
} from "@loaderkit/resolve/adapter";
import { resolve as esmResolve } from "@loaderkit/resolve/esm";

import { makeResolveAndLoad } from "#ts/esm";
import { type LoaderFileSystem } from "#ts/utility/scope";

/** @internal */
export function makeTestLoader(files: Record<string, string>) {
  // SAFETY: 테스트 어댑터는 동기 파일 시스템에 readFileString만 추가한 LoaderFileSystem 구현이다.
  const fs = makeAsyncFileSystemFromSyncForTesting(makeTestFileSystem(files)) as LoaderFileSystem;
  const loader = makeResolveAndLoad(fs);
  const resolve = async (specifier: string, parentURL: string | undefined) => {
    const resolveContext: ResolveHookContext = {
      conditions: ["node"],
      importAttributes: {},
      parentURL,
    };
    const nextResolve = async (
      nextSpecifier: string,
      context?: Partial<ResolveHookContext>,
    ): Promise<ResolveFnOutput> => {
      assert.ok(context?.parentURL !== undefined);
      const result = await esmResolve(fs, nextSpecifier, new URL(context.parentURL));
      assert.ok(result.format !== "addon");
      return {
        url: result.url.href,
        format: result.format,
        importAttributes: {},
        shortCircuit: true,
      };
    };
    const resolveResult = await loader.resolve(specifier, resolveContext, nextResolve);
    assert.ok(resolveResult.shortCircuit);
    return resolveResult;
  };
  const load = async (resolution: ResolveFnOutput) => {
    const loadContext: LoadHookContext = {
      conditions: ["node"],
      importAttributes: resolution.importAttributes ?? {},
      format: resolution.format,
    };
    const nextLoad = async (
      urlString: string,
      context?: Partial<LoadHookContext>,
    ): Promise<LoadFnOutput> => {
      const content = await fs.readFileString(new URL(urlString));
      assert.strictEqual(context?.format, "module");
      return {
        format: "module",
        shortCircuit: true,
        source: content,
      };
    };
    const loadResult = await loader.load(resolution.url, loadContext, nextLoad);
    assert.ok(loadResult.shortCircuit);
    return loadResult;
  };
  const evaluate = async (main: string) => {
    const context = createContext();
    const cache = new Map<string, Promise<SourceTextModule>>();
    const mainResolution = await resolve(`file:///${main}`, undefined);
    const sourceText = await load(mainResolution);
    assert.equal(Object.prototype.toString.call(sourceText.source), "[object String]");
    // SAFETY: 위 검증으로 로더 결과가 SourceTextModule이 요구하는 문자열임을 확인했다.
    const entry = new SourceTextModule(sourceText.source as string, {
      context,
      identifier: mainResolution.url,
      initializeImportMeta: (meta) => {
        meta.url = mainResolution.url;
      },
    });
    cache.set(mainResolution.url, Promise.resolve(entry));
    const get = (resolution: ResolveFnOutput) =>
      cache.get(resolution.url) ??
      (() => {
        const module = (async () => {
          const loadResult = await load(resolution);
          assert.equal(Object.prototype.toString.call(loadResult.source), "[object String]");
          return new SourceTextModule(String(loadResult.source), {
            context,
            identifier: resolution.url,
            initializeImportMeta: (meta) => {
              meta.url = resolution.url;
            },
          });
        })();
        cache.set(resolution.url, module);
        return module;
      })();
    await entry.link(async (specifier, referencingModule) => {
      const resolution = await resolve(specifier, referencingModule.identifier);
      return get(resolution);
    });
    await entry.evaluate();
    return context;
  };
  return { evaluate, resolve };
}
