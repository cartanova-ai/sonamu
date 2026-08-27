import { execaNode } from "execa";

import { type RunOptions } from "./types.js";

const DEFAULT_NODE_ARGS = ["--enable-source-maps"];

/**
 * Runs a Node.js script as a child process and inherits the stdio streams
 */
export function runNode(cwd: string | URL, options: RunOptions) {
  const env = { ...options.env };
  if (options.stdio === "pipe") {
    env.FORCE_COLOR = "true";
  }

  const childProcess = execaNode(options.script, options.scriptArgs, {
    nodeOptions: DEFAULT_NODE_ARGS.concat(options.nodeArgs),
    preferLocal: true,
    windowsHide: false,
    localDir: cwd,
    cwd,
    buffer: false,
    stdio: options.stdio || "inherit",
    env,
  });

  return childProcess;
}
