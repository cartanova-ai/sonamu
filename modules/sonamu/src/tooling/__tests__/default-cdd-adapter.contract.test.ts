import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createDefaultCddToolingAdapter } from "../cdd-service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sonamu-default-cdd-"));
  temporaryDirectories.push(workspace);
  const contractRoot = path.join(workspace, "contract");
  const outsideRoot = path.join(workspace, "outside");
  await Promise.all([fs.mkdir(contractRoot), fs.mkdir(outsideRoot)]);
  return { contractRoot, outsideRoot };
}

describe("기본 CDD tooling adapter", () => {
  it("주입한 root와 fs로 내부 일반 파일을 읽고 수정한다", async () => {
    const { contractRoot } = await createFixture();
    const document = path.join(contractRoot, "order.contract.md");
    await fs.writeFile(document, "# 주문\n", "utf8");
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.read({ path: "order.contract.md" })).resolves.toEqual({
      content: "# 주문\n",
      fileType: "contract",
    });
    await adapter.addAcceptanceCriterion({
      document: "order.contract.md",
      text: "승인된 주문만 처리한다",
      dryRun: false,
    });
    await expect(fs.readFile(document, "utf8")).resolves.toContain("승인된 주문만 처리한다");
  });

  it("외부 파일 symlink 읽기를 기본 adapter 경로에서도 거절한다", async () => {
    const { contractRoot, outsideRoot } = await createFixture();
    const outside = path.join(outsideRoot, "secret.contract.md");
    await fs.writeFile(outside, "외부 비밀", "utf8");
    await fs.symlink(outside, path.join(contractRoot, "linked.contract.md"));
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(adapter.read({ path: "linked.contract.md" })).rejects.toMatchObject({
      code: "INVALID_CDD_PATH",
    });
  });

  it("외부 파일 symlink 쓰기를 거절하고 원본을 보존한다", async () => {
    const { contractRoot, outsideRoot } = await createFixture();
    const outside = path.join(outsideRoot, "protected.contract.md");
    await fs.writeFile(outside, "보존할 내용\n", "utf8");
    await fs.symlink(outside, path.join(contractRoot, "linked.contract.md"));
    const adapter = createDefaultCddToolingAdapter({ contractRoot, fs });

    await expect(
      adapter.addAcceptanceCriterion({
        document: "linked.contract.md",
        text: "변조",
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CDD_PATH" });
    await expect(fs.readFile(outside, "utf8")).resolves.toBe("보존할 내용\n");
  });
});
