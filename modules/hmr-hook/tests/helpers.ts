import path from "node:path";

import { getActiveTest } from "@japa/runner";
import { join } from "desm";
import { type NodeOptions } from "execa";
import { execaNode } from "execa";
import fs from "fs-extra";
import { pEvent } from "p-event";
import pTimeout from "p-timeout";

import { type FileChangeAction, type MessageChannelMessage } from "../src/types.js";

// 파일 변경 감지는 테스트가 담당하고, 자식 프로세스에는 syncer처럼 명시적으로 전달한다.
export const manualInvalidationSource = `
process.on('message', async (message) => {
  if (message.type !== 'test:invalidate') return
  const { hot } = await import('@sonamu-kit/hmr-hook')
  const paths = await hot.invalidateFile(message.path, message.action)
  process.send({ type: 'test:invalidate-done', paths })
})
`;

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
    async invalidateFile(filePath: string, action: FileChangeAction = "change") {
      const messages: MessageChannelMessage[] = [];
      const collect = (message: MessageChannelMessage) => messages.push(message);
      child.on("message", collect);
      // 완료 응답까지 기다려 다음 import와 수동 무효화 사이의 순서를 보장한다.
      const done = pEvent<string, { type: string; paths: string[] }>(child, "message", {
        filter: (message) => message.type === "test:invalidate-done",
        timeout: 2_000,
      });
      try {
        child.send({ type: "test:invalidate", path: filePath, action });
        const { paths } = await done;
        return {
          paths,
          messages: messages.filter((message) => message.type.startsWith("hmr-hook:")),
        };
      } finally {
        child.off("message", collect);
      }
    },
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
