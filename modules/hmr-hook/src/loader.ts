import { access, realpath } from "node:fs/promises";
import { type InitializeHook, type LoadHook, type ResolveHook } from "node:module";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type MessagePort } from "node:worker_threads";

import { type FSWatcher, watch } from "chokidar";

import debug from "./debug.js";
import DependencyTree from "./dependency_tree.js";
import { DynamicImportChecker } from "./dynamic_import_checker.js";
import { FileNotImportedDynamicallyException } from "./errors/file_not_imported_dynamically_exception.js";
import { Matcher } from "./matcher.js";
import {
  type FileChangeAction,
  type InitializeHookOptions,
  type MessageChannelMessage,
  type MessageChannelPerType,
} from "./types.js";

export class HotHookLoader {
  #options: InitializeHookOptions;
  #projectRoot!: string;
  #reloadMatcher!: Matcher;
  #messagePort?: MessagePort;
  #watcher!: FSWatcher;
  #pathIgnoredMatcher!: Matcher;
  #pathIncludedMatcher!: Matcher;
  #dependencyTree: DependencyTree;
  #hardcodedBoundaryMatcher!: Matcher;
  #dynamicImportChecker!: DynamicImportChecker;
  #resolvedSourcePaths: Map<string, string> = new Map();

  constructor(options: InitializeHookOptions) {
    this.#options = options;
    this.#messagePort = options.messagePort;
    // 린트 리팩토링: rootDirectory는 register.ts에서 항상 설정됨
    this.#projectRoot = options.rootDirectory ?? "";

    if (options.root) this.#initialize(options.root);

    this.#dependencyTree = new DependencyTree({ root: options.root });
    this.#dynamicImportChecker = new DynamicImportChecker();
    this.#messagePort?.on("message", (message) => this.#onMessage(message));
  }

  /**
   * Initialize the class with the provided root path.
   */
  #initialize(root: string) {
    this.#projectRoot = this.#projectRoot ?? dirname(root);
    this.#reloadMatcher = new Matcher(this.#projectRoot, this.#options.restart || []);
    this.#pathIgnoredMatcher = new Matcher(this.#projectRoot, this.#options.ignore);
    this.#pathIncludedMatcher = new Matcher(this.#projectRoot, this.#options.include || []);
    this.#hardcodedBoundaryMatcher = new Matcher(this.#projectRoot, this.#options.boundaries);

    // 기본적으로 watcher를 생성하지 않음
    // disableAutoWatch가 명시적으로 false인 경우에만 watcher 생성
    if (this.#options.disableAutoWatch === false) {
      this.#watcher = this.#createWatcher();
    }
  }

  /**
   * Check if a file exists
   */
  async #checkIfFileExists(filePath: string) {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  #postMessage<T extends MessageChannelMessage["type"]>(type: T, data: MessageChannelPerType[T]) {
    this.#messagePort?.postMessage({ type, ...data });
  }

  /**
   * When a message is received from the main thread
   */
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- worker thread message는 런타임에 타입이 결정됨
  async #onMessage(message: any) {
    if (message.type === "hmr-hook:dump") {
      return this.#messagePort?.postMessage({
        type: "hmr-hook:dump-done",
        dump: this.#dependencyTree.dump(),
      });
    }

    if (message.type === "hmr-hook:manual-invalidate") {
      // 파일이 변경되었다고 직접 알려주는 메시지입니다. 처리하면 됩니다.
      // 이 호출이 이 hmr-hook의 핵심 tick입니다.
      const invalidatedPaths = await this.#onFileChange(message.path, message.action);

      // 처리 완료 알림을 보내줍니다.
      return this.#messagePort?.postMessage({
        type: "hmr-hook:manual-invalidate-done",
        path: message.path,
        invalidatedPaths: invalidatedPaths || [],
      });
    }

    if (message.type === "hmr-hook:invalidate-all") {
      // rootPath 아래의 모든 파일을 무효화합니다.
      const allPaths = this.#dependencyTree.dump();
      const pathsToInvalidate = allPaths.filter((p) => p.reloadable);

      const invalidatedPaths = new Set<string>();
      for (const { nodePath } of pathsToInvalidate) {
        this.#dynamicImportChecker.invalidateCache(nodePath);
        const dependentPaths = this.#dependencyTree.invalidateFileAndDependents(nodePath);
        for (const p of dependentPaths) {
          invalidatedPaths.add(p);
        }
      }

      debug("Invalidated all reloadable files (%d files).", pathsToInvalidate.length);

      // 처리 완료 알림을 보내줍니다.
      return this.#messagePort?.postMessage({
        type: "hmr-hook:invalidate-all-done",
        invalidatedPaths: Array.from(invalidatedPaths),
      });
    }
  }

  /**
   * When a file changes, invalidate it and its dependents.
   * @returns Array of invalidated file paths (empty if full reload needed)
   */
  async #onFileChange(relativeFilePath: string, action: FileChangeAction): Promise<string[]> {
    debug("File change %s", { relativeFilePath, action });
    const filePath = pathResolve(relativeFilePath);

    /**
     * If the file is removed, we must remove it from the dependency tree
     * and stop watching it.
     */
    if (action === "unlink") {
      debug("File removed %s", filePath);
      this.#watcher?.unwatch(filePath);
      this.#postMessage("hmr-hook:file-changed", {
        path: filePath,
        action: "unlink",
      });

      this.#dependencyTree.remove(filePath);
      return [];
    }

    /**
     * Defensive check to ensure the file still exists.
     * If it doesn't, we just return and do nothing.
     */
    const fileExists = await this.#checkIfFileExists(filePath);
    if (!fileExists) {
      debug("File does not exist anymore %s", filePath);
      this.#watcher?.unwatch(filePath);
      this.#dependencyTree.remove(filePath);
      return [];
    }

    /**
     * Invalidate the dynamic import cache for the file since we
     * gonna need to recheck the dynamic imports.
     */
    this.#dynamicImportChecker.invalidateCache(filePath);

    /**
     * If the file is an hardcoded reload file, we trigger a full reload.
     */
    const realFilePath = await realpath(filePath);
    if (this.#reloadMatcher.match(realFilePath)) {
      debug("Full reload (hardcoded `restart` file) %s", realFilePath);
      this.#postMessage("hmr-hook:full-reload", { path: realFilePath });
      return [];
    }

    /**
     * Check if the file exist in the dependency tree. If not, means it was still
     * not loaded, so we just send a "file-changed" message
     */
    if (!this.#dependencyTree.isInside(realFilePath)) {
      debug("File not in dependency tree, sending file-changed message %s", realFilePath);
      this.#postMessage("hmr-hook:file-changed", {
        path: realFilePath,
        action,
      });
      return [];
    }

    /**
     * If the file is not reloadable according to the dependency tree,
     * we trigger a full reload.
     */
    const { reloadable, shouldBeReloadable } = this.#dependencyTree.isReloadable(realFilePath);
    if (!reloadable) {
      debug("Full reload (not-reloadable file) %s", realFilePath);
      this.#postMessage("hmr-hook:full-reload", {
        path: realFilePath,
        shouldBeReloadable,
      });
      return [];
    }

    /**
     * Otherwise, we invalidate the file and its dependents
     */
    const invalidatedFiles = this.#dependencyTree.invalidateFileAndDependents(realFilePath);
    debug("Invalidating %s", Array.from(invalidatedFiles).join(", "));
    const invalidatedPaths = [...invalidatedFiles];
    this.#postMessage("hmr-hook:invalidated", { paths: invalidatedPaths });
    return invalidatedPaths;
  }

  /**
   * Create the chokidar watcher instance.
   */
  #createWatcher() {
    const watcher = watch(".", {
      ignoreInitial: true,
      cwd: this.#projectRoot,
      ignored: (file, stats) => {
        if (file === this.#projectRoot) return false;
        if (!stats) return false;

        if (this.#pathIgnoredMatcher.match(file)) return true;
        if (this.#reloadMatcher.match(file)) return false;

        if (stats.isDirectory()) return false;

        return !this.#pathIncludedMatcher.match(file);
      },
    });

    watcher.on("change", (path) => this.#onFileChange(path, "change"));
    watcher.on("unlink", (path) => this.#onFileChange(path, "unlink"));
    watcher.on("add", (path) => this.#onFileChange(path, "add"));

    return watcher;
  }

  /**
   * Returns the code source for the import.meta.hot object.
   * We need to add this to every module since `import.meta.hot` is
   * scoped to each module.
   */
  #getImportMetaHotSource() {
    const hotFns = `
    import.meta.hot = {};
    import.meta.hot.dispose = async (callback) => {
      const { hot } = await import('@sonamu-kit/hmr-hook');
      hot.dispose(import.meta.url, callback);
    };

    import.meta.hot.decline = async () => {
      const { hot } = await import('@sonamu-kit/hmr-hook');
      hot.decline(import.meta.url);
    };

    import.meta.hot.boundary = { with: { hot: 'true' } };
    `;

    /**
     * By minifying the code we can avoid adding a new line to the source
     * and so we can avoid totally breaking the source maps.
     *
     * This simple trick seems to do the job for now, but we should probably
     * find a better way to handle this in the future.
     */
    return hotFns.replace(/\n/g, "").replace(/\s{2,}/g, " ");
  }

  /**
   * The load hook.
   * We use it mainly for adding the import.meta.hot object to the module.
   */
  load: LoadHook = async (url, context, nextLoad) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.searchParams.has("hmr-hook")) {
      parsedUrl.searchParams.delete("hmr-hook");
      url = parsedUrl.href;
    }

    if (context.importAttributes?.hot) {
      delete context.importAttributes.hot;
    }

    const result = await nextLoad(url, context);
    if (result.format !== "module") return result;

    result.source = this.#getImportMetaHotSource() + result.source;
    return result;
  };

  /**
   * The resolve hook
   * We use it for :
   * - Adding the hmr-hook query parameter to the URL ( to getting a fresh version )
   * - And adding files to the watcher
   */
  resolve: ResolveHook = async (specifier, context, nextResolve) => {
    const parentUrl = context.parentURL ? new URL(context.parentURL) : undefined;
    if (parentUrl?.searchParams.has("hmr-hook")) {
      parentUrl.searchParams.delete("hmr-hook");
      context = { ...context, parentURL: parentUrl.href };
    }

    const result = await nextResolve(specifier, context);
    const resultUrl = new URL(result.url);

    if (resultUrl.protocol !== "file:") {
      return result;
    }

    const resultPath = fileURLToPath(resultUrl);

    // @sonamu-kit/ts-loader는 result.url과 더불어,
    // result.importAttributes.ts에 실제 소스 파일 경로를 제공합니다.
    // 만약 result.url이 .js 파일을 가리키더라도, 이는 사실 .ts파일을 swc로 트랜스파일한 것일 수 있습니다.
    // 이 경우에는 result.importAttributes.ts에 실제 소스 파일(.ts) 경로를 제공합니다.
    //
    // 여기에서는 실제 파일의 변경을 감지해야 하므로,
    // result.importAttributes.ts가 존재할 경우 이를 사용합니다.
    const actualSourcePath = result.importAttributes?.ts
      ? fileURLToPath(new URL(result.importAttributes.ts))
      : resultPath;

    // 나중에 parent로 사용될 때를 위해 매핑 저장
    this.#resolvedSourcePaths.set(resultPath, actualSourcePath);

    const isRoot = !parentUrl;
    if (isRoot) {
      this.#dependencyTree.addRoot(actualSourcePath);
      this.#initialize(actualSourcePath);
      return result;
    }

    /**
     * Sometimes we receive a parentUrl that is just `data:`. I didn't really understand
     * why yet, for now we just ignore these cases.
     *
     * See https://github.com/tailwindlabs/tailwindcss/discussions/15105
     */
    if (parentUrl.protocol !== "file:") return result;

    const parentPath = fileURLToPath(parentUrl);

    // Parent의 실제 소스 경로를 Map에서 조회
    const actualParentPath = this.#resolvedSourcePaths.get(parentPath) || parentPath;

    const isHardcodedBoundary = this.#hardcodedBoundaryMatcher.match(actualSourcePath);
    const reloadable = result.importAttributes?.hot === "true" ? true : isHardcodedBoundary;

    if (reloadable) {
      /**
       * 이 파일이 reloadable하려면 부모 파일로부터 동적으로 import되어야 합니다.
       * 그렇지 않으면 hmr-hook이 파일을 invalidate할 수 없습니다.
       */
      // 부모도 boundary인지 확인
      const isParentBoundary = this.#hardcodedBoundaryMatcher.match(actualParentPath);

      const isImportedDynamically =
        await this.#dynamicImportChecker.ensureFileIsImportedDynamicallyFromParent(
          actualParentPath,
          specifier,
        );

      // 부모도 boundary면 정적 import 허용
      // 왜냐하면 부모 boundary가 reload될 때 자식도 함께 새로 로드되기 때문
      const effectivelyReloadable = isImportedDynamically || isParentBoundary;

      /**
       * 동적으로 import되지 않았고 옵션이 설정되어 있으면 에러 발생
       */
      if (!effectivelyReloadable && this.#options.throwWhenBoundariesAreNotDynamicallyImported)
        throw new FileNotImportedDynamicallyException(
          actualParentPath,
          specifier,
          this.#projectRoot,
        );

      /**
       * 그렇지 않으면 not-reloadable로 추가 (full reload 트리거)
       */
      this.#dependencyTree.addDependency(actualParentPath, {
        path: actualSourcePath,
        reloadable: effectivelyReloadable,
        isWronglyImported: !effectivelyReloadable,
      });
    } else {
      this.#dependencyTree.addDependency(actualParentPath, {
        path: actualSourcePath,
        reloadable,
      });
    }

    if (this.#pathIgnoredMatcher.match(actualSourcePath)) {
      return result;
    }

    // 워쳐는 이제 밖에 있기 때문에 주석 처리 하였습니다.
    // this.#watcher.add(actualSourcePath)

    // 파일이 tree에 없는 경우 version 0으로 처리합니다.
    // 이런 경우는 parent가 tree에 없어서(예: node_modules의 knex)
    // addDependency()가 skip되어 이 파일도 tree에 추가되지 않았을 때 발생합니다.
    let version = "0";
    if (this.#dependencyTree.isInside(actualSourcePath)) {
      version = this.#dependencyTree.getVersion(actualSourcePath).toString();
    }

    resultUrl.searchParams.set("hmr-hook", version);

    debug("Resolving %s with version %s", resultPath, version);
    return { ...result, url: resultUrl.href };
  };
}

let loader!: HotHookLoader;
export const initialize: InitializeHook = async (data: InitializeHookOptions) => {
  loader = new HotHookLoader(data);
};
export const load: LoadHook = (...args) => loader?.load(...args);
export const resolve: ResolveHook = (...args) => loader?.resolve(...args);
