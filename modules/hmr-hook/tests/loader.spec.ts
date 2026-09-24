import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MessageChannel } from "node:worker_threads";

import { test } from "@japa/runner";
import { pEvent } from "p-event";
import supertest from "supertest";

import { HotHookLoader } from "../src/loader.js";
import { type DumpNode } from "../src/types.js";
import { createHandlerFile, fakeInstall, manualInvalidationSource, runProcess } from "./helpers.js";

test.group("Loader shebang", () => {
  async function loadSource(source: string) {
    const loader = new HotHookLoader({});
    return loader.load(
      "file:///app.mjs",
      { format: "module", conditions: [], importAttributes: {} },
      async () => ({ format: "module", source }),
    );
  }

  for (const [name, lineEnding] of [
    ["LF", "\n"],
    ["CRLF", "\r\n"],
    ["CR", "\r"],
    ["줄 구분 문자", "\u2028"],
    ["문단 구분 문자", "\u2029"],
  ]) {
    test(`${name}: shebang 뒤에 코드를 삽입하고 ESM으로 실행할 수 있다`, async ({ assert }) => {
      const firstLine = `#!/usr/bin/env node${lineEnding}`;
      const body = "export const value = 42; export const hot = import.meta.hot;\n";
      const loaded = await loadSource(firstLine + body);
      const output = String(loaded.source);

      assert.isTrue(output.startsWith(`${firstLine} import.meta.hot = {};`));
      assert.isTrue(output.endsWith(body));
      assert.equal(output.split(lineEnding).length, (firstLine + body).split(lineEnding).length);

      const module = await import(`data:text/javascript,${encodeURIComponent(output)}`);
      assert.equal(module.value, 42);
      assert.isFunction(module.hot.dispose);
    });
  }

  test("줄바꿈 없는 shebang에는 줄바꿈을 추가한 뒤 코드를 삽입한다", async ({ assert }) => {
    const loaded = await loadSource("#!/usr/bin/env node");
    const output = String(loaded.source);
    assert.isTrue(output.startsWith("#!/usr/bin/env node\n import.meta.hot = {};"));
    await import(`data:text/javascript,${encodeURIComponent(output)}`);
  });

  test("shebang이 없는 소스는 기존처럼 맨 앞에 코드를 삽입한다", async ({ assert }) => {
    for (const source of ["", "export const value = '#!';\n"]) {
      const loaded = await loadSource(source);
      const output = String(loaded.source);
      assert.isTrue(output.startsWith(" import.meta.hot = {};"));
      assert.isTrue(output.endsWith(source));
      await import(`data:text/javascript,${encodeURIComponent(output)}`);
    }
  });
});

test.group("Loader ignore", () => {
  for (const scenario of [
    { name: "node_modules의 shebang", path: "node_modules/tool/index.mjs", ignored: true },
    { name: "사용자 제외 패턴", path: "config/settings.js", ignored: true },
    {
      name: "제외된 실제 TS 소스",
      path: "dist/settings.js",
      source: "config/settings.ts",
      ignored: true,
    },
    { name: "비제외 실제 TS 소스", path: "config/app.js", source: "src/app.ts", ignored: false },
  ]) {
    test(`${scenario.name}: resolve와 load의 제외 판정이 일치한다`, async ({ fs, assert }) => {
      const root = join(fs.basePath, "index.js");
      const loader = new HotHookLoader({
        root,
        rootDirectory: fs.basePath,
        ignore: ["**/node_modules/**", "config/**"],
        boundaries: [],
      });
      const url = pathToFileURL(join(fs.basePath, scenario.path)).href;
      const resolved = await loader.resolve(
        url,
        { parentURL: pathToFileURL(root).href, conditions: [], importAttributes: {} },
        async () => ({
          url,
          importAttributes: scenario.source
            ? { ts: pathToFileURL(join(fs.basePath, scenario.source)).href }
            : {},
        }),
      );
      assert.equal(new URL(resolved.url).searchParams.has("hmr-hook"), !scenario.ignored);

      const source = scenario.ignored
        ? "#!/usr/bin/env node\nexport const value = 1;\n"
        : "export const value = 1;\n";
      const nextResult = { format: "module", source };
      const loaded = await loader.load(
        resolved.url,
        { format: "module", conditions: [], importAttributes: {} },
        async () => nextResult,
      );
      if (scenario.ignored) {
        assert.strictEqual(loaded, nextResult);
        assert.equal(loaded.source, source);
      } else {
        assert.include(String(loaded.source), "import.meta.hot = {}");
        assert.isTrue(String(loaded.source).endsWith(source));
      }
    });
  }

  test("resolve 매핑이 없는 제외 파일의 바이너리 소스도 그대로 반환한다", async ({
    fs,
    assert,
  }) => {
    const loader = new HotHookLoader({
      root: join(fs.basePath, "index.js"),
      rootDirectory: fs.basePath,
      ignore: ["config/**"],
      boundaries: [],
    });
    const source = Buffer.from("#!/usr/bin/env node\nexport {};\n");
    const result = { format: "module", source };
    const loaded = await loader.load(
      pathToFileURL(join(fs.basePath, "config/tool.mjs")).href,
      { format: "module", conditions: [], importAttributes: {} },
      async () => result,
    );
    assert.strictEqual(loaded.source, source);
  });

  test("nextLoad에 전달하기 전에 HMR 쿼리와 hot 속성만 제거한다", async ({ assert }) => {
    const loader = new HotHookLoader({});
    await loader.load(
      "file:///app.mjs?other=keep&hmr-hook=1",
      { format: "module", conditions: [], importAttributes: { hot: "true", other: "keep" } },
      async (url, context) => {
        assert.equal(url, "file:///app.mjs?other=keep");
        assert.deepEqual(context?.importAttributes, { other: "keep" });
        return { format: "module", source: "export{}" };
      },
    );
  });

  test("비파일 ESM과 비ESM의 기존 처리를 유지한다", async ({ assert }) => {
    const loader = new HotHookLoader({});
    const context = { format: "module", conditions: [], importAttributes: {} };
    const esm = await loader.load("data:text/javascript,export{}", context, async () => ({
      format: "module",
      source: "export{}",
    }));
    assert.include(String(esm.source), "import.meta.hot = {}");
    const commonjs = { format: "commonjs", source: "module.exports = {};" };
    assert.strictEqual(
      await loader.load("file:///app.cjs", context, async () => commonjs),
      commonjs,
    );
  });

  const importAttributeScenarios: {
    title: string;
    contextAttributes: Record<string, string>;
    resultAttributes?: Record<string, string>;
    reloadable: boolean;
  }[] = [
    {
      title: "반환 속성이 없으면 입력 hot 속성으로 boundary를 판정한다",
      contextAttributes: { hot: "true" },
      reloadable: true,
    },
    {
      title: "반환 hot 속성이 입력 hot 속성보다 우선한다",
      contextAttributes: { hot: "true" },
      resultAttributes: { hot: "false" },
      reloadable: false,
    },
    {
      title: "빈 반환 속성이 있으면 입력 hot 속성을 사용하지 않는다",
      contextAttributes: { hot: "true" },
      resultAttributes: {},
      reloadable: false,
    },
    {
      title: "반환 hot 속성으로 boundary를 활성화할 수 있다",
      contextAttributes: { hot: "false" },
      resultAttributes: { hot: "true" },
      reloadable: true,
    },
    {
      title: "입력과 반환 속성에 hot이 없으면 boundary가 아니다",
      contextAttributes: {},
      reloadable: false,
    },
  ];

  for (const scenario of importAttributeScenarios) {
    test(scenario.title, async ({ fs, assert }) => {
      await fs.create("server.js", "await import('./app.js')");
      await fs.create("app.js", "export default 'app'");
      const root = join(fs.basePath, "server.js");
      const appPath = join(fs.basePath, "app.js");
      const { port1, port2 } = new MessageChannel();
      try {
        const loader = new HotHookLoader({ root, rootDirectory: fs.basePath, messagePort: port2 });
        await loader.resolve(
          "./app.js",
          {
            parentURL: pathToFileURL(root).href,
            conditions: [],
            importAttributes: scenario.contextAttributes,
          },
          async () => ({
            url: pathToFileURL(appPath).href,
            format: "module",
            importAttributes: scenario.resultAttributes,
          }),
        );

        // MessagePort의 EventTarget 래퍼 대신 EventEmitter의 메시지 본문을 받는다.
        const response = pEvent<string, { type: string; dump: DumpNode[] }>(
          { on: port1.on.bind(port1), off: port1.off.bind(port1) },
          "message",
          { filter: (message) => message.type === "hmr-hook:dump-done", timeout: 1_000 },
        );
        port1.postMessage({ type: "hmr-hook:dump" });
        const { dump } = await response;
        const app = dump.find((node) => node.nodePath === appPath);
        assert.isDefined(app);
        assert.equal(app?.reloadable, scenario.reloadable);
      } finally {
        port1.close();
        port2.close();
      }
    });
  }

  for (const entry of ["init", "register"] as const) {
    test(`${entry}: 수동 무효화 후에만 갱신된다`, async ({ fs, assert }) => {
      await fakeInstall(fs.basePath);
      const config = { boundaries: ["./app.js"] };
      await fs.createJson("package.json", { type: "module", hotHook: config });
      await fs.create("app.js", "export default 'before'");
      await fs.create(
        "server.js",
        `import { writeFile } from 'node:fs/promises'
           import { setTimeout } from 'node:timers/promises'
           import { fileURLToPath } from 'node:url'
           import { hot } from '@sonamu-kit/hmr-hook'
           ${entry === "init" ? `await hot.init({ root: import.meta.filename, rootDirectory: import.meta.dirname, ...${JSON.stringify(config)} })` : ""}
           const initial = (await import('./app.js')).default
           // 기존 watcher의 초기 탐색 이후에 변경하여 제거 전 실패를 재현한다.
           await setTimeout(300)
           await writeFile(new URL('./app.js', import.meta.url), "export default 'after'")
           const observed = []
           // 관찰 구간 내내 외부 이벤트 없이는 같은 모듈을 유지해야 한다.
           for (let attempt = 0; attempt < 20; attempt++) {
             await setTimeout(50)
             observed.push((await import('./app.js')).default)
           }
           const invalidated = await hot.invalidateFile(fileURLToPath(new URL('./app.js', import.meta.url)))
           const final = (await import('./app.js')).default
           process.send({ type: 'watch-result', initial, observed, invalidated, final })`,
      );
      const server = runProcess("server.js", {
        cwd: fs.basePath,
        nodeOptions: entry === "register" ? ["--import=@sonamu-kit/hmr-hook/register"] : [],
      });
      const result = await pEvent<
        string,
        {
          type: string;
          initial: string;
          observed: string[];
          invalidated: string[];
          final: string;
        }
      >(server.child, "message", {
        filter: (message) => message.type === "watch-result",
        timeout: 4_000,
      });
      assert.equal(result.initial, "before");
      assert.deepEqual([...new Set(result.observed)], ["before"]);
      assert.deepEqual(result.invalidated, [join(fs.basePath, "app.js")]);
      assert.equal(result.final, "after");
    }).timeout(5_000);
  }

  for (const scenario of [
    {
      title: "import 속성",
      options: {},
      attributes: ", { with: { hot: 'true' } }",
      ignored: false,
    },
    {
      title: "명시한 boundary",
      options: { boundaries: ["./app.js"] },
      attributes: "",
      ignored: false,
    },
    {
      title: "ignore 경로",
      options: { boundaries: ["./app.js"], ignore: ["./app.js"] },
      attributes: "",
      ignored: true,
    },
    {
      title: "기본 node_modules 제외",
      options: {},
      attributes: ", { with: { hot: 'true' } }",
      ignored: true,
    },
  ]) {
    test(`${scenario.title}의 수동 무효화와 import 캐시 정책을 유지한다`, async ({
      fs,
      assert,
    }) => {
      await fakeInstall(fs.basePath);
      await fs.createJson("package.json", { type: "module" });
      const app =
        scenario.title === "기본 node_modules 제외" ? "node_modules/app/app.js" : "app.js";
      if (app.startsWith("node_modules")) {
        await fs.createJson("node_modules/app/package.json", { type: "module" });
      }
      await createHandlerFile({ path: app, response: "before" });
      await fs.create(
        "server.js",
        `import * as http from 'node:http'
         import { hot } from '@sonamu-kit/hmr-hook'
         await hot.init({ root: import.meta.filename, rootDirectory: import.meta.dirname, ...${JSON.stringify(scenario.options)} })
         ${manualInvalidationSource}
         const server = http.createServer(async (request, response) => {
           const app = await import('./${app}'${scenario.attributes})
           app.default(request, response)
         })
         server.listen(3333, () => console.log('Server is running'))`,
      );
      const server = runProcess("server.js", { cwd: fs.basePath });
      await server.waitForOutput("Server is running");
      await supertest("http://localhost:3333").get("/").expect(200).expect("before");
      await createHandlerFile({ path: app, response: "after" });
      const result = await server.invalidateFile(join(fs.basePath, app));
      assert.deepEqual(result.paths, [join(fs.basePath, app)]);
      assert.deepEqual(result.messages, [{ type: "hmr-hook:invalidated", paths: result.paths }]);
      await supertest("http://localhost:3333")
        .get("/")
        .expect(200)
        .expect(scenario.ignored ? "before" : "after");
    });
  }

  test("제외 파일에는 import.meta.hot을 주입하지 않는다", async ({ fs, assert }) => {
    await fakeInstall(fs.basePath);
    await fs.createJson("package.json", { type: "module" });
    await fs.create("config/test.js", "export default Boolean(import.meta.hot)");
    await fs.create(
      "server.js",
      `import { hot } from '@sonamu-kit/hmr-hook'
       await hot.init({ root: import.meta.filename, rootDirectory: import.meta.dirname, ignore: ['config/**'] })
       const app = await import('./config/test.js')
       process.send({ type: 'hot-result', enabled: app.default })`,
    );
    const server = runProcess("server.js", { cwd: fs.basePath });
    const result = await pEvent<string, { type: string; enabled: boolean }>(
      server.child,
      "message",
      {
        filter: (message) => message.type === "hot-result",
        timeout: 1_000,
      },
    );
    assert.isFalse(result.enabled);
  });

  for (const scenario of [
    { title: "일반 모듈", boundaries: [], target: "app.js", staticImport: false, wrong: false },
    {
      title: "정적 import된 boundary",
      boundaries: ["./app.js"],
      target: "app.js",
      staticImport: true,
      wrong: true,
    },
    {
      title: "정적 import된 부모 boundary",
      boundaries: ["./app.js"],
      target: "app2.js",
      staticImport: true,
      wrong: true,
    },
    { title: "restart 파일", boundaries: [], target: ".env", staticImport: false, wrong: false },
  ]) {
    test(`${scenario.title}의 수동 변경은 전체 재시작을 요청한다`, async ({ fs, assert }) => {
      await fakeInstall(fs.basePath);
      await fs.createJson("package.json", {
        type: "module",
        hotHook: { boundaries: scenario.boundaries },
      });
      await fs.create(".env", "HELLO=WORLD");
      await fs.create("app.js", "import './app2.js'; export default 'before'");
      await fs.create("app2.js", "export default 'before'");
      await fs.create(
        "server.js",
        `${scenario.staticImport ? "import app from './app.js'" : "await import('./app.js')"}
         ${manualInvalidationSource}
         console.log('Server is running')`,
      );
      const server = runProcess("server.js", {
        cwd: fs.basePath,
        nodeOptions: ["--import=@sonamu-kit/hmr-hook/register"],
      });
      await server.waitForOutput("Server is running");
      await fs.create(scenario.target, "export default 'after'");
      const result = await server.invalidateFile(join(fs.basePath, scenario.target));
      assert.deepEqual(result.paths, []);
      const message = result.messages.find((message) => message.type === "hmr-hook:full-reload");
      assert.isDefined(message);
      assert.equal(message?.path, join(fs.basePath, scenario.target));
      assert.equal(message?.shouldBeReloadable ?? false, scenario.wrong);
    });
  }

  test("정적 import된 boundary는 엄격 모드에서 오류를 발생시킨다", async ({ fs, assert }) => {
    await fakeInstall(fs.basePath);
    await fs.createJson("package.json", {
      type: "module",
      hotHook: { boundaries: ["./app.js"], throwWhenBoundariesAreNotDynamicallyImported: true },
    });
    await fs.create("server.js", "import app from './app.js'; console.log(app)");
    await fs.create("app.js", "export default 'app'");
    const server = runProcess("server.js", {
      cwd: fs.basePath,
      nodeOptions: ["--import=@sonamu-kit/hmr-hook/register"],
    });
    await assert.rejects(async () => await server.child);
  });
});
