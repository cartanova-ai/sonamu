import { type LoadHook, type ResolveHook } from "node:module";
import path from "node:path";

import { resolve as cjsResolve } from "@loaderkit/resolve/cjs";
import { resolve as esmResolve } from "@loaderkit/resolve/esm";
import { type FileSystemAsync } from "@loaderkit/resolve/fs";

import {
  type LoaderFileSystem,
  type PackageJson,
  type ResolutionConfig,
  type TranspileOptions,
} from "./utility/scope.js";
import { makeResolveTypeScriptPackage, resolveFormat, resolvePackage } from "./utility/scope.js";
import { transpileSource } from "./utility/transform.js";
import {
  absoluteJavaScriptToTypeScript,
  absoluteTypeScriptToJavaScript,
  outputToSourceCandidates,
  sourceToOutput,
  testAnyJavaScript,
  testAnyJSON,
  testAnyScript,
  testAnyTypeScript,
} from "./utility/translate.js";

interface TransformContext {
  compilerOptions?: TranspileOptions;
  packageDirectory?: URL;
}

const testHasScheme = /^[a-z][a-z0-9+.-]*:/i;
const commonJsExtensions = [".js", ".jsx"];
const commonJsImportConditions = ["node", "import", "require"];
const commonJsRequireConditions = ["node", "require"];

function hasKnownSourceExtension(pathname: string) {
  return testAnyScript.test(pathname) || testAnyJSON.test(pathname);
}

/** @internal */
export function makeResolveAndLoad(underlyingFileSystem: LoaderFileSystem) {
  // Cache `package.json` reads
  const fileSystem = {
    ...underlyingFileSystem,
    readFileJSON: ((readFileJSON) => {
      const cache = new Map<string, Promise<unknown>>();
      return (url: URL) =>
        cache.get(url.href) ??
        (() => {
          const result = readFileJSON(url);
          cache.set(url.href, result);
          return result;
        })();
    })(underlyingFileSystem.readFileJSON),
  };

  // tsconfig.resolver utilities
  const resolvedTypeScriptParents = new Map<string, URL>();
  const resolveTypeScriptPackage = makeResolveTypeScriptPackage(fileSystem);
  const resolveTsConfig = async (url: URL) => {
    const packageMeta = await resolvePackage(fileSystem, url);
    return resolveTypeScriptPackage(url, packageMeta?.packagePath);
  };
  const extensionlessSourceCandidates = (url: URL) => {
    if (hasKnownSourceExtension(url.pathname) || url.pathname.endsWith("/")) {
      return [];
    }

    return [
      new URL(`${path.basename(url.pathname)}.ts${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}.tsx${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}.mts${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}.cts${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}/index.ts${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}/index.tsx${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}/index.mts${url.search}${url.hash}`, url),
      new URL(`${path.basename(url.pathname)}/index.cts${url.search}${url.hash}`, url),
    ];
  };

  // Resolves from .ts source files to another source file. Used for relative imports.
  const sourceResolverFileSystem = ((): FileSystemAsync => {
    const findSource = async (url: URL) => {
      // First try .js -> .ts map since this is the most likely case
      if (testAnyJavaScript.test(url.pathname)) {
        const asTs = absoluteJavaScriptToTypeScript(url);
        if (await fileSystem.fileExists(asTs)) {
          return asTs;
        }
      }
      // Then try extensionless imports such as "./sonamu.generated" -> "./sonamu.generated.ts"
      for (const candidate of extensionlessSourceCandidates(url)) {
        if (await fileSystem.fileExists(candidate)) {
          return candidate;
        }
      }
      // Try file as is
      if (await fileSystem.fileExists(url)) {
        return url;
      }
    };
    return {
      ...fileSystem,
      fileExists: async (url) => {
        if (!url.pathname.endsWith("/")) {
          return !!(await findSource(url));
        } else {
          return fileSystem.fileExists(url);
        }
      },
      readLink: async (url) => {
        if (!url.pathname.endsWith("/")) {
          const source = await findSource(url);
          if (source) {
            if (source.href === url.href) {
              return fileSystem.readLink(url);
            } else {
              return source.pathname;
            }
          }
        }
        return fileSystem.readLink(url);
      },
    };
  })();

  // Resolves to output .js files. Used for fully qualified imports.
  const outputResolverFileSystem: FileSystemAsync = {
    ...fileSystem,
    fileExists: async (url) => {
      if (
        testAnyScript.test(url.pathname) ||
        (testAnyJSON.test(url.pathname) && !url.pathname.endsWith("/package.json"))
      ) {
        const tsConfig = await resolveTsConfig(url);
        for (const location of outputToSourceCandidates(url, tsConfig?.locations)) {
          if (await fileSystem.fileExists(location)) {
            return true;
          }
        }
        return false;
      } else {
        return fileSystem.fileExists(url);
      }
    },
    readLink: async (url) => {
      if (!testAnyScript.test(url.pathname) && !testAnyJSON.test(url.pathname)) {
        return fileSystem.readLink(url);
      }
    },
  };

  const makeResolver =
    (
      resolverFileSystem: FileSystemAsync,
      packageJson: PackageJson | undefined,
      locations: ResolutionConfig | undefined,
    ) =>
    async (specifier: string, parentURL: URL) => {
      const parentFormat = resolveFormat(parentURL.pathname, packageJson);
      if (locations?.outputBase) {
        // Projects with outputs use a stricter resolution
        if (parentFormat === "module") {
          return esmResolve(resolverFileSystem, specifier, parentURL);
        } else {
          return cjsResolve(resolverFileSystem, specifier, parentURL);
        }
      } else {
        // Projects without outputs fall back to CJS resolution with custom conditions &
        // extensions. This simulates "bundler" like behavior.
        return cjsResolve(resolverFileSystem, specifier, parentURL, {
          conditions:
            parentFormat === "module" ? commonJsImportConditions : commonJsRequireConditions,
          extensions: commonJsExtensions,
        });
      }
    };

  const resolve: ResolveHook = (specifier, context, nextResolve) => {
    const { parentURL: parentUrlString } = context;
    if (parentUrlString === undefined) {
      // Program entrypoint. We can assume that `specifier` is a fully-resolved file URL with
      // no query parameters. It could be either a source file or an output file.
      return (async () => {
        const url = new URL(specifier);
        const packageMeta = await resolvePackage(fileSystem, url);
        const tsConfig = await resolveTypeScriptPackage(url, packageMeta?.packagePath);
        const format = resolveFormat(specifier, packageMeta?.packageJson);
        const outputUrl = sourceToOutput(url, tsConfig?.locations);
        if (outputUrl) {
          // `node main.ts`
          resolvedTypeScriptParents.set(outputUrl.href, url);
          return {
            url: outputUrl.href,
            format,
            importAttributes: {
              ...context.importAttributes,
              ts: url.href,
            },
            shortCircuit: true,
          };
        } else {
          for (const sourceUrl of outputToSourceCandidates(url, tsConfig?.locations)) {
            if (await fileSystem.fileExists(sourceUrl)) {
              // `node dist/main.js`
              resolvedTypeScriptParents.set(url.href, sourceUrl);
              return {
                url: url.href,
                format,
                importAttributes: {
                  ...context.importAttributes,
                  ts: sourceUrl.href,
                },
                shortCircuit: true,
              };
            }
          }
          return nextResolve(specifier, context);
        }
      })();
    }

    // Bail early on relative imports from unknown parents
    // nb: Imports from `--import` on the command line use the cwd (ending in a slash) as the
    // parent
    const parentURL = new URL(parentUrlString);
    const sourceParentURL = resolvedTypeScriptParents.get(parentUrlString);
    if (!sourceParentURL && specifier.startsWith(".") && !parentUrlString.endsWith("/")) {
      return nextResolve(specifier, context);
    }

    // Check for fully-resolved .ts files, i.e. `import(import.meta.resolve('./specifier.js'))`
    if (specifier.startsWith("file:///") && !specifier.includes("/node_modules/")) {
      return (async () => {
        const outputUrl = new URL(specifier);
        const packageMeta = await resolvePackage(fileSystem, outputUrl);
        const tsConfig = await resolveTypeScriptPackage(outputUrl, packageMeta?.packagePath);

        // 이 부분 코드의 원래 목적은 import(import.meta.resolve('./specifier.js'))로 import할 때와 같이
        // file:///.../specifier.js 형식으로 들어오는 fully resolved path에 대해 이에 대응되는 source 파일을 찾아서 반환하는 것이었습니다.
        // 그런데 Saessak을 만들다 보니 file:///.../specifier.ts 형식으로 프로젝트 내의 ts source 파일을 import할 일이 있었습니다.
        // 그러나 이곳 기존 코드는 specifier가 file:/// 형식을 가지기만 하면 이를 "트랜스파일된 js 파일"로 간주하고 이에 대응하는 ts 파일을 찾으려는 이슈가 있었습니다.
        // 이를 해결하기 위해 specifier가 file:/// 형식을 가지고 있음에도 그 파일이 TypeScript 파일이라면 이를 그대로 반환하도록 수정하였습니다.

        // 먼저 파일이 이미 source 파일인지 확인 (TypeScript 파일이고 실제로 존재하는지)
        let sourceUrl: URL | undefined;
        if (
          testAnyTypeScript.test(outputUrl.pathname) &&
          (await fileSystem.fileExists(outputUrl))
        ) {
          sourceUrl = outputUrl;
        } else {
          // output 파일이라면 source 파일을 찾기
          sourceUrl = await (async () => {
            for (const url of outputToSourceCandidates(outputUrl, tsConfig?.locations)) {
              if (await fileSystem.fileExists(url)) {
                return url;
              }
            }
          })();
        }
        if (!sourceUrl) {
          return nextResolve(specifier, context);
        }
        const format = resolveFormat(sourceUrl.pathname, packageMeta?.packageJson);
        resolvedTypeScriptParents.set(outputUrl.href, sourceUrl);
        return {
          format,
          url: outputUrl.href,
          importAttributes: {
            ...context.importAttributes,
            ts: sourceUrl.href,
          },
          shortCircuit: true,
        };
      })();
    }

    // Bail on fully-qualified URLs
    if (testHasScheme.test(specifier)) {
      return nextResolve(specifier, context);
    }

    // Try as TypeScript resolution
    return (async () => {
      if (!specifier.startsWith(".")) {
        const parentPackageMeta = await resolvePackage(fileSystem, parentURL);
        const parentFormat = resolveFormat(parentURL.pathname, parentPackageMeta?.packageJson);

        // Fully-qualified imports (패키지 import)인 경우입니다.
        // 먼저 Node.js의 기본 resolver를 사용하여 실제 패키지 엔트리 포인트를 찾은 뒤,
        // 그것이 /build/ 또는 /dist/ 또는 /node_modules/ 디렉토리를 포함하는지 확인하여,
        // 만약 빌드된 .js 파일이라는 확신이 들면 그대로 사용하고, 아니라면 TypeScript resolution을 시도합니다.
        //
        // 배경:
        // - workspace 패키지(예: @sonamu-kit/hmr-hook)는 node_modules에 없고 modules/ 디렉토리에 있습니다
        // - pnpm workspace에서는 node_modules에 심볼릭 링크를 만들지만, Node.js의 nextResolve는
        //   심볼릭 링크를 따라가서 실제 경로(예: /Users/.../modules/hmr-hook/build/src/hot.js)를 반환합니다
        // - 따라서 node_modules 체크(335줄)에 걸리지 않아서 TypeScript resolution까지 들어옵니다
        // - 하지만 workspace 패키지는 이미 빌드된 파일(build/, dist/)을 사용해야 하므로,
        //   소스 파일(src/)을 찾으려고 시도하면 안 됩니다
        //
        // 해결 방법:
        // - 패키지 import는 먼저 nextResolve를 호출해서 Node.js 기본 resolver가 처리하게 합니다
        // - Node.js 기본 resolver는 package.json의 exports를 보고 빌드된 파일을 찾아줍니다
        // - 결과 경로가 build/, dist/, node_modules/ 중 하나를 포함하면 그대로 사용합니다
        // - 이렇게 하면 workspace 패키지의 빌드된 파일을 사용하고, 소스 파일을 찾으려 하지 않습니다
        const nextResult = await nextResolve(specifier, context);
        const nextResultUrl = new URL(nextResult.url);

        // 빌드된 파일을 가리키는 경우 그대로 사용합니다 (소스 파일을 찾지 않습니다)
        const isBuiltEntry =
          nextResultUrl.pathname.includes("/build/") ||
          nextResultUrl.pathname.includes("/dist/") ||
          nextResultUrl.pathname.includes("/node_modules/");
        if (parentFormat === "module" && isBuiltEntry) {
          return nextResult;
        }

        // 빌드된 파일이 아니면 TypeScript resolution을 시도합니다 (아래 코드로 계속 진행)
      }
      // Look up parent tsconfig
      const packageMeta = await resolvePackage(fileSystem, parentURL);
      const tsConfig = await resolveTypeScriptPackage(parentURL, packageMeta?.packagePath);

      // Dispatch custom resolution
      const result = await (async () => {
        try {
          if (specifier.startsWith(".")) {
            const resolutionParentURL = sourceParentURL ?? parentURL;
            const unresolvedUrl = new URL(specifier, resolutionParentURL);
            if (!hasKnownSourceExtension(unresolvedUrl.pathname)) {
              const resolvedTsConfig = await resolveTsConfig(resolutionParentURL);
              for (const candidate of extensionlessSourceCandidates(unresolvedUrl)) {
                if (await fileSystem.fileExists(candidate)) {
                  const outputUrl = sourceToOutput(candidate, resolvedTsConfig?.locations);
                  return {
                    format: resolveFormat(candidate.pathname, packageMeta?.packageJson),
                    url: outputUrl ?? absoluteTypeScriptToJavaScript(candidate),
                    sourceUrl: candidate,
                  };
                }
              }
            }

            // Relative imports will use a resolver which returns the source file URL. It
            // must then be mapped to an output file.
            const resolveSource = makeResolver(
              sourceResolverFileSystem,
              packageMeta?.packageJson,
              tsConfig?.locations,
            );
            const sourceResolution = await resolveSource(specifier, resolutionParentURL);
            const resolvedTsConfig = await resolveTsConfig(resolutionParentURL);
            const outputUrl = sourceToOutput(sourceResolution.url, resolvedTsConfig?.locations);
            return {
              format: sourceResolution.format,
              url: outputUrl ?? absoluteTypeScriptToJavaScript(sourceResolution.url),
              sourceUrl: sourceResolution.url,
            };
          } else {
            // Fully-qualified imports resolve to an output file, which must then be mapped
            // back to source file. We must resolve to an output file fully-qualified
            // specifiers end up digging through `package.json` which will always list
            // output files.
            const resolveOutput = makeResolver(
              outputResolverFileSystem,
              packageMeta?.packageJson,
              tsConfig?.locations,
            );
            const outputResolution = await resolveOutput(specifier, parentURL);
            const resolvedTsConfig = await resolveTsConfig(outputResolution.url);
            // 빌드된 파일을 가리키는 경우 소스 파일을 찾지 않습니다
            const isBuiltFile =
              outputResolution.url.pathname.includes("/build/") ||
              outputResolution.url.pathname.includes("/dist/");
            return {
              ...outputResolution,
              sourceUrl: isBuiltFile
                ? undefined
                : await (async () => {
                    for (const url of outputToSourceCandidates(
                      outputResolution.url,
                      resolvedTsConfig?.locations,
                    )) {
                      if (await fileSystem.fileExists(url)) {
                        return url;
                      }
                    }
                  })(),
            };
          }
        } catch {}
      })();

      // On failure forward to next resolver
      if (!result) {
        return nextResolve(specifier, context);
      }

      // Return successful resolutions which did not resolve to a TypeScript source
      const { format, sourceUrl, url } = result;
      if (
        !sourceUrl ||
        url.protocol !== "file:" ||
        url.pathname.includes("/node_modules/") ||
        // yarn PnP의 virtual 경로는 이미 빌드된 파일이므로 transpile하지 않습니다.
        // 예: /.yarn/__virtual__/@sonamu-kit-ui-virtual-xxx/modules/ui/dist/run-ui.js
        url.pathname.includes("/.yarn/__virtual__/") ||
        (format !== undefined && format !== "module" && format !== "commonjs" && format !== "json")
      ) {
        return {
          format: format === "addon" ? undefined : format,
          shortCircuit: true,
          url: url.href,
        };
      }

      // Check for .ts import from non-bundler projects
      if (
        testAnyTypeScript.test(specifier.replace(/[#?].+/, "")) &&
        tsConfig?.locations.outputBase
      ) {
        throw new Error(
          `Cannot import TypeScript specifier '${specifier}' with TypeScript output artifacts enabled.`,
        );
      }

      // If a direct `.ts` specifier was resolved (i.e. no outDir), or a .jsx / .tsx file,
      // then format will be null. So that needs to be resolved by us.
      const resolvedFormat = format ?? resolveFormat(sourceUrl.pathname, packageMeta?.packageJson);

      // Pass off to loader
      if (resolvedFormat === "module" || resolvedFormat === "json") {
        resolvedTypeScriptParents.set(url.href, sourceUrl);
        return {
          format: resolvedFormat,
          url: url.href,
          importAttributes: {
            ...context.importAttributes,
            ts: sourceUrl.href,
          },
          shortCircuit: true,
        };
      } else {
        return {
          format: resolvedFormat,
          url: url.href,
          importAttributes: context.importAttributes,
          shortCircuit: true,
        };
      }
    })();
  };

  const load: LoadHook = (urlString, context, nextLoad) => {
    const { format, importAttributes } = context;
    const tsSource = importAttributes.ts;
    if (tsSource === undefined) {
      // Not resolved with this loader
      return nextLoad(urlString, context);
    }

    return (async () => {
      // `tsSourceUrl` is a `.ts` file, or maybe a `.js` file with `allowJs`, or `.json` file with `allowJson`.
      const tsSourceUrl = new URL(tsSource);

      // Resolve compiler options
      const packageMeta = await resolvePackage(fileSystem, tsSourceUrl);

      switch (format) {
        case "module": {
          // Validate attributes
          for (const key of Object.keys(importAttributes)) {
            if (key !== "ts") {
              throw new TypeError(
                `Import attribute '${key}' with value '${importAttributes[key]}' is not supported`,
              );
            }
          }

          // Get transpiled source. JavaScript is also passed through esbuild in case downleveling
          // is expected.
          const content = await fileSystem.readFileString(tsSourceUrl);
          const tsConfig = await resolveTsConfig(tsSourceUrl);
          const transformContext: TransformContext = {};
          if (tsConfig?.compilerOptions) {
            transformContext.compilerOptions = tsConfig.compilerOptions;
          }
          if (packageMeta?.packageDirectory) {
            transformContext.packageDirectory = packageMeta.packageDirectory;
          }
          const payload = await transpileSource(content, tsSourceUrl, transformContext);
          return {
            format,
            shortCircuit: true,
            source: payload,
          };
        }

        case "json": {
          // Pass source URL to JSON loader
          const filteredAttributes = Object.fromEntries(
            Object.entries(importAttributes).filter(([key]) => key !== "ts"),
          );
          return nextLoad(tsSourceUrl.href, {
            ...context,
            importAttributes: filteredAttributes,
          });
        }

        default:
          throw new Error(`@sonamu-kit/ts-loader: Unexpected format ${format} at ${tsSource}`);
      }
    })();
  };

  return { load, resolve };
}
