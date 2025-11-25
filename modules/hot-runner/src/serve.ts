import { relative } from "node:path";
import { args, BaseCommand, flags } from "@adonisjs/ace";
import { type ExecaChildProcess, execa } from "execa";

import { runNode } from "./helpers.js";

type Action = { type: "restart" } | { type: "shell"; command: string };

type KeyBinding = {
  key: string;
  actions: Action[];
  description: string;
};

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
  #keyBindings: KeyBinding[] = [];
  #onReloadAsked?: (updatedFile: string, shouldBeReloadable: boolean) => void;
  #onFileInvalidated?: (invalidatedFiles: string[]) => void;

  /**
   * Conditionally clear the terminal screen
   */
  #clearScreen() {
    if (this.clearScreen) {
      process.stdout.write("\u001Bc");
    }
  }

  /**
   * Log messages with hot-runner prefix
   */
  #log(message: string) {
    this.logger.log(`${this.colors.blue("[hot-runner]")} ${message}`);
  }

  /**
   * Starts the HTTP server
   */
  #startHTTPServer() {
    this.#httpServer = runNode(process.cwd(), {
      script: this.script,
      nodeArgs: this.nodeArgs,
      scriptArgs: this.scriptArgs,
    });

    this.#httpServer.on("message", async (message: any) => {
      if (typeof message !== "object") return;

      if ("type" in message && message.type === "hot-hook:full-reload") {
        this.#onReloadAsked?.(message.path, message.shouldBeReloadable);
      }

      if ("type" in message && message.type === "hot-hook:invalidated") {
        this.#onFileInvalidated?.(message.paths);
      }
    });

    this.#httpServer
      .then(() => {
        this.#log(`${this.script} exited.`);
      })
      .catch(({ signal }) => {
        if (signal === "SIGUSR2") {
          // 프로세스가 죽은 이유가 SIGUSR2 때문이라면, 이는 서버 프로세스 재시작을 기대하고 보낸 것일 겁니다.
          // 따라서 재시작해줍니다.
          this.#startHTTPServer();
        } else {
          this.#log(`${this.colors.red(`${this.script} crashed.`)}`);
        }
      });
  }

  /**
   * Execute a shell command
   */
  async #executeShellCommand(command: string, description: string) {
    this.#log(`${description} executing: ${this.colors.dim(command)}`);
    try {
      await execa(command, { shell: true, stdio: "inherit" });
      this.#log(`${this.colors.green("Done")}: ${description}`);
    } catch {
      this.#log(`${this.colors.red("Failed")}: ${description}`);
    }
  }

  /**
   * Parse action string like "restart" or "shell(yarn build)"
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
   * Parse --on-key arguments into KeyBinding objects
   * Format: key:action1:action2:...:description
   * Actions: "restart" or "shell(command)"
   */
  #parseKeyBindings() {
    if (!this.onKey?.length) return;

    for (const binding of this.onKey) {
      const parts = binding.split(":");
      if (parts.length < 3) {
        this.#log(`${this.colors.yellow("Warning")}: Invalid key binding format: "${binding}"`);
        continue;
      }

      const key = parts[0].toLowerCase();
      const description = parts[parts.length - 1];
      const actionStrs = parts.slice(1, -1);

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
        this.#keyBindings.push({ key, actions, description });
      }
    }
  }

  /**
   * Execute all actions for a key binding
   */
  async #executeActions(binding: KeyBinding) {
    this.#log(`${binding.description}(${this.colors.cyan(binding.key)}) triggered.`);

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
   * Setup keyboard input listener for key bindings
   */
  #setupKeyboardListener() {
    if (!process.stdin.isTTY || this.#keyBindings.length === 0) return;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (key: string) => {
      // Ctrl+C
      if (key === "\u0003") {
        this.close().then(() => process.exit());
        return;
      }

      const binding = this.#keyBindings.find((b) => b.key === key.toLowerCase());
      if (binding) {
        this.#executeActions(binding);
      }
    });

    const keyHints = this.#keyBindings
      .map((b) => `${this.colors.cyan(b.key)} ${b.description}`)
      .join(" | ");
    this.#log(`Keys: ${keyHints}`);
  }

  /**
   * Start the HTTP server and watch for full reload requests
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
   * Close watchers and running child processes
   */
  async close() {
    if (this.#httpServer) {
      this.#httpServer.removeAllListeners();
      this.#httpServer.kill("SIGKILL");
    }
  }
}
