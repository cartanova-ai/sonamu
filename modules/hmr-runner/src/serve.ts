import { relative } from "node:path";
import { emitKeypressEvents, type Key } from "node:readline";
import { args, BaseCommand, flags } from "@adonisjs/ace";
import { type ExecaChildProcess, execa } from "execa";

import { runNode } from "./helpers.js";
import { type Action, type KeyBinding, KeybindingManager, parseKeybinding } from "./keybinding.js";

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

  #httpServer?: ExecaChildProcess<string>;
  #keybindingManager = new KeybindingManager();
  #onReloadAsked?: (updatedFile: string, shouldBeReloadable: boolean) => void;
  #onFileInvalidated?: (invalidatedFiles: string[]) => void;

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
   * HTTP 서버를 시작합니다
   */
  #startHTTPServer() {
    this.#httpServer = runNode(process.cwd(), {
      script: this.script,
      nodeArgs: this.nodeArgs,
      scriptArgs: this.scriptArgs,
    });

    this.#httpServer.on("message", async (message: unknown) => {
      if (typeof message !== "object" || message === null) return;

      if ("type" in message && message.type === "hmr-hook:full-reload") {
        const msg = message as unknown as { path: string; shouldBeReloadable: boolean };
        this.#onReloadAsked?.(msg.path, msg.shouldBeReloadable);
      }

      if ("type" in message && message.type === "hmr-hook:invalidated") {
        const msg = message as unknown as { paths: string[] };
        this.#onFileInvalidated?.(msg.paths);
      }
    });

    this.#httpServer
      .then(() => {
        this.#log(`${this.script} exited.`);
      })
      .catch(({ signal }) => {
        if (signal === "SIGUSR2") {
          // 프로세스가 죽은 이유가 SIGUSR2 때문이라면, 이는 서버 프로세스 재시작을 기대하고 보낸 것입니다.
          // 따라서 재시작합니다.
          this.#startHTTPServer();
        } else {
          this.#log(`${this.colors.red(`${this.script} crashed.`)}`);
        }
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
        this.#httpServer?.removeAllListeners();
        this.#httpServer?.kill("SIGKILL");
        this.#startHTTPServer();
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

    process.stdin.on("keypress", (_str: string, key: Key) => {
      // Ctrl+C는 종료 처리
      if (key.ctrl && key.name === "c") {
        this.close().then(() => process.exit());
        return;
      }

      // 키바인딩 매니저를 통해 키 입력을 처리합니다
      this.#keybindingManager.processKeyPressFromReadline(key, (binding) => {
        this.#executeActions(binding);
      });
    });

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

      this.#httpServer?.removeAllListeners();
      this.#httpServer?.kill("SIGKILL");
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
    this.#keybindingManager.cleanup();
    if (this.#httpServer) {
      this.#httpServer.removeAllListeners();
      this.#httpServer.kill("SIGKILL");
    }
  }
}
