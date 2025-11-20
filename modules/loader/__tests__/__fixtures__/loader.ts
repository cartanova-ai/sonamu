import type { LoaderFileSystem } from "#ts/utility/scope";
import type { LoadFnOutput, LoadHookContext, ResolveFnOutput, ResolveHookContext } from "node:module";
import * as assert from "node:assert/strict";
import { SourceTextModule, createContext } from "node:vm";
import { makeAsyncFileSystemFromSyncForTesting, makeTestFileSystem } from "@loaderkit/resolve/adapter";
import { resolve as esmResolve } from "@loaderkit/resolve/esm";
import { makeResolveAndLoad } from "#ts/esm";

/** @internal */
export function makeTestLoader(files: Record<string, string>) {
	const fs = makeAsyncFileSystemFromSyncForTesting(makeTestFileSystem(files)) as LoaderFileSystem;
	const loader = makeResolveAndLoad(fs);
	const resolve = async (specifier: string, parentURL: string | undefined) => {
		const resolveContext: ResolveHookContext = {
			conditions: [ "node" ],
			importAttributes: {},
			parentURL,
		};
		const nextResolve = async (specifier: string, context?: Partial<ResolveHookContext>): Promise<ResolveFnOutput> => {
			assert.ok(context?.parentURL !== undefined);
			const result = await esmResolve(fs, specifier, new URL(context.parentURL));
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
			conditions: [ "node" ],
			importAttributes: resolution.importAttributes ?? {},
			format: resolution.format,
		};
		const nextLoad = async (urlString: string, context?: Partial<LoadHookContext>): Promise<LoadFnOutput> => {
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
		const entry = new SourceTextModule(sourceText.source as string, {
			context,
			identifier: mainResolution.url,
			initializeImportMeta: meta => {
				meta.url = mainResolution.url;
			},
		});
		cache.set(mainResolution.url, Promise.resolve(entry));
		const get = (resolution: ResolveFnOutput) => cache.get(resolution.url) ?? function() {
			const module = async function() {
				const loadResult = await load(resolution);
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				return new SourceTextModule(String(loadResult.source), {
					context,
					identifier: resolution.url,
					initializeImportMeta: meta => {
						meta.url = resolution.url;
					},
				});
			}();
			cache.set(resolution.url, module);
			return module;
		}();
		await entry.link(async (specifier, referencingModule) => {
			const resolution = await resolve(specifier, referencingModule.identifier);
			return get(resolution);
		});
		await entry.evaluate();
		return context as Record<string, unknown>;
	};
	return { evaluate, resolve };
}
