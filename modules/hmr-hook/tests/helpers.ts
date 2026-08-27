import path from "node:path";

import { getActiveTest } from "@japa/runner";
import { join } from "desm";
import { type NodeOptions } from "execa";
import { execaNode } from "execa";
import fs from "fs-extra";
import { pEvent } from "p-event";
import pTimeout from "p-timeout";

export const projectRoot = join(import.meta.url, "../");

interface PackageMetadata {
  name: string;
  bin?: string | Record<string, string>;
}

export async function fakeInstall(destination: string) {
  const packageMetadata: PackageMetadata = await fs.readJson(
    path.resolve(projectRoot, "package.json"),
  );
  const { name: packageName, bin = {} } = packageMetadata;

  await fs.ensureSymlink(projectRoot, path.resolve(destination, "node_modules", packageName));
  await fs.ensureSymlink(projectRoot, path.resolve(destination, "node_modules", "hot-hook"));

  if (Object.prototype.toString.call(bin) === "[object String]") {
    const binPath = String(bin);
    const binName = packageName;
    await fs.ensureSymlink(
      path.resolve(projectRoot, binPath),
      path.resolve(destination, "node_modules", ".bin", binName),
    );
    await fs.ensureSymlink(
      path.resolve(projectRoot, binPath),
      path.resolve(destination, "node_modules", ".bin", "hot-hook"),
    );
  } else {
    for (const [binName, binPath] of Object.entries(bin)) {
      await fs.ensureSymlink(
        path.resolve(projectRoot, binPath),
        path.resolve(destination, "node_modules", ".bin", binName),
      );
    }
  }
}

export async function createHandlerFile(options: { path: string; response: string }) {
  const activeTest = getActiveTest();
  if (!activeTest) throw new Error("No active test");

  const { path: handlerPath, response } = options;
  await activeTest.context.fs.create(
    handlerPath,
    `export default function(request, response) {
      response.writeHead(200, {'Content-Type': 'text/plain'})
      response.end('${response}')
    }`,
  );
}

export function runProcess(scriptPath: string, options?: NodeOptions) {
  const activeTest = getActiveTest();
  if (!activeTest) {
    throw new Error("Cannot run a process outside of a test");
  }

  const child = execaNode(scriptPath, { nodeOptions: [], buffer: false, ...options });
  activeTest.cleanup(() => void child.kill());

  // child.stdout?.pipe(process.stdout)
  // child.stderr?.pipe(process.stderr)

  return {
    child,
    async waitForOutput(output: string, timeout = 10_000) {
      const waitUntilOutput = async () => {
        // 린트 리팩토링: execa로 생성된 child는 항상 stdout 존재
        if (!child.stdout) throw new Error("stdout not available");
        await pEvent(child.stdout, "data", (value) => value.toString().includes(output));
      };

      return await pTimeout(waitUntilOutput(), {
        milliseconds: timeout,
        message: `Timeout waiting for "${output}"`,
      });
    },

    async waitForExit() {
      await child;
    },
  };
}
