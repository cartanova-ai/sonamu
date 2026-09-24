import { join } from "node:path";

import { test } from "@japa/runner";
import supertest from "supertest";

import { createHandlerFile, fakeInstall, manualInvalidationSource, runProcess } from "./helpers.js";

test.group("Register", () => {
  for (const scenario of [
    { title: "import 속성", config: {}, env: {}, attributes: ", import.meta.hot.boundary" },
    { title: "package.json", config: { boundaries: ["./app.js"] }, env: {}, attributes: "" },
    {
      title: "환경변수",
      config: {},
      env: { HOT_HOOK_BOUNDARIES: "./app.js" },
      attributes: "",
    },
  ]) {
    test(`${scenario.title} boundary는 수동 무효화 완료 후 새 모듈을 로드한다`, async ({
      fs,
      assert,
    }) => {
      await fakeInstall(fs.basePath);
      await fs.createJson("package.json", { type: "module", hotHook: scenario.config });
      await fs.create(
        "server.js",
        `import * as http from 'node:http'
         ${manualInvalidationSource}
         const server = http.createServer(async (request, response) => {
           const app = await import('./app.js'${scenario.attributes})
           app.default(request, response)
         })
         server.listen(3333, () => console.log('Server is running'))`,
      );
      await createHandlerFile({ path: "app.js", response: "before" });
      const server = runProcess("server.js", {
        cwd: fs.basePath,
        env: scenario.env,
        nodeOptions: ["--import=@sonamu-kit/hmr-hook/register"],
      });
      await server.waitForOutput("Server is running");
      await supertest("http://localhost:3333").get("/").expect(200).expect("before");

      for (const value of ["after", "latest"]) {
        await createHandlerFile({ path: "app.js", response: value });
        const result = await server.invalidateFile(join(fs.basePath, "app.js"));
        assert.deepEqual(result.paths, [join(fs.basePath, "app.js")]);
        await supertest("http://localhost:3333").get("/").expect(200).expect(value);
      }
    });
  }

  for (const scenario of [
    { title: "boundary가 아닌 모듈", file: "app.js", config: {}, load: true },
    {
      title: "명시한 restart 파일",
      file: ".restart-file",
      config: { restart: [".restart-file"] },
      load: false,
    },
    { title: "기본 restart 파일", file: ".env", config: {}, load: false },
  ]) {
    test(`${scenario.title}의 수동 변경 알림은 전체 재시작을 요청한다`, async ({ fs, assert }) => {
      await fakeInstall(fs.basePath);
      await fs.createJson("package.json", { type: "module", hotHook: scenario.config });
      await fs.create(scenario.file, "export default 'before'");
      await fs.create(
        "server.js",
        `${manualInvalidationSource}
         ${scenario.load ? "await import('./app.js')" : ""}
         console.log('Server is running')`,
      );
      const server = runProcess("server.js", {
        cwd: fs.basePath,
        nodeOptions: ["--import=@sonamu-kit/hmr-hook/register"],
      });
      await server.waitForOutput("Server is running");
      await fs.create(scenario.file, "export default 'after'");
      const filePath = join(fs.basePath, scenario.file);
      const result = await server.invalidateFile(filePath);
      assert.deepEqual(result.paths, []);
      assert.isTrue(
        result.messages.some(
          (message) => message.type === "hmr-hook:full-reload" && message.path === filePath,
        ),
      );
    });
  }

  for (const action of ["change", "add", "unlink"] as const) {
    test(`미로드 파일의 수동 ${action} 알림을 전달한다`, async ({ fs, assert }) => {
      await fakeInstall(fs.basePath);
      await fs.createJson("package.json", { type: "module" });
      await fs.create("server.js", `${manualInvalidationSource}\nconsole.log('Server is running')`);
      if (action !== "add") await fs.create("app.js", "export default 'before'");
      const server = runProcess("server.js", {
        cwd: fs.basePath,
        nodeOptions: ["--import=@sonamu-kit/hmr-hook/register"],
      });
      await server.waitForOutput("Server is running");
      if (action === "unlink") await fs.remove("app.js");
      else await fs.create("app.js", "export default 'after'");
      const filePath = join(fs.basePath, "app.js");
      const result = await server.invalidateFile(filePath, action);
      assert.deepEqual(result.paths, []);
      assert.deepEqual(result.messages, [
        { type: "hmr-hook:file-changed", path: filePath, action },
      ]);
    });
  }
});
