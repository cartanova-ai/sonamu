import { constants } from "node:fs";
import * as defaultFs from "node:fs/promises";
import path from "node:path";

type CddFileSystem = Pick<typeof defaultFs, "lstat" | "mkdir" | "open" | "opendir" | "realpath">;

function invalidCddPath(relativePath: string, cause?: unknown): Error {
  return Object.assign(new Error(`CDD 경로가 contract 밖을 참조합니다: ${relativePath}`), {
    code: "INVALID_CDD_PATH",
    cause,
  });
}

function isWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function nearestExistingPath(fs: CddFileSystem, target: string): Promise<string> {
  let candidate = target;
  while (true) {
    try {
      await fs.lstat(candidate);
      return candidate;
    } catch (error) {
      // SAFETY: node:fs lstat 실패의 code만 읽어 경로 부재를 구분합니다.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(candidate);
      if (parent === candidate) throw error;
      candidate = parent;
    }
  }
}

function createCddFileOperation({
  contractRoot,
  fs = defaultFs,
}: {
  contractRoot: string;
  fs?: CddFileSystem;
}) {
  async function resolveBoundary(relativePath: string) {
    const [canonicalRoot, configuredRoot] = await Promise.all([
      fs.realpath(contractRoot),
      Promise.resolve(path.resolve(contractRoot)),
    ]);
    const target = path.resolve(configuredRoot, relativePath);
    if (!isWithin(configuredRoot, target)) throw invalidCddPath(relativePath);
    return { canonicalRoot, target };
  }

  async function assertCanonicalPath(
    canonicalRoot: string,
    target: string,
    relativePath: string,
  ): Promise<string> {
    const canonicalTarget = await fs.realpath(target);
    if (!isWithin(canonicalRoot, canonicalTarget)) throw invalidCddPath(relativePath);
    return canonicalTarget;
  }

  return {
    async readDirectory(relativePath: string) {
      const { canonicalRoot, target } = await resolveBoundary(relativePath);
      const canonicalTarget = await assertCanonicalPath(canonicalRoot, target, relativePath);
      let directory;
      try {
        directory = await fs.opendir(target);
        const recheckedTarget = await assertCanonicalPath(canonicalRoot, target, relativePath);
        if (recheckedTarget !== canonicalTarget) throw invalidCddPath(relativePath);
        const entries = [];
        while (true) {
          const entry = await directory.read();
          if (entry === null) return entries;
          entries.push(entry);
        }
      } finally {
        await directory?.close();
      }
    },
    async read(relativePath: string): Promise<string> {
      const { canonicalRoot, target } = await resolveBoundary(relativePath);
      const canonicalTarget = await assertCanonicalPath(canonicalRoot, target, relativePath);
      let handle;
      try {
        // 최종 symlink를 따라가지 않은 descriptor를 연 뒤 실제 경로를 다시 확인합니다.
        handle = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        const recheckedTarget = await assertCanonicalPath(canonicalRoot, target, relativePath);
        if (recheckedTarget !== canonicalTarget) throw invalidCddPath(relativePath);
        return await handle.readFile("utf8");
      } catch (error) {
        // SAFETY: node:fs open 실패의 code만 읽어 symlink 거부를 정규화합니다.
        if ((error as NodeJS.ErrnoException).code === "ELOOP") {
          throw invalidCddPath(relativePath, error);
        }
        throw error;
      } finally {
        await handle?.close();
      }
    },

    async write(relativePath: string, contents: string): Promise<void> {
      const { canonicalRoot, target } = await resolveBoundary(relativePath);
      const existing = await nearestExistingPath(fs, target);
      const canonicalExisting = await assertCanonicalPath(canonicalRoot, existing, relativePath);
      const targetExists = existing === target;

      if (!targetExists) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await assertCanonicalPath(canonicalRoot, path.dirname(target), relativePath);
      }

      let handle;
      try {
        // 검증 전 truncate를 피하고 새 파일은 배타적으로 생성합니다.
        const flags = targetExists
          ? constants.O_WRONLY | constants.O_NOFOLLOW
          : constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW;
        handle = await fs.open(target, flags, 0o666);
        const canonicalTarget = await assertCanonicalPath(canonicalRoot, target, relativePath);
        if (
          !isWithin(canonicalRoot, canonicalTarget) ||
          (targetExists && canonicalTarget !== canonicalExisting)
        ) {
          throw invalidCddPath(relativePath);
        }
        await handle.truncate(0);
        await handle.writeFile(contents, "utf8");
      } catch (error) {
        // SAFETY: node:fs open 실패의 code만 읽어 symlink 거부를 정규화합니다.
        if ((error as NodeJS.ErrnoException).code === "ELOOP") {
          throw invalidCddPath(relativePath, error);
        }
        throw error;
      } finally {
        await handle?.close();
      }
    },
  };
}

type CddRuleDocument = {
  description?: string;
  rules?: Array<{ id: string; when: string; instruction: string; examples?: string[] }>;
};

function parseCddRules(contents: string): CddRuleDocument {
  try {
    // SAFETY: CDD 규칙 소비 지점은 선택 필드만 읽고 배열 부재를 기본값으로 처리합니다.
    return JSON.parse(contents) as CddRuleDocument;
  } catch (cause) {
    throw Object.assign(new Error("CDD rules JSON is malformed"), {
      code: "INVALID_CDD_RULES",
      exitCode: 2,
      cause,
    });
  }
}

export function createDefaultCddToolingAdapter({
  contractRoot,
  fs = defaultFs,
}: {
  contractRoot: string;
  fs?: CddFileSystem;
}) {
  const files = createCddFileOperation({ contractRoot, fs });

  return {
    async read(input: { path: string }) {
      return { content: await files.read(input.path), fileType: "contract" as const };
    },
    async rules() {
      let entries;
      try {
        entries = await files.readDirectory("rules");
      } catch (error) {
        // SAFETY: node:fs 디렉터리 조회 실패의 code만 읽어 규칙 디렉터리 부재를 구분합니다.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rules: [] };
        throw error;
      }

      const rules = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".rules.json")) continue;
        const key = entry.name.replace(/\.rules\.json$/, "");
        const relativePath = `rules/${entry.name}`;
        const document = parseCddRules(await files.read(relativePath));
        rules.push({
          key,
          path: relativePath,
          description: document.description ?? "",
          ruleCount: document.rules?.length ?? 0,
        });
      }
      return { rules };
    },
    async showRule(input: { ruleId: string }) {
      const relativePath = `rules/${input.ruleId}.rules.json`;
      return {
        key: input.ruleId,
        path: relativePath,
        ...parseCddRules(await files.read(relativePath)),
      };
    },
    async addRule(input: {
      ruleKey: string;
      id: string;
      when: string;
      text: string;
      examples?: string[];
      dryRun: boolean;
    }) {
      const rule = { ruleKey: input.ruleKey, id: input.id, when: input.when, text: input.text };
      if (input.dryRun) return { dryRun: true as const, rule };

      const relativePath = `rules/${input.ruleKey}.rules.json`;
      const document = parseCddRules(await files.read(relativePath));
      document.rules ??= [];
      document.rules.push({
        id: input.id,
        when: input.when,
        instruction: input.text,
        examples: input.examples ?? [],
      });
      await files.write(relativePath, `${JSON.stringify(document, null, 2)}\n`);
      return { key: input.ruleKey, path: relativePath, ...document };
    },
    async addAcceptanceCriterion(input: { document: string; text: string; dryRun: boolean }) {
      if (input.dryRun)
        return { operation: "addAcceptanceCriterion" as const, input, dryRun: true };
      const contents = await files.read(input.document);
      await files.write(input.document, `${contents}\n- ${input.text}\n`);
      return { document: input.document, text: input.text, applied: true as const };
    },
  };
}
