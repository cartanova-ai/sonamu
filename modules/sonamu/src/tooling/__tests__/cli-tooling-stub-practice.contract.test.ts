import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tooling } from "../cli-tooling";
import { attachSonamuTestRoot, detachSonamuTestRoot } from "./helpers/sonamu-test-root";

let apiRoot = "";
let practiceDir = "";

// 구 CLI가 만들던 practice 스텁 본문을 그대로 재현합니다.
function expectedCode(fileName: string): string {
  return [
    `import { Sonamu } from "sonamu";`,
    "",
    `console.clear();`,
    `console.log("${fileName}");`,
    "",
    `Sonamu.runScript(async () => {`,
    ` // TODO`,
    `});`,
    "",
  ].join("\n");
}

async function runPractice(name: string) {
  expect(tooling.stub).toBeDefined();
  expect(tooling.stub.practice).toBeTypeOf("function");
  return tooling.stub.practice({ name });
}

async function seedPracticeFiles(fileNames: string[]): Promise<void> {
  await mkdir(practiceDir, { recursive: true });
  await Promise.all(
    fileNames.map((fileName) => writeFile(path.join(practiceDir, fileName), "", "utf8")),
  );
}

beforeEach(async () => {
  const apiRootPath = await attachSonamuTestRoot();
  apiRoot = apiRootPath;
  practiceDir = path.join(apiRootPath, "src", "practices");
});

afterEach(async () => {
  await detachSonamuTestRoot();
});

describe("stub.practice tooling 연산", () => {
  it("practices 디렉터리가 없으면 만들고 첫 번째 파일을 생성한다", async () => {
    await expect(runPractice("hello")).resolves.toMatchObject({
      fileName: "p1-hello.ts",
      path: path.join(practiceDir, "p1-hello.ts"),
    });

    await expect(readFile(path.join(practiceDir, "p1-hello.ts"), "utf8")).resolves.toBe(
      expectedCode("p1-hello.ts"),
    );
  });

  it("기존 practice 파일의 최대 시퀀스 다음 번호를 사용한다", async () => {
    await seedPracticeFiles(["p1-first.ts", "p3-third.ts"]);

    await expect(runPractice("fourth")).resolves.toMatchObject({ fileName: "p4-fourth.ts" });

    await expect(readFile(path.join(practiceDir, "p4-fourth.ts"), "utf8")).resolves.toBe(
      expectedCode("p4-fourth.ts"),
    );
  });

  it("시퀀스 규칙에 맞지 않는 파일은 번호 계산에서 제외한다", async () => {
    await seedPracticeFiles(["p2-second.ts", "p9-ninth.js", "readme.md", "practice.ts"]);

    await expect(runPractice("third")).resolves.toMatchObject({ fileName: "p3-third.ts" });
  });

  it("허용 문자로만 이루어진 이름은 파일명과 경로를 그대로 돌려준다", async () => {
    await expect(runPractice("my.practice-01_v2")).resolves.toEqual({
      fileName: "p1-my.practice-01_v2.ts",
      path: path.join(practiceDir, "p1-my.practice-01_v2.ts"),
    });

    await expect(readFile(path.join(practiceDir, "p1-my.practice-01_v2.ts"), "utf8")).resolves.toBe(
      expectedCode("p1-my.practice-01_v2.ts"),
    );
  });

  // 시퀀스가 double 정밀도 한계까지 커지면 다음 번호가 현재 최댓값과 같아져
  // 계산된 파일명이 이미 존재하는 파일과 충돌합니다. 이때 덮어쓰면 안 됩니다.
  it("계산한 파일명이 이미 있으면 덮어쓰지 않고 PRACTICE_FILE_EXISTS로 거절한다", async () => {
    const collidingFileName = "p10000000000000000000-collide.ts";
    await seedPracticeFiles([]);
    await writeFile(path.join(practiceDir, collidingFileName), "기존 내용", "utf8");

    await expect(runPractice("collide")).rejects.toMatchObject({
      code: "PRACTICE_FILE_EXISTS",
      exitCode: 2,
    });

    await expect(readFile(path.join(practiceDir, collidingFileName), "utf8")).resolves.toBe(
      "기존 내용",
    );
    await expect(readdir(practiceDir)).resolves.toEqual([collidingFileName]);
  });

  it("상위 경로를 노리는 이름은 거절하고 루트 밖 파일을 건드리지 않는다", async () => {
    const victimPath = path.join(apiRoot, "src", "victim.ts");
    await writeFile(victimPath, "피해자 원본", "utf8");
    // p1-../../../victim.ts는 practices 밖(api/src/victim.ts)으로 정규화되는 이름입니다.
    const escapingName = "../../../victim";
    expect(path.resolve(practiceDir, `p1-${escapingName}.ts`)).toBe(victimPath);

    await expect(runPractice(escapingName)).rejects.toMatchObject({
      code: "INVALID_PRACTICE_NAME",
      exitCode: 2,
    });

    await expect(readFile(victimPath, "utf8")).resolves.toBe("피해자 원본");
    // 이름 검증이 파일 시스템 접근보다 먼저이므로 practices 디렉터리도 만들지 않습니다.
    await expect(readdir(practiceDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["큰따옴표가 섞인 이름", 'evil");console.log("'],
    ["경로 구분자가 섞인 이름", "nested/practice"],
    ["역슬래시가 섞인 이름", "escape\\practice"],
    ["점으로 시작하는 이름", "..hidden"],
    ["빈 문자열이 아닌 공백 포함 이름", "two words"],
  ])("%s은 INVALID_PRACTICE_NAME으로 거절하고 아무 파일도 쓰지 않는다", async (_label, name) => {
    await expect(runPractice(name)).rejects.toMatchObject({
      code: "INVALID_PRACTICE_NAME",
      exitCode: 2,
    });

    await expect(readdir(practiceDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("name이 없으면 인자 오류로 실패한다", async () => {
    expect(tooling.stub).toBeDefined();

    await expect(tooling.stub.practice({})).rejects.toMatchObject({
      code: "MISSING_ARGUMENT",
      exitCode: 2,
    });
  });
});
