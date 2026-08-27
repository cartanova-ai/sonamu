import { relative } from "node:path";
import { emitKeypressEvents } from "node:readline";
import { type Key } from "node:readline";

import { args, BaseCommand, flags } from "@adonisjs/ace";
import { execa } from "execa";
import { type ExecaChildProcess } from "execa";

import { runNode } from "./helpers.js";
import { KeybindingManager, parseKeybinding } from "./keybinding.js";
import { type Action, type KeyBinding } from "./keybinding.js";

export class Serve extends BaseCommand {
  static commandName = "serve";
  static description = "Start the HTTP server";

  @args.string({ description: "Path to the script file to execute" })
  declare script: string;

  @flags.boolean({
    description: "Clear the terminal screen before starting the server",
    default: true,
  })
  declare clearScreen: boolean;

  @flags.array({ description: "Node.js arguments to pass to the script" })
  declare nodeArgs: string[];

  @flags.array({ description: "Script arguments to pass to the script" })
  declare scriptArgs: string[];

  @flags.array({
    description:
      'Key bindings for actions. Format: "key:action:description" or "key:shell:command:description"',
  })
  declare onKey: string[];

  #httpServer?: ExecaChildProcess;
  #keybindingManager = new KeybindingManager();
  #onReloadAsked?: (updatedFile: string, shouldBeReloadable: boolean) => void;
  #onFileInvalidated?: (invalidatedFiles: string[]) => void;

  #intentionalExits = new WeakSet<ExecaChildProcess>();
  #restartTimer?: NodeJS.Timeout;
  #crashResetTimer?: NodeJS.Timeout;
  #keypressListener?: (_str: string, key: Key) => void;
  #isClosing = false;
  #consecutiveCrashCount = 0;
  readonly #crashRestartDelayMs = 1000;
  readonly #crashResetWindowMs = 5000;
  readonly #maxConsecutiveCrashCount = 3;

  /**
   * 조건부로 터미널 화면을 지웁니다
   */
  #clearScreen() {
    if (this.clearScreen) {
      process.stdout.write("\u001Bc");
    }
  }

  /**
   * hmr-runner 접두사가 있는 로그 메시지를 출력합니다
   */
  #log(message: string) {
    this.logger.log(`${this.colors.blue("[hmr-runner]")} ${message}`);
  }

  /**
   * unknown error에서 signal 문자열을 타입 안전하게 추출합니다
   */
  #extractSignal<Failure>(error: Failure): string | undefined {
    if (error instanceof Error && "signal" in error) {
      const candidate = error.signal;
      if (Object.prototype.toString.call(candidate) === "[object String]") {
        return String(candidate);
      }
    }
    return undefined;
  }

  #clearRestartTimer() {
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = undefined;
    }
  }

  #clearCrashResetTimer() {
    if (this.#crashResetTimer) {
      clearTimeout(this.#crashResetTimer);
      this.#crashResetTimer = undefined;
    }
  }

  /**
   * 서버 시작 후 일정 시간(5초) 정상 운영 시 크래시 카운터를 리셋합니다
   */
  #scheduleCrashCounterReset(server: ExecaChildProcess) {
    this.#clearCrashResetTimer();
    this.#crashResetTimer = setTimeout(() => {
      if (this.#intentionalExits.has(server)) return;
      if (this.#httpServer !== server) return;
      this.#consecutiveCrashCount = 0;
    }, this.#crashResetWindowMs);
  }

  /**
   * 현재 HTTP 서버를 의도적으로 종료합니다
   */
  #stopHTTPServer(signal?: NodeJS.Signals) {
    if (this.#httpServer) {
      this.#intentionalExits.add(this.#httpServer);
      this.#httpServer.removeAllListeners();
      this.#httpServer.kill(signal ?? "SIGKILL");
    }
  }

  /**
   * 크래시 후 일정 시간(1초) 뒤 서버 재시작을 예약합니다
   */
  #scheduleCrashRestart() {
    if (this.#isClosing) return;
    this.#clearRestartTimer();
    this.#restartTimer = setTimeout(() => {
      this.#startHTTPServer();
    }, this.#crashRestartDelayMs);
  }

  /**
   * HTTP 서버를 시작합니다
   */
  #startHTTPServer() {
    this.#httpServer = runNode(process.cwd(), {
      script: this.script,
      nodeArgs: this.nodeArgs,
      scriptArgs: this.scriptArgs,
    });

    const server = this.#httpServer;
    this.#scheduleCrashCounterReset(server);

    this.#httpServer.on("message", async (message) => {
      if (!(message instanceof Object) || !("type" in message)) return;

      if (
        message.type === "hmr-hook:full-reload" &&
        "path" in message &&
        Object.prototype.toString.call(message.path) === "[object String]" &&
        "shouldBeReloadable" in message &&
        (message.shouldBeReloadable === true || message.shouldBeReloadable === false)
      ) {
        this.#onReloadAsked?.(String(message.path), message.shouldBeReloadable);
      }

      if (
        message.type === "hmr-hook:invalidated" &&
        "paths" in message &&
        Array.isArray(message.paths) &&
        message.paths.every(
          (invalidatedPath) =>
            Object.prototype.toString.call(invalidatedPath) === "[object String]",
        )
      ) {
        this.#onFileInvalidated?.(message.paths.map(String));
      }
    });

    this.#httpServer
      .then(() => {
        if (this.#httpServer !== server) return;
        if (this.#intentionalExits.has(server) || this.#isClosing) return;

        this.#consecutiveCrashCount++;
        this.#log(
          `${this.script} exited. (${this.#consecutiveCrashCount}/${this.#maxConsecutiveCrashCount})`,
        );

        if (this.#consecutiveCrashCount >= this.#maxConsecutiveCrashCount) {
          this.#log(
            this.colors.red(
              `Reached max consecutive exit count (${this.#maxConsecutiveCrashCount}). Exiting.`,
            ),
          );
          process.exit(1);
        }

        this.#scheduleCrashRestart();
      })
      .catch((error) => {
        if (this.#httpServer !== server) return;
        if (this.#intentionalExits.has(server) || this.#isClosing) return;

        const signal = this.#extractSignal(error);
        if (signal === "SIGUSR2") {
          this.#startHTTPServer();
          return;
        }

        this.#consecutiveCrashCount++;
        this.#log(
          `${this.colors.red(`${this.script} crashed.`)} (${this.#consecutiveCrashCount}/${this.#maxConsecutiveCrashCount})`,
        );

        if (this.#consecutiveCrashCount >= this.#maxConsecutiveCrashCount) {
          this.#log(
            this.colors.red(
              `Reached max consecutive crash count (${this.#maxConsecutiveCrashCount}). Exiting.`,
            ),
          );
          process.exit(1);
        }

        this.#scheduleCrashRestart();
      });
  }

  /**
   * 셸 명령을 실행합니다
   */
  async #executeShellCommand(command: string, description: string) {
    this.#log(`${description} executing: ${this.colors.dim(command)}`);

    // stdin 리스너 완전히 중지
    const wasRawMode = process.stdin.isTTY && process.stdin.isRaw;
    if (wasRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();

    try {
      await execa(command, {
        shell: true,
        stdin: "inherit", // 또는 아예 새 pty 사용
        stdout: "inherit",
        stderr: "inherit",
        // 핵심: detached + 새 세션으로 TTY 제어권 넘김
      });
      this.#log(`${this.colors.green("Done")}: ${description}`);
    } catch {
      this.#log(`${this.colors.red("Failed")}: ${description}`);
    } finally {
      if (process.stdin.isTTY) {
        process.stdin.resume();
        if (wasRawMode) {
          process.stdin.setRawMode(true);
        }
      }
    }
  }

  /**
   * 액션 문자열을 파싱합니다 (예: "restart" 또는 "shell(yarn build)")
   */
  #parseAction(actionStr: string): Action | null {
    if (actionStr === "restart") {
      return { type: "restart" };
    }

    if (actionStr === "clear") {
      return { type: "clear" };
    }

    const shellMatch = actionStr.match(/^shell\((.+)\)$/);
    if (shellMatch) {
      return { type: "shell", command: shellMatch[1] };
    }

    return null;
  }

  /**
   * --on-key 인자를 KeyBinding 객체로 파싱합니다
   * 형식: keybinding:action1:action2:...:description
   * 키바인딩: "r", "cmd+r", "cmd+r cmd+r" (VSCode 스타일)
   * 액션: "restart" 또는 "shell(command)"
   */
  #parseKeyBindings() {
    if (!this.onKey?.length) return;

    for (const binding of this.onKey) {
      const parts = binding.split(":");
      if (parts.length < 3) {
        this.#log(`${this.colors.yellow("Warning")}: Invalid key binding format: "${binding}"`);
        continue;
      }

      const keybindingStr = parts[0];
      const description = parts[parts.length - 1];
      const actionStrs = parts.slice(1, -1);

      const parsed = parseKeybinding(keybindingStr);
      if (!parsed) {
        this.#log(
          `${this.colors.yellow("Warning")}: Invalid keybinding format: "${keybindingStr}" in binding: "${binding}"`,
        );
        continue;
      }

      const actions: Action[] = [];
      for (const actionStr of actionStrs) {
        const action = this.#parseAction(actionStr);
        if (action) {
          actions.push(action);
        } else {
          this.#log(
            `${this.colors.yellow("Warning")}: Unknown action "${actionStr}" in binding: "${binding}"`,
          );
        }
      }

      if (actions.length > 0) {
        this.#keybindingManager.addKeybinding({
          keybinding: keybindingStr,
          parsed,
          actions,
          description,
        });
      }
    }
  }

  /**
   * 키바인딩에 대한 모든 액션을 실행합니다
   */
  async #executeActions(binding: KeyBinding) {
    this.#log(`${binding.description}(${this.colors.cyan(binding.keybinding)}) triggered.`);

    for (const action of binding.actions) {
      if (action.type === "restart") {
        this.#clearScreen();
        this.#stopHTTPServer();
        this.#startHTTPServer();
      } else if (action.type === "clear") {
        process.stdout.write("\u001Bc");
      } else if (action.type === "shell") {
        await this.#executeShellCommand(action.command, binding.description);
      }
    }
  }

  /**
   * 키바인딩을 위한 키보드 입력 리스너를 설정합니다
   */
  #setupKeyboardListener() {
    const keyBindings = this.#keybindingManager.getKeybindings();
    if (!process.stdin.isTTY || keyBindings.length === 0) return;

    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();

    this.#keypressListener = (_str: string, key: Key) => {
      // Ctrl+C는 종료 처리
      if (key.ctrl && key.name === "c") {
        this.close().then(() => process.exit());
        return;
      }

      // 키바인딩 매니저를 통해 키 입력을 처리합니다
      this.#keybindingManager.processKeyPressFromReadline(key, (binding) => {
        this.#executeActions(binding);
      });
    };

    process.stdin.on("keypress", this.#keypressListener);

    const keyHints = keyBindings
      .map((b) => `${this.colors.cyan(b.keybinding)} ${b.description}`)
      .join(" | ");
    this.#log(`Keys: ${keyHints}`);
  }

  /**
   * HTTP 서버를 시작하고 전체 리로드 요청을 감시합니다
   */
  async run() {
    this.#clearScreen();
    this.#log(`Starting ${this.colors.green(this.script)}`);
    this.#startHTTPServer();
    this.#parseKeyBindings();
    this.#setupKeyboardListener();

    this.#onReloadAsked = (path, shouldBeReloadable) => {
      this.#clearScreen();

      const relativePath = relative(process.cwd(), path);
      const message = `${this.colors.green(relativePath)} changed. Restarting.`;
      if (!shouldBeReloadable) {
        this.#log(message);
      } else {
        const warning = `${this.colors.yellow("This file should be reloadable, but a parent boundary was not dynamically imported.")}`;
        this.#log(`${message}\n${warning}`);
      }

      this.#stopHTTPServer();
      this.#startHTTPServer();
    };

    this.#onFileInvalidated = (paths) => {
      this.#clearScreen();

      const updatedFile = paths[0];
      const relativePath = relative(process.cwd(), updatedFile);

      this.#log(`Invalidating ${this.colors.green(relativePath)} and its dependents`);
    };
  }

  /**
   * 감시자 및 실행 중인 자식 프로세스를 종료합니다
   */
  async close() {
    this.#isClosing = true;
    this.#clearRestartTimer();
    this.#clearCrashResetTimer();
    this.#keybindingManager.cleanup();
    this.#cleanupStdin();
    this.#stopHTTPServer();
  }

  /**
   * stdin keypress 리스너 및 raw mode를 정리합니다
   */
  #cleanupStdin() {
    if (this.#keypressListener && process.stdin.isTTY) {
      process.stdin.removeListener("keypress", this.#keypressListener);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      this.#keypressListener = undefined;
    }
  }
}
