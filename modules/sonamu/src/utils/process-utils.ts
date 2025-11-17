import chalk from "chalk";
import { setTimeout as setTimeoutPromises } from "timers/promises";

/**
 * 주어진 작업을 실행합니다.
 * 주어진 프로세스 이벤트(=시그널)가 발생하였을 때에도 최대 한계(delayBeforeShutdown) 동안 작업을 기다린 후 종료합니다.
 * @param {() => Promise<void>} job - 실행할 작업
 * @param {event: NodeJS.Signals; delayBeforeShutdown: number} options - 옵션
 * @param {NodeJS.Signals} options.event - 프로세스 이벤트
 * @param {number} options.delayBeforeShutdown - 최대 한계 시간
 */
export async function runWithGracefulShutdown(
  job: () => Promise<void>,
  {
    whenThisHappens: event,
    waitForUpTo: delayBeforeShutdown,
  }: { whenThisHappens: NodeJS.Signals; waitForUpTo: number } = {
    whenThisHappens: "SIGUSR2",
    waitForUpTo: 20000,
  }
): Promise<void> {
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
