import type { ResolutionConfig } from "./scope.js";

const fileNameOf = (file: URL) => {
	const { pathname } = file;
	return pathname.slice(pathname.lastIndexOf("/") + 1);
};

/** @internal */
export const testAnyJavaScript = /\.[cm]?jsx?$/i;
/** @internal */
export const testAnyJSON = /\.json$/i;
/** @internal */
export const testAnyTypeScript = /\.[cm]?tsx?$/i;
/** @internal */
export const testAnyScript = /\.[cm]?[jt]sx?$/i;

const identity = (pathname: string) => pathname;
const relativeJavaScriptToTypeScript = (pathname: string) => pathname.replace(/\.([cm])?js(x?)$/i, ".$1ts$2");
const relativeTypeScriptToJavaScript = (pathname: string) => pathname.replace(/\.([cm])?ts(x?)$/i, ".$1js$2");

/** @internal */
export const absoluteJavaScriptToTypeScript = (location: URL) =>
	new URL(relativeJavaScriptToTypeScript(fileNameOf(location)) + location.search + location.hash, location);

/** @internal */
export const absoluteTypeScriptToJavaScript = (location: URL) =>
	new URL(relativeTypeScriptToJavaScript(fileNameOf(location)) + location.search + location.hash, location);

/**
 * Translates a file from a given base dir to another. If the file is not located within `fromDir`
 * then it returns `null`.
 */
function translateLocation(location: URL, fromDir: URL, toDir: URL, convert = identity) {
	const locationPath = location.pathname;
	const fromPath = fromDir.pathname;
	if (locationPath.startsWith(fromPath)) {
		return new URL(convert(locationPath.slice(fromPath.length)) + location.search + location.hash, toDir);
	} else {
		return null;
	}
}

/**
 * Translate a given source URL to its output URL. If the source URL is not in `rootDir` then `null`
 * is returned. If `outDir` is not set, `noEmit` is true, (etc) then `undefined` is returned.
 * @internal
 */
export function sourceToOutput(source: URL, locations: ResolutionConfig | undefined) {
	const { pathname } = source;
	if (locations?.outputBase) {
		const isTs = testAnyTypeScript.test(pathname);
		if (!isTs) {
			if (
				(!locations.allowJs && testAnyJavaScript.test(pathname)) ||
				(!locations.allowJson && testAnyJSON.test(pathname))
			) {
				return;
			}
		}
		return translateLocation(source, locations.sourceBase, locations.outputBase, isTs ? relativeTypeScriptToJavaScript : identity);
	} else if (testAnyTypeScript.test(pathname)) {
		// Direct .ts imports always resolve to .js for consistency
		return absoluteTypeScriptToJavaScript(source);
	}
}

/**
 * Given an output file URL it yields all possible source file locations. Given the ambiguity `.js`
 * with `allowJs`, and also `rootDirs`, the resolution is not always clear.
 * @internal
 */
export function *outputToSourceCandidates(output: URL, locations: ResolutionConfig | undefined) {
	if (locations?.outputBase) {
		if (testAnyJavaScript.test(output.pathname)) {
			const tsCandidate = translateLocation(output, locations.outputBase, locations.sourceBase, relativeJavaScriptToTypeScript);
			if (tsCandidate) {
				yield tsCandidate;
				if (locations.allowJs) {
					yield absoluteTypeScriptToJavaScript(tsCandidate);
				}
			}
		} else if (testAnyTypeScript.test(output.pathname)) {
			const candidate = translateLocation(output, locations.outputBase, locations.sourceBase, identity);
			if (candidate) {
				yield candidate;
			}
		} else if (testAnyJSON.test(output.pathname)) {
			const candidate = translateLocation(output, locations.outputBase, locations.sourceBase, identity);
			if (candidate && locations.allowJson) {
				yield candidate;
			}
		}
	} else {
		if (testAnyJavaScript.test(output.pathname)) {
			yield absoluteJavaScriptToTypeScript(output);
		}
		yield output;
	}
}
