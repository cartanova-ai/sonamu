/**
 * 파싱된 키바인딩 코드 (단일 키 조합)
 * 예시: "cmd+r" -> { modifiers: ["cmd"], key: "r" }
 */
type ParsedChord = {
  modifiers: string[];
  key: string;
};

/**
 * 파싱된 키바인딩 (최대 2개의 코드까지 지원)
 * 예시: "cmd+r cmd+r" -> { chords: [{ modifiers: ["cmd"], key: "r" }, { modifiers: ["cmd"], key: "r" }] }
 */
type ParsedKeybinding = {
  chords: ParsedChord[];
};

export type Action = { type: "restart" } | { type: "clear" } | { type: "shell"; command: string };

export type KeyBinding = {
  keybinding: string; // 원본 키바인딩 문자열 (예: "cmd+r cmd+r")
  parsed: ParsedKeybinding; // 파싱된 표현
  actions: Action[];
  description: string;
};

/**
 * 단일 코드를 파싱합니다 (예: "cmd+r", "ctrl+a", "r", "enter")
 */
function parseChord(chordStr: string): ParsedChord | null {
  const normalized = chordStr.toLowerCase().trim();
  if (!normalized) return null;

  const parts = normalized.split("+");
  if (parts.length === 1) {
    // 단순 키입니다: "r", "enter"
    return { modifiers: [], key: normalizeKey(parts[0]) };
  }

  // 수정자 키가 포함되어 있습니다: "cmd+r", "ctrl+shift+a"
  const key = normalizeKey(parts[parts.length - 1]);
  const modifiers = parts.slice(0, -1).map((m) => normalizeModifier(m.trim()));

  return { modifiers, key };
}

/**
 * 키바인딩 문자열을 파싱합니다 (예: "r", "cmd+r", "cmd+r cmd+r")
 * 최대 2개의 코드까지 지원합니다
 */
export function parseKeybinding(keybindingStr: string): ParsedKeybinding | null {
  const chords = keybindingStr
    .trim()
    .split(/\s+/)
    .filter((c) => c.length > 0);
  if (chords.length === 0 || chords.length > 2) {
    return null;
  }

  const parsedChords: ParsedChord[] = [];
  for (const chord of chords) {
    const parsed = parseChord(chord);
    if (!parsed) return null;
    parsedChords.push(parsed);
  }

  return { chords: parsedChords };
}

/**
 * 키 이름을 정규화합니다 (예: "enter" -> "enter", "return" -> "enter")
 */
function normalizeKey(key: string): string {
  const normalized = key.toLowerCase();
  // 일반적인 키 별칭을 매핑합니다
  const keyMap = new Map([
    ["return", "enter"],
    ["cr", "enter"],
    ["lf", "enter"],
    ["space", " "],
    ["sp", " "],
    ["backspace", "backspace"],
    ["delete", "delete"],
    ["tab", "tab"],
    ["escape", "escape"],
    ["esc", "escape"],
    ["up", "up"],
    ["down", "down"],
    ["left", "left"],
    ["right", "right"],
  ]);
  return keyMap.get(normalized) ?? normalized;
}

/**
 * 수정자 키 이름을 정규화합니다 (예: "cmd" -> "meta", "ctrl" -> "ctrl")
 */
function normalizeModifier(modifier: string): string {
  const normalized = modifier.toLowerCase();
  const modifierMap = new Map([
    ["cmd", "meta"],
    ["meta", "meta"],
    ["ctrl", "ctrl"],
    ["control", "ctrl"],
    ["alt", "alt"],
    ["shift", "shift"],
  ]);
  return modifierMap.get(normalized) ?? normalized;
}

/**
 * readline Key 객체에서 키 입력을 감지합니다
 * 파싱된 코드를 반환하거나 인식되지 않으면 null을 반환합니다
 */
function detectKeyPressFromReadline(key: {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  sequence?: string;
}): ParsedChord | null {
  const modifiers: string[] = [];
  if (key.ctrl) modifiers.push("ctrl");
  if (key.meta) modifiers.push("meta");
  if (key.shift) modifiers.push("shift");
  if (key.alt) modifiers.push("alt");

  // 특수 키를 처리합니다
  if (key.name) {
    // 키 이름을 정규화합니다
    const mappedKey = normalizeKey(key.name);
    return { modifiers, key: mappedKey };
  }

  // 문자 키를 처리합니다 (name이 설정되지 않았지만 sequence가 있는 경우)
  if (key.sequence && key.sequence.length === 1) {
    const char = key.sequence.toLowerCase();
    if (char >= " " && char <= "~") {
      return { modifiers, key: char };
    }
  }

  return null;
}

/**
 * 원시 입력에서 키 입력을 감지합니다 (레거시, 호환성을 위해 유지)
 * 파싱된 코드를 반환하거나 인식되지 않으면 null을 반환합니다
 * @deprecated detectKeyPressFromReadline 사용을 권장합니다
 */
function detectKeyPress(key: string): ParsedChord | null {
  // Ctrl+C입니다
  if (key === "\u0003") {
    return null; // 별도로 처리됩니다
  }

  // Enter입니다
  if (key === "\r" || key === "\n") {
    return { modifiers: [], key: "enter" };
  }

  // 이스케이프 시퀀스입니다 (Meta/Cmd 키용)
  // 대부분의 터미널이 Meta/Cmd 키에 대해 이스케이프 시퀀스를 전송합니다
  // 형식: \x1b[sequence 또는 \x1b[char
  if (key.startsWith("\x1b")) {
    // 이스케이프 시퀀스이므로 특별히 처리해야 합니다
    // 현재는 일반적인 패턴을 파싱하려고 시도합니다
    // 참고: 터미널에 따라 다르게 작동할 수 있습니다
    return null; // TODO: 이스케이프 시퀀스 파싱 구현이 필요합니다
  }

  // 단순 단일 문자 키입니다 (수정자 없음)
  if (key.length === 1 && key >= " " && key <= "~") {
    // 출력 가능한 ASCII 문자입니다
    return { modifiers: [], key: key.toLowerCase() };
  }

  // 특수 키입니다
  const specialKeys = new Map([
    ["\u0008", "backspace"],
    ["\u0009", "tab"],
    ["\u001b", "escape"],
    ["\u007f", "backspace"],
  ]);

  const specialKey = specialKeys.get(key);
  if (specialKey) {
    return { modifiers: [], key: specialKey };
  }

  return null;
}

/**
 * 파싱된 코드가 현재 입력과 일치하는지 확인합니다
 */
function chordMatches(input: ParsedChord, expected: ParsedChord): boolean {
  // 키가 일치해야 합니다
  if (input.key !== expected.key) {
    return false;
  }

  // 수정자 키가 일치해야 합니다 (순서는 상관없습니다)
  if (input.modifiers.length !== expected.modifiers.length) {
    return false;
  }

  const inputMods = new Set(input.modifiers);
  const expectedMods = new Set(expected.modifiers);

  if (inputMods.size !== expectedMods.size) {
    return false;
  }

  for (const mod of inputMods) {
    if (!expectedMods.has(mod)) {
      return false;
    }
  }

  return true;
}

/**
 * 키 입력 및 매칭을 처리하는 키바인딩 매니저입니다
 */
export class KeybindingManager {
  #keyBindings: KeyBinding[] = [];
  #currentChordSequence: ParsedChord[] = [];
  #chordTimeout?: NodeJS.Timeout;

  /**
   * 키바인딩을 추가합니다
   */
  addKeybinding(binding: KeyBinding) {
    this.#keyBindings.push(binding);
  }

  /**
   * 모든 키바인딩을 가져옵니다
   */
  getKeybindings(): KeyBinding[] {
    return this.#keyBindings;
  }

  /**
   * 현재 코드 시퀀스가 키바인딩과 일치하는지 확인합니다
   */
  private checkMatch(): KeyBinding | null {
    for (const binding of this.#keyBindings) {
      const expected = binding.parsed.chords;

      // 단일 코드 바인딩입니다
      if (expected.length === 1) {
        if (
          this.#currentChordSequence.length === 1 &&
          chordMatches(this.#currentChordSequence[0], expected[0])
        ) {
          return binding;
        }
      }
      // 두 코드 바인딩입니다
      else if (expected.length === 2) {
        if (
          this.#currentChordSequence.length === 2 &&
          chordMatches(this.#currentChordSequence[0], expected[0]) &&
          chordMatches(this.#currentChordSequence[1], expected[1])
        ) {
          return binding;
        }
      }
    }

    return null;
  }

  /**
   * readline Key 객체에서 키 입력을 처리합니다
   * 일치하는 항목을 찾아 처리했으면 true를 반환합니다
   */
  processKeyPressFromReadline(
    key: {
      name?: string;
      ctrl?: boolean;
      meta?: boolean;
      shift?: boolean;
      alt?: boolean;
      sequence?: string;
    },
    onMatch: (binding: KeyBinding) => void,
  ): boolean {
    // 눌린 키를 감지합니다
    const detectedChord = detectKeyPressFromReadline(key);
    if (!detectedChord) {
      // 알 수 없는 키입니다, 시퀀스를 리셋합니다
      this.#resetChordSequence();
      return false;
    }

    // 현재 코드 시퀀스에 추가합니다
    this.#currentChordSequence.push(detectedChord);

    // 일치 항목을 확인합니다
    const match = this.checkMatch();
    if (match) {
      this.#resetChordSequence();
      onMatch(match);
      return true;
    }

    // 이미 2개의 코드가 있으면 일치 항목이 없습니다, 리셋합니다
    if (this.#currentChordSequence.length >= 2) {
      this.#resetChordSequence();
      return false;
    }

    // 두 번째 코드가 오지 않으면 시퀀스를 리셋하기 위한 타임아웃을 설정합니다
    // 코드 시퀀스는 1초 내에 입력되어야 합니다
    if (this.#chordTimeout) {
      clearTimeout(this.#chordTimeout);
    }
    this.#chordTimeout = setTimeout(() => {
      // 단일 코드 일치를 확인합니다
      if (this.#currentChordSequence.length === 1) {
        const singleMatch = this.#keyBindings.find(
          (b) =>
            b.parsed.chords.length === 1 &&
            chordMatches(this.#currentChordSequence[0], b.parsed.chords[0]),
        );
        if (singleMatch) {
          onMatch(singleMatch);
        }
      }
      this.#resetChordSequence();
    }, 1000);

    return false;
  }

  /**
   * 원시 문자열에서 키 입력을 처리합니다 (레거시, 호환성을 위해 유지)
   * @deprecated processKeyPressFromReadline 사용을 권장합니다
   */
  processKeyPress(key: string, onMatch: (binding: KeyBinding) => void): boolean {
    // 눌린 키를 감지합니다
    const detectedChord = detectKeyPress(key);
    if (!detectedChord) {
      // 알 수 없는 키입니다, 시퀀스를 리셋합니다
      this.#resetChordSequence();
      return false;
    }

    // 현재 코드 시퀀스에 추가합니다
    this.#currentChordSequence.push(detectedChord);

    // 일치 항목을 확인합니다
    const match = this.checkMatch();
    if (match) {
      this.#resetChordSequence();
      onMatch(match);
      return true;
    }

    // 이미 2개의 코드가 있으면 일치 항목이 없습니다, 리셋합니다
    if (this.#currentChordSequence.length >= 2) {
      this.#resetChordSequence();
      return false;
    }

    // 두 번째 코드가 오지 않으면 시퀀스를 리셋하기 위한 타임아웃을 설정합니다
    // 코드 시퀀스는 1초 내에 입력되어야 합니다
    if (this.#chordTimeout) {
      clearTimeout(this.#chordTimeout);
    }
    this.#chordTimeout = setTimeout(() => {
      // 단일 코드 일치를 확인합니다
      if (this.#currentChordSequence.length === 1) {
        const singleMatch = this.#keyBindings.find(
          (b) =>
            b.parsed.chords.length === 1 &&
            chordMatches(this.#currentChordSequence[0], b.parsed.chords[0]),
        );
        if (singleMatch) {
          onMatch(singleMatch);
        }
      }
      this.#resetChordSequence();
    }, 1000);

    return false;
  }

  /**
   * 코드 시퀀스를 리셋합니다 (타임아웃 또는 일치 후 호출됩니다)
   */
  #resetChordSequence() {
    this.#currentChordSequence = [];
    if (this.#chordTimeout) {
      clearTimeout(this.#chordTimeout);
      this.#chordTimeout = undefined;
    }
  }

  /**
   * 리소스를 정리합니다
   */
  cleanup() {
    this.#resetChordSequence();
  }
}
