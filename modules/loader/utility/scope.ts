import type { FileSystemAsync } from "@loaderkit/resolve/fs";
import type { ModuleFormat } from "node:module";
import JSON5 from "json5";
import { testAnyJavaScript, testAnyTypeScript } from "./translate.js";

const testCommonJS = /\.c[jt]sx?$/i;
const testModule = /\.m[jt]sx?$/i;

/** @internal */
export interface LoaderFileSystem extends FileSystemAsync {
	readFileString: (path: URL) => Promise<string>;
}

/**
 * All we care about in `package.json`
 * @internal
 */
export interface PackageJson {
	type?: string;
}

/** `tsconfig.json` shape */
interface TypeScriptConfig {
	compilerOptions?: CompilerOptions;
	extends?: string;
}

interface CompilerOptions extends EmitOptions, TranspileOptions {}

/** Options which affect the mapping of `.ts` files to virtual `.js` files */
interface EmitOptions {
	allowJs?: boolean;
	emitDeclarationOnly?: boolean;
	noEmit?: boolean;
	outDir?: string;
	resolveJsonModule?: boolean;
	rootDir?: string | undefined;
	rootDirs?: string[] | undefined;
}

/**
 * Passed forward to `esbuild` and affects transpilation of one source file
 * @internal
 */
export interface TranspileOptions {
	experimentalDecorators?: boolean;
	preserveValueImports?: boolean;
	target?: string;
	useDefineForClassFields?: boolean;
	verbatimModuleSyntax?: boolean;

	jsx?: "react-jsx" | "react-jsxdev" | "preserve" | "react-native" | "react";
	jsxFactory?: string;
	jsxFragmentFactory?: string;
	jsxImportSource?: string;
}

/**
 * Derived and processed information from `tsconfig.json` used to map source files back and forth
 * to output files.
 * @internal
 */
export interface ResolutionConfig {
	outputBase: URL | undefined;
	sourceBase: URL;
	allowJs: boolean;
	allowJson: boolean;
}

/**
 * Returns a function that reads and parses the given file, and caches the result forever. Returns
 * `undefined` if the file doesn't exist, and `null` if there was a parser error.
 */
function makeReadParseCachedForever<
	Content,
	Type extends object,
>(
	read: (file: URL) => Promise<Content>,
	extract: (content: Content, configPath: URL) => Type | Promise<Type>,
) {
	const cache = new Map<string, Promise<Type | null | undefined>>();
	return (file: URL) => cache.get(file.href) ?? function() {
		const promise = async function() {
			const content = await async function() {
				try {
					return await read(file);
				} catch {}
			}();
			if (content !== undefined) {
				try {
					return await extract(content, file);
				} catch {
					return null;
				}
			}
		}();
		cache.set(file.href, promise);
		return promise;
	}();
}

// Iterable which walks up the filesystem hierarchy from the given path.
function *iterateDirectoryHierarchy(fileOrDirectory: URL) {
	if (fileOrDirectory.protocol !== "node:") {
		fileOrDirectory = new URL(".", fileOrDirectory);
		yield fileOrDirectory;
		while (fileOrDirectory.pathname !== "/") {
			fileOrDirectory = new URL("..", fileOrDirectory);
			yield fileOrDirectory;
		}
	}
}

// Replace ambiguous tsconfig.json path separators with URL separators
const replaceFragmentSlashes = (location: string) => location.replaceAll("\\", "/");

// Replace path separators, ensuring the result represents a directory (ends with "/")
const replaceFragmentDirectorySlashes = (location: string) => replaceFragmentSlashes(location).replace(/\/+$/, "") + "/";

/**
 * `package.json` locator. Returns the location and content of the nearest `package.json` file.
 * @internal
 */
export async function resolvePackage(fs: FileSystemAsync, fileOrDirectory: URL) {
	for (const directory of iterateDirectoryHierarchy(fileOrDirectory)) {
		try {
			const path = new URL("package.json", directory);
			const content = await fs.readFileJSON(path) as PackageJson;
			return {
				packageJson: content,
				packagePath: path,
				packageDirectory: directory,
			};
		} catch {}
	}
}

/**
 * `tsconfig.json` locator. It returns the flattened configuration taking `extends` causes into
 * account, and expanding relative paths. It also returns a directory mapping which is used to
 * map virtual `.js` back and forth to the underlying `.ts` sources.
 * @internal
 */
export function makeResolveTypeScriptPackage(fs: LoaderFileSystem) {
	const makeLocation = (fragment: string, relativeToFile: URL) => {
		// eslint-disable-next-line no-template-curly-in-string
		if (fragment.startsWith("${configDir}")) {
			// Inject `tsconfig.json` location
			// Replace slashes, and ensure template fragment ends in a slash
			const template = replaceFragmentDirectorySlashes(fragment);
			// Remove final slash from replacement, which we know exists
			const replacement = new URL(".", relativeToFile).href.slice(0, -1);
			// eslint-disable-next-line no-template-curly-in-string
			return new URL(template.replace("${configDir}", replacement));
		} else {
			// Returns a directory file:// URL ending in one "/"
			return new URL(replaceFragmentDirectorySlashes(fragment), relativeToFile);
		}
	};
	const read = makeReadParseCachedForever(
		file => fs.readFileString(file),
		async (content, configPath: URL) => {
			// Parse `tsconfig.json` and flatten `extends` configurations
			const tsConfigJson: TypeScriptConfig = JSON5.parse(content);
			let compilerOptions = tsConfigJson.compilerOptions ?? {};
			if (tsConfigJson.extends !== undefined) {
				const extendsConfigPath = new URL(replaceFragmentSlashes(tsConfigJson.extends), configPath);
				const next = await read(extendsConfigPath);
				if (next != null) {
					compilerOptions = {
						...next.compilerOptions,
						...tsConfigJson.compilerOptions,
					};
				}
			}

			// Make source location resolution config
			const outputBase =
			!compilerOptions.emitDeclarationOnly &&
			!compilerOptions.noEmit &&
			compilerOptions.outDir !== undefined
				? makeLocation(compilerOptions.outDir, configPath)
				: undefined;
			const sourceBase = function() {
				if (compilerOptions.rootDirs) {
					return makeLocation(compilerOptions.rootDirs[0]!, configPath);
				} else if (compilerOptions.rootDir === undefined) {
					return configPath;
				} else {
					return makeLocation(compilerOptions.rootDir, configPath);
				}
			}();
			const locations: ResolutionConfig = {
				outputBase,
				sourceBase,
				allowJs: compilerOptions.allowJs ?? false,
				allowJson: compilerOptions.resolveJsonModule ?? false,
			};
			return { compilerOptions, locations };
		});
	return async (fileOrDirectory: URL, packagePath: URL | undefined) => {
		const stopAt = packagePath ? new URL(".", packagePath) : new URL("file:///");
		const stopAtPath = stopAt.pathname;
		for (const directory of iterateDirectoryHierarchy(fileOrDirectory)) {
			const result = await read(new URL("tsconfig.json", directory));
			if (result === null) {
				break;
			} else if (result) {
				return result;
			}
			if (directory.pathname === stopAtPath) {
				break;
			}
		}
	};
}

/** @internal */
export function resolveFormat(filename: string, packageJson: PackageJson | undefined): ModuleFormat | undefined {
	if (testModule.test(filename)) {
		return "module";
	} else if (testCommonJS.test(filename)) {
		return "commonjs";
	} else if (testAnyJavaScript.test(filename) || testAnyTypeScript.test(filename)) {
		return packageJson?.type === "module" ? "module" : "commonjs";
	}
}
