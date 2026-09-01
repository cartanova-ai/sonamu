#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function runSourceFallback() {
  const tsx = require.resolve("tsx");
  const source = new URL("../src/index.ts", import.meta.url).href;
  const script = `import(${JSON.stringify(source)}).then(({ main }) => main({ args: process.argv.slice(1) }))`;
  const child = spawn(
    process.execPath,
    ["--import", tsx, "--eval", script, "--", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: process.env,
    },
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => child.kill(signal));
  }

  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code !== null) {
        process.exitCode = code;
      } else if (signal === null) {
        process.exitCode = 1;
      } else {
        process.kill(process.pid, signal);
      }
      resolve();
    });
  });
}

try {
  const built = await import("../dist/index.js");
  await built.main();
} catch (error) {
  const missingBuild =
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND" &&
    error.message.includes("/dist/index.js");
  if (missingBuild) {
    await runSourceFallback();
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
