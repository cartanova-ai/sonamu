import { join } from "node:path";

import { test } from "@japa/runner";
import { pEvent } from "p-event";
import supertest from "supertest";

import { createHandlerFile, fakeInstall, manualInvalidationSource, runProcess } from "./helpers.js";

test.group("Loader", () => {
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

  test("ignore 파일에도 import.meta.hot을 주입한다", async ({ fs, assert }) => {
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
    assert.isTrue(result.enabled);
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
