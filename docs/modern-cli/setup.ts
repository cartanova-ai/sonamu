#!/usr/bin/env npx tsx

/// <reference types="node" />

/**
 * Modern CLI Tools Setup Script
 *
 * 모던 CLI 도구들을 설치하고 zsh 환경을 설정하는 스크립트입니다.
 *
 * 실행 방법:
 *   npx tsx docs/modern-cli/setup.ts
 *   또는
 *   chmod +x docs/modern-cli/setup.ts && ./docs/modern-cli/setup.ts
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ============================================
// 타입 정의
// ============================================

interface Tool {
  name: string;
  brewName: string;
  isCask?: boolean;
  checkCommand?: string; // which로 체크할 명령어 (기본: name)
  description: string;
}

interface ToolStatus {
  tool: Tool;
  installed: boolean;
  setupDone: boolean;
}

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
type JsonObject = {
  [key: string]: JsonValue | undefined;
};

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && !Array.isArray(value) && Object(value) === value;
}

function isString(value: JsonValue | undefined): value is string {
  return Object.prototype.toString.call(value) === "[object String]";
}

// ============================================
// 설정
// ============================================

const TOOLS: Tool[] = [
  { name: "fd", brewName: "fd", description: "find의 모던 대체제" },
  { name: "rg", brewName: "ripgrep", description: "grep의 모던 대체제" },
  { name: "fzf", brewName: "fzf", description: "fuzzy finder" },
  { name: "bat", brewName: "bat", description: "cat의 모던 대체제" },
  { name: "eza", brewName: "eza", description: "ls의 모던 대체제" },
  { name: "zoxide", brewName: "zoxide", description: "cd의 스마트 대체제" },
  { name: "trash", brewName: "trash-cli", description: "rm의 안전한 대체제" },
  { name: "starship", brewName: "starship", description: "크로스쉘 프롬프트" },
  { name: "btop", brewName: "btop", description: "top의 모던 대체제" },
  { name: "lazygit", brewName: "lazygit", description: "터미널 Git UI" },
  { name: "delta", brewName: "git-delta", description: "git diff 뷰어" },
  { name: "jq", brewName: "jq", description: "JSON 프로세서" },
  { name: "tldr", brewName: "tldr", description: "간결한 man 페이지" },
  {
    name: "AltTab",
    brewName: "alt-tab",
    isCask: true,
    description: "윈도우 스타일 앱 스위처",
  },
  {
    name: "Hack Nerd Font",
    brewName: "font-hack-nerd-font",
    isCask: true,
    checkCommand: "HackNerdFont", // 폰트는 which로 체크 불가, 별도 처리
    description: "Nerd Font (아이콘용)",
  },
];

const CLAUDE_CODE_ALLOWED_TOOLS = [
  "Bash(fd:*)",
  "Bash(rg:*)",
  "Bash(fzf:*)",
  "Bash(bat:*)",
  "Bash(eza:*)",
  "Bash(z:*)",
  "Bash(zi:*)",
  "Bash(zoxide:*)",
  "Bash(trash:*)",
  "Bash(btop:*)",
  "Bash(lazygit:*)",
  "Bash(delta:*)",
  "Bash(jq:*)",
  "Bash(tldr:*)",
];

const HOME = os.homedir();
const ZSHRC_PATH = path.join(HOME, ".zshrc");
const CONFIG_ZSH_DIR = path.join(HOME, ".config", "zsh");
const MODERN_CLI_ZSH_PATH = path.join(CONFIG_ZSH_DIR, "modern-cli.zsh");
const CLAUDE_SETTINGS_PATH = path.join(HOME, ".claude", "settings.json");

// ============================================
// 유틸리티 함수
// ============================================

function log(message: string, type: "info" | "success" | "warn" | "error" = "info"): void {
  const colors = {
    info: "\x1b[36m", // cyan
    success: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
  };
  const icons = {
    info: "ℹ",
    success: "✓",
    warn: "⚠",
    error: "✗",
  };
  const reset = "\x1b[0m";
  console.log(`${colors[type]}${icons[type]} ${message}${reset}`);
}

function captureCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function commandExists(command: string): boolean {
  const result = spawnSync("which", [command], { encoding: "utf-8" });
  return result.status === 0;
}

function installWithBrew(args: string[]): boolean {
  return spawnSync("brew", ["install", ...args], { stdio: "inherit" }).status === 0;
}

// ============================================
// 체크 함수들
// ============================================

function checkInstalled(tool: Tool): boolean {
  const cmd = tool.checkCommand || tool.name;

  // Cask 앱의 경우
  if (tool.isCask) {
    // 폰트의 경우 폰트 디렉토리에서 확인
    if (tool.brewName.startsWith("font-")) {
      const fontDir = path.join(HOME, "Library", "Fonts");
      const systemFontDir = "/Library/Fonts";

      // Hack Nerd Font 체크
      const fontExists =
        fs.readdirSync(fontDir).some((f) => f.includes("HackNerd")) ||
        fs.readdirSync(systemFontDir).some((f) => f.includes("HackNerd"));
      return fontExists;
    }

    // 일반 앱의 경우 Applications 폴더에서 확인
    const appPath = `/Applications/${tool.name}.app`;
    return fs.existsSync(appPath);
  }

  return commandExists(cmd);
}

function checkSetupDone(): boolean {
  // modern-cli.zsh 파일이 존재하고, .zshrc에서 source 하고 있는지 확인
  if (!fs.existsSync(MODERN_CLI_ZSH_PATH)) {
    return false;
  }

  if (!fs.existsSync(ZSHRC_PATH)) {
    return false;
  }

  const zshrcContent = fs.readFileSync(ZSHRC_PATH, "utf-8");
  return zshrcContent.includes("modern-cli.zsh");
}

function getToolStatuses(): ToolStatus[] {
  return TOOLS.map((tool) => ({
    tool,
    installed: checkInstalled(tool),
    setupDone: checkSetupDone(),
  }));
}

// ============================================
// 설치 함수들
// ============================================

function installTools(tools: Tool[]): void {
  if (tools.length === 0) {
    log("모든 도구가 이미 설치되어 있습니다.", "success");
    return;
  }

  // Homebrew 설치 확인
  if (!commandExists("brew")) {
    log("Homebrew가 설치되어 있지 않습니다. 먼저 Homebrew를 설치해주세요.", "error");
    log(
      '설치 명령: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
      "info",
    );
    process.exit(1);
  }

  const regularTools = tools.filter((t) => !t.isCask);
  const caskTools = tools.filter((t) => t.isCask);

  // 일반 도구 설치
  if (regularTools.length > 0) {
    const brewNames = regularTools.map((t) => t.brewName);
    log(`설치 중: ${regularTools.map((t) => t.name).join(", ")}`, "info");

    if (installWithBrew(brewNames)) {
      log("일반 도구 설치 완료", "success");
    } else {
      log("일부 도구 설치에 실패했습니다. 개별 설치를 시도합니다.", "warn");

      for (const tool of regularTools) {
        if (installWithBrew([tool.brewName])) {
          log(`${tool.name} 설치 완료`, "success");
        } else {
          log(`${tool.name} 설치 실패`, "error");
        }
      }
    }
  }

  // Cask 도구 설치
  for (const tool of caskTools) {
    log(`설치 중: ${tool.name} (cask)`, "info");
    if (installWithBrew(["--cask", tool.brewName])) {
      log(`${tool.name} 설치 완료`, "success");
    } else {
      log(`${tool.name} 설치 실패`, "error");
    }
  }
}

// ============================================
// 설정 파일 생성 함수들
// ============================================

function generateModernCliZsh(): string {
  return `# ============================================
# Modern CLI Tools Configuration
# Generated by setup.ts
# Do not edit manually - rerun setup.ts to update
# ============================================

# fd: find의 모던 대체제
alias find='fd'

# rg (ripgrep): grep의 모던 대체제
alias grep='rg'

# bat: cat의 모던 대체제
alias cat='bat'
alias less='bat'

# eza: ls의 모던 대체제
alias ls='eza'
alias ll='eza -l --git'
alias la='eza -la --git'
alias lt='eza -T'
alias l='eza -lah --git'

# trash: rm의 안전한 대체제
alias rm='echo "\\033[33m-> Moving to trash (real delete: command rm)\\033[0m"; trash'
alias del='trash'

# zoxide: cd의 스마트 대체제
# z 디렉토리명 → 학습된 경로로 점프
# zi → fzf로 인터랙티브 선택

# Git related
alias tig='lazygit'
alias gdiff='delta'

# Others
alias top='btop'
alias help='tldr'
alias man='tldr'

# fzf 설정
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border --inline-info'
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND='fd --type d --hidden --follow --exclude .git'

# zoxide 초기화
eval "$(zoxide init zsh)"

# starship 프롬프트 초기화 (oh-my-zsh 사용시 주석 처리)
# oh-my-zsh 대신 starship을 사용하려면 아래 주석을 해제하세요
# eval "$(starship init zsh)"

# bat 설정
export BAT_THEME="gruvbox-dark"
export BAT_STYLE="numbers,changes,header"

# eza 아이콘 (Nerd Font 필요)
export EZA_ICONS_AUTO='1'
`;
}

function setupZshConfig(): void {
  // ~/.config/zsh 디렉토리 생성
  if (!fs.existsSync(CONFIG_ZSH_DIR)) {
    fs.mkdirSync(CONFIG_ZSH_DIR, { recursive: true });
    log(`디렉토리 생성: ${CONFIG_ZSH_DIR}`, "success");
  }

  // modern-cli.zsh 생성
  const content = generateModernCliZsh();
  fs.writeFileSync(MODERN_CLI_ZSH_PATH, content, "utf-8");
  log(`설정 파일 생성: ${MODERN_CLI_ZSH_PATH}`, "success");

  // ~/.zshrc에 source 라인 추가
  const sourceLineMarker = "# Modern CLI Tools";
  const sourceLine = `\n${sourceLineMarker}\n[ -f ~/.config/zsh/modern-cli.zsh ] && source ~/.config/zsh/modern-cli.zsh\n`;

  if (!fs.existsSync(ZSHRC_PATH)) {
    fs.writeFileSync(ZSHRC_PATH, sourceLine, "utf-8");
    log(`~/.zshrc 파일 생성 및 source 라인 추가`, "success");
  } else {
    const zshrcContent = fs.readFileSync(ZSHRC_PATH, "utf-8");

    if (!zshrcContent.includes("modern-cli.zsh")) {
      fs.appendFileSync(ZSHRC_PATH, sourceLine, "utf-8");
      log(`~/.zshrc에 source 라인 추가`, "success");
    } else {
      log(`~/.zshrc에 이미 source 라인이 존재합니다.`, "info");
    }
  }
}

// ============================================
// Claude Code 설정
// ============================================

function setupClaudeCodeSettings(): void {
  const claudeDir = path.dirname(CLAUDE_SETTINGS_PATH);

  // ~/.claude 디렉토리 생성
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
    log(`디렉토리 생성: ${claudeDir}`, "success");
  }

  // 기존 settings.json 읽기 또는 새로 생성
  let settings: JsonObject = {};

  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
      const parsedSettings: JsonValue = JSON.parse(content);
      if (!isJsonObject(parsedSettings)) {
        throw new Error("settings.json must contain an object");
      }
      settings = parsedSettings;
    } catch {
      log("기존 settings.json 파싱 실패, 새로 생성합니다.", "warn");
    }
  }

  // allowedTools 배열이 없으면 생성
  if (!Array.isArray(settings.allowedTools) || !settings.allowedTools.every(isString)) {
    settings.allowedTools = [];
  }

  // 새 도구들 추가 (중복 제거)
  const existingTools = new Set(settings.allowedTools);
  let addedCount = 0;

  for (const tool of CLAUDE_CODE_ALLOWED_TOOLS) {
    if (!existingTools.has(tool)) {
      settings.allowedTools.push(tool);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
    log(`Claude Code settings.json에 ${addedCount}개 도구 추가`, "success");
  } else {
    log(`Claude Code settings.json에 이미 모든 도구가 등록되어 있습니다.`, "info");
  }
}

// ============================================
// fzf 추가 설정
// ============================================

function setupFzf(): void {
  // fzf 키 바인딩 설치 (brew로 설치한 경우)
  const fzfInstallPath = captureCommand("brew", ["--prefix", "fzf"]);

  if (fzfInstallPath) {
    const fzfInstallScript = path.join(fzfInstallPath, "install");

    if (fs.existsSync(fzfInstallScript)) {
      log("fzf 키 바인딩 설정 중...", "info");
      // --key-bindings: Ctrl+T, Ctrl+R, Alt+C 바인딩
      // --completion: ** 자동완성
      // --no-update-rc: .zshrc를 직접 수정하지 않음 (우리가 modern-cli.zsh에서 관리)
      const result = spawnSync(
        fzfInstallScript,
        ["--key-bindings", "--completion", "--no-update-rc"],
        { stdio: "inherit" },
      );
      if (result.status === 0) {
        log("fzf 키 바인딩 설정 완료", "success");
      } else {
        log("fzf 키 바인딩 설정 실패", "warn");
      }
    }
  }
}

// ============================================
// 메인 실행
// ============================================

async function main(): Promise<void> {
  console.log("\n");
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║         Modern CLI Tools Setup Script                      ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("\n");

  // 1. 현재 상태 체크
  log("현재 상태를 확인합니다...", "info");
  console.log("");

  const statuses = getToolStatuses();
  const notInstalled: Tool[] = [];

  console.log("┌─────────────────┬──────────────────────────────┬──────────┐");
  console.log("│ 도구            │ 설명                         │ 설치상태 │");
  console.log("├─────────────────┼──────────────────────────────┼──────────┤");

  for (const status of statuses) {
    const name = status.tool.name.padEnd(15);
    const desc = status.tool.description.padEnd(28);
    const installed = status.installed ? "\x1b[32m✓ 설치됨\x1b[0m" : "\x1b[31m✗ 미설치\x1b[0m";

    console.log(`│ ${name} │ ${desc} │ ${installed} │`);

    if (!status.installed) {
      notInstalled.push(status.tool);
    }
  }

  console.log("└─────────────────┴──────────────────────────────┴──────────┘");
  console.log("");

  // 2. zsh 설정 상태 확인
  const setupDone = checkSetupDone();
  log(`zsh 설정 상태: ${setupDone ? "설정 완료" : "설정 필요"}`, setupDone ? "success" : "warn");
  console.log("");

  // 3. 미설치 도구 설치
  if (notInstalled.length > 0) {
    log(`${notInstalled.length}개 도구를 설치합니다...`, "info");
    console.log("");
    installTools(notInstalled);
    console.log("");
  }

  // 4. fzf 키 바인딩 설정
  if (commandExists("fzf")) {
    setupFzf();
    console.log("");
  }

  // 5. zsh 설정 (셋업이 안 되어 있으면)
  if (!setupDone) {
    log("zsh 설정을 진행합니다...", "info");
    setupZshConfig();
    console.log("");
  }

  // 6. Claude Code 설정
  log("Claude Code 설정을 확인합니다...", "info");
  setupClaudeCodeSettings();
  console.log("");

  // 7. 완료 메시지
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║                    설치 완료!                               ║");
  console.log("╚════════════════════════════════════════════════════════════╝");
  console.log("");
  log("새 터미널을 열거나 다음 명령을 실행하세요:", "info");
  console.log("");
  console.log("    source ~/.zshrc");
  console.log("");
  log("Nerd Font가 필요할 수 있습니다 (아이콘 표시용):", "info");
  console.log("");
  console.log("    brew install --cask font-hack-nerd-font");
  console.log("");
}

main().catch((error) => {
  log(`오류 발생: ${error.message}`, "error");
  process.exit(1);
});
