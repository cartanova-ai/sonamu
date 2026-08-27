import { execFile, type ExecFileOptions } from "child_process";
import { setTimeout as setTimeoutPromises } from "timers/promises";
import { promisify } from "util";

import chalk from "chalk";

import { isStringValue } from "./runtime-value";

const execFileAsync = promisify(execFile);

/**
 * child_process.execFile의 Promise 기반 wrapper입니다.
 * exit code가 non-zero이면 reject해요.
 */
export async function execute(
  bin: string,
  args: string[],
  options?: ExecFileOptions,
): Promise<string> {
  const { stdout } = await execFileAsync(bin, args, options);
  return isStringValue(stdout) ? stdout : stdout.toString();
}

/**
 * 주어진 작업을 실행합니다.
 * 주어진 프로세스 이벤트(=시그널)가 발생하였을 때에도 최대 한계(waitForUpTo) 동안 작업을 기다린 후 종료합니다.
 * @param {() => Promise<void>} job - 실행할 작업
 * @param {{ whenThisHappens: NodeJS.Signals; waitForUpTo: number }} options - 옵션
 * @param {NodeJS.Signals} options.whenThisHappens - 프로세스 이벤트
 * @param {number} options.waitForUpTo - 최대 한계 시간
 */
export async function runWithGracefulShutdown(
  job: () => Promise<void>,
  {
    whenThisHappens: event,
    waitForUpTo: delayBeforeShutdown,
  }: { whenThisHappens: NodeJS.Signals; waitForUpTo: number } = {
    whenThisHappens: "SIGUSR2",
    waitForUpTo: 20000,
  },
): Promise<void> {
  // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
  let isRunning = true as boolean;

  const abortController = new AbortController();
  const onEvent = async () => {
    if (!isRunning) {
      process.exit(0);
    }
    console.log(chalk.magentaBright(`wait for syncing done....`));

    try {
      await setTimeoutPromises(delayBeforeShutdown, "waiting-sync", {
        signal: abortController.signal,
      });
    } catch {}
    console.log(chalk.magentaBright(`Syncing DONE!`));
    process.exit(0);
  };
  process.on(event, onEvent);

  await job();

  isRunning = false;
  abortController.abort();
  process.off(event, onEvent);
}
