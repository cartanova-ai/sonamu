import { describe, expect, it } from "vitest";

// process.argv 파싱 로직을 검증하는 유닛 테스트
// test-command.ts의 파싱 로직을 동일하게 구현하여 독립 검증
function parseArgs(args: string[]): {
  files: string[];
  pattern: string | undefined;
  showTraces: boolean;
} {
  const files: string[] = [];
  let pattern: string | undefined;
  let showTraces = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--pattern" || arg === "-p") {
      pattern = args[++i];
    } else if (arg === "--traces" || arg === "-t") {
      showTraces = true;
    } else if (!arg.startsWith("-")) {
      files.push(arg);
    }
  }

  return { files, pattern, showTraces };
}

describe("test-command argument parsing", () => {
  it("인수 없음 시 빈 payload를 생성한다", () => {
    const { files, pattern, showTraces } = parseArgs([]);
    expect(files).toEqual([]);
    expect(pattern).toBeUndefined();
    expect(showTraces).toBe(false);
  });

  it("files와 --pattern이 올바르게 파싱된다", () => {
    const { files, pattern, showTraces } = parseArgs(["src/foo.test.ts", "--pattern", "my test"]);
    expect(files).toEqual(["src/foo.test.ts"]);
    expect(pattern).toBe("my test");
    expect(showTraces).toBe(false);
  });

  it("-p 단축 옵션이 동작한다", () => {
    const { files, pattern } = parseArgs(["-p", "name"]);
    expect(files).toEqual([]);
    expect(pattern).toBe("name");
  });

  it("여러 파일을 나열할 수 있다", () => {
    const { files, pattern } = parseArgs(["a.test.ts", "b.test.ts"]);
    expect(files).toEqual(["a.test.ts", "b.test.ts"]);
    expect(pattern).toBeUndefined();
  });

  it("files와 -p를 혼합할 수 있다", () => {
    const { files, pattern } = parseArgs(["a.test.ts", "-p", "desc"]);
    expect(files).toEqual(["a.test.ts"]);
    expect(pattern).toBe("desc");
  });

  it("--로 시작하는 알 수 없는 플래그는 files에 포함되지 않는다", () => {
    const { files, pattern } = parseArgs(["--unknown", "a.test.ts"]);
    expect(files).toEqual(["a.test.ts"]);
    expect(pattern).toBeUndefined();
  });

  it("--traces 플래그가 showTraces를 true로 설정한다", () => {
    const { files, pattern, showTraces } = parseArgs(["--traces"]);
    expect(files).toEqual([]);
    expect(pattern).toBeUndefined();
    expect(showTraces).toBe(true);
  });

  it("-t 단축 옵션이 showTraces를 true로 설정한다", () => {
    const { showTraces } = parseArgs(["-t"]);
    expect(showTraces).toBe(true);
  });

  it("files, -p, --traces를 혼합할 수 있다", () => {
    const { files, pattern, showTraces } = parseArgs(["a.test.ts", "-p", "desc", "--traces"]);
    expect(files).toEqual(["a.test.ts"]);
    expect(pattern).toBe("desc");
    expect(showTraces).toBe(true);
  });
});
