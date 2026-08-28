import { spawn as nodeSpawn, type SpawnOptions } from "node:child_process";
import { constants } from "node:os";

export interface ChildProcessLike {
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  once(event: "error", listener: (error: Error) => void): this;
  removeListener(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): this;
  removeListener(event: "error", listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface SignalSource {
  once(event: NodeJS.Signals, listener: () => void): this;
  removeListener(event: NodeJS.Signals, listener: () => void): this;
}

export type ChildProcessSpawner = (
  executable: string,
  args: readonly string[],
  options?: SpawnOptions,
) => ChildProcessLike;

export interface RunChildProcessOptions {
  executable: string;
  args?: readonly string[];
  spawn?: ChildProcessSpawner;
  spawnOptions?: SpawnOptions;
  signalSource?: SignalSource;
}

export interface ChildProcessResult {
  exitCode: number;
  signal?: NodeJS.Signals;
}

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM"] as const;

function signalExitCode(signal: NodeJS.Signals): number {
  return 128 + constants.signals[signal];
}

export function runChildProcess(options: RunChildProcessOptions): Promise<ChildProcessResult> {
  const spawn: ChildProcessSpawner =
    options.spawn ??
    ((executable, args, spawnOptions) =>
      spawnOptions === undefined
        ? nodeSpawn(executable, args)
        : nodeSpawn(executable, args, spawnOptions));
  const signalSource = options.signalSource ?? process;

  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args ?? [], options.spawnOptions);
    let settled = false;

    const forwarders = new Map<NodeJS.Signals, () => void>();

    const cleanup = () => {
      for (const [signal, listener] of forwarders) {
        signalSource.removeListener(signal, listener);
      }
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    function onExit(code: number | null, signal: NodeJS.Signals | null) {
      settle(() => {
        if (code !== null) {
          resolve({ exitCode: code });
          return;
        }

        if (signal !== null) {
          resolve({ exitCode: signalExitCode(signal), signal });
          return;
        }

        resolve({ exitCode: 1 });
      });
    }

    function onError(error: Error) {
      settle(() => reject(error));
    }

    for (const signal of FORWARDED_SIGNALS) {
      // 동일 신호가 반복되어도 자식에게는 최초 신호만 전달합니다.
      const forward = () => child.kill(signal);
      forwarders.set(signal, forward);
      signalSource.once(signal, forward);
    }

    child.once("exit", onExit);
    child.once("error", onError);
  });
}
