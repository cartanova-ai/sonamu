import { execFile } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { getFileDiff, parseBlameOutput, parseLogOutput } from "./git.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

const mockedExecFile = vi.mocked(execFile);

const RS = "\x1e";
const US = "\x1f";

describe("parseLogOutput", () => {
  it("헤더/빈줄/numstat 항목을 안전하게 파싱한다", () => {
    const header = [
      `abc1234${"0".repeat(33)}`,
      "Alice",
      "alice@test.com",
      "2026-03-01T10:00:00+09:00",
      "feat: add file",
      "body text",
    ].join(US);
    const numstat = "10\t5\tsrc/main.ts\n3\t1\tsrc/util.ts";
    const stdout = `${RS}${header}\n\n${numstat}\n`;

    const commits = parseLogOutput(stdout);
    expect(commits).toHaveLength(1);

    const c = commits[0];
    expect(c.hash).toBe(`abc1234${"0".repeat(33)}`);
    expect(c.author.name).toBe("Alice");
    expect(c.author.email).toBe("alice@test.com");
    expect(c.authoredAt).toBe("2026-03-01T10:00:00+09:00");
    expect(c.subject).toBe("feat: add file");
    expect(c.body).toBe("body text");
    expect(c.files).toHaveLength(2);
    expect(c.files[0]).toEqual({ path: "src/main.ts", added: 10, removed: 5 });
    expect(c.files[1]).toEqual({ path: "src/util.ts", added: 3, removed: 1 });
    expect(c.totalAdded).toBe(13);
    expect(c.totalRemoved).toBe(6);
  });

  it("binary(-) numstat 항목을 null로 파싱한다", () => {
    const header = [
      "a".repeat(40),
      "Bob",
      "bob@test.com",
      "2026-03-02T12:00:00+09:00",
      "add image",
      "",
    ].join(US);
    const numstat = "-\t-\tassets/logo.png";
    const stdout = `${RS}${header}\n${numstat}\n`;

    const commits = parseLogOutput(stdout);
    expect(commits).toHaveLength(1);

    const f = commits[0].files[0];
    expect(f.added).toBeNull();
    expect(f.removed).toBeNull();
    expect(f.path).toBe("assets/logo.png");
    expect(commits[0].totalAdded).toBe(0);
    expect(commits[0].totalRemoved).toBe(0);
  });

  it("여러 커밋을 파싱한다", () => {
    const header1 = ["a".repeat(40), "A", "a@t.com", "2026-01-01T00:00:00Z", "first", ""].join(US);
    const header2 = ["b".repeat(40), "B", "b@t.com", "2026-01-02T00:00:00Z", "second", ""].join(US);
    const stdout = `${RS}${header1}\n1\t0\tfile.ts\n${RS}${header2}\n0\t1\tfile.ts\n`;

    const commits = parseLogOutput(stdout);
    expect(commits).toHaveLength(2);
    expect(commits[0].hash).toBe("a".repeat(40));
    expect(commits[1].hash).toBe("b".repeat(40));
  });

  it("빈 출력에서 빈 배열을 반환한다", () => {
    expect(parseLogOutput("")).toEqual([]);
    expect(parseLogOutput("  \n  ")).toEqual([]);
  });

  it("헤더 필드가 부족한 레코드는 건너뛴다", () => {
    const broken = ["abc", "Author"].join(US);
    const stdout = `${RS}${broken}\n`;
    expect(parseLogOutput(stdout)).toEqual([]);
  });
});

describe("parseBlameOutput", () => {
  it("porcelain 출력에서 content line과 author를 정확히 파싱한다", () => {
    const hash = "a".repeat(40);
    const porcelain = [
      `${hash} 1 1 3`,
      `author Alice`,
      `author-mail <alice@test.com>`,
      `author-time 1709280000`,
      `author-tz +0900`,
      `committer Alice`,
      `committer-mail <alice@test.com>`,
      `committer-time 1709280000`,
      `committer-tz +0900`,
      `summary initial commit`,
      `filename src/main.ts`,
      `\tline one content`,
      `${hash} 2 2`,
      `\tline two content`,
      `${hash} 3 3`,
      `\tline three`,
    ].join("\n");

    const report = parseBlameOutput(porcelain, "HEAD", "src/main.ts");
    expect(report.revision).toBe("HEAD");
    expect(report.path).toBe("src/main.ts");
    expect(report.totalLines).toBe(3);
    expect(report.lines).toHaveLength(3);

    expect(report.lines[0].lineNumber).toBe(1);
    expect(report.lines[0].commitHash).toBe(hash);
    expect(report.lines[0].author.name).toBe("Alice");
    expect(report.lines[0].author.email).toBe("alice@test.com");
    expect(report.lines[0].content).toBe("line one content");

    expect(report.lines[1].lineNumber).toBe(2);
    expect(report.lines[1].content).toBe("line two content");

    expect(report.lines[2].lineNumber).toBe(3);
    expect(report.lines[2].content).toBe("line three");
  });

  it("여러 커밋의 blame을 파싱한다", () => {
    const hash1 = "a".repeat(40);
    const hash2 = "b".repeat(40);
    const porcelain = [
      `${hash1} 1 1 1`,
      `author Alice`,
      `author-mail <alice@test.com>`,
      `summary first`,
      `filename f.ts`,
      `\tfirst line`,
      `${hash2} 1 2 1`,
      `author Bob`,
      `author-mail <bob@test.com>`,
      `summary second`,
      `filename f.ts`,
      `\tsecond line`,
    ].join("\n");

    const report = parseBlameOutput(porcelain, "HEAD", "f.ts");
    expect(report.totalLines).toBe(2);
    expect(report.lines[0].author.name).toBe("Alice");
    expect(report.lines[0].commitHash).toBe(hash1);
    expect(report.lines[1].author.name).toBe("Bob");
    expect(report.lines[1].commitHash).toBe(hash2);
  });

  it("빈 출력에서 totalLines 0을 반환한다", () => {
    const report = parseBlameOutput("", "HEAD", "empty.ts");
    expect(report.totalLines).toBe(0);
    expect(report.lines).toEqual([]);
  });
});

// --- getFileDiff ---

describe("getFileDiff", () => {
  it("루트 커밋 지정 시 ~1 실패 후 --root로 fallback한다", async () => {
    let callCount = 0;

    mockedExecFile.mockImplementation((_cmd, args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      callCount += 1;
      const argList = args as string[];

      if (argList.includes("abc123~1")) {
        // 루트 커밋이라 ~1 참조가 없으므로 git 에러를 반환합니다.
        const err = new Error("unknown revision") as NodeJS.ErrnoException;
        cb(err, "", "unknown revision or path");
      } else if (argList.includes("--root")) {
        cb(null, "diff --root output", "");
      } else {
        cb(null, "", "");
      }
      return { stdin: null } as ReturnType<typeof execFile>;
    });

    const result = await getFileDiff("/project/spec.json", {
      cwd: "/project",
      commit: "abc123",
    });

    expect(callCount).toBe(2);
    expect(result.diffText).toBe("diff --root output");
    expect(result.baseRef).toBe("");
    expect(result.headRef).toBe("abc123");
  });

  it("일반 커밋은 ~1..hash diff를 사용한다", async () => {
    mockedExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const cb = callback as (
        error: NodeJS.ErrnoException | null,
        stdout: string,
        stderr: string,
      ) => void;
      cb(null, "normal diff output", "");
      return { stdin: null } as ReturnType<typeof execFile>;
    });

    const result = await getFileDiff("/project/spec.json", {
      cwd: "/project",
      commit: "def456",
    });

    expect(result.diffText).toBe("normal diff output");
    expect(result.baseRef).toBe("def456~1");
    expect(result.headRef).toBe("def456");
  });
});
