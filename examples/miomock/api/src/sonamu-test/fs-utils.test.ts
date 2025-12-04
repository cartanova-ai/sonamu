import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock을 hoisted하여 모듈 로드 전에 설정
const { mockAccess, mockMkdir, mockRm, mockReadFile } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockMkdir: vi.fn(),
  mockRm: vi.fn(),
  mockReadFile: vi.fn(),
}));

// node:fs/promises 모듈을 mock (dist 파일은 node:fs/promises를 사용)
vi.mock("node:fs/promises", () => ({
  access: mockAccess,
  mkdir: mockMkdir,
  rm: mockRm,
  readFile: mockReadFile,
}));

// fs 모듈도 mock (constants 사용)
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    constants: {
      F_OK: 0,
      R_OK: 4,
      W_OK: 2,
      X_OK: 1,
    },
  };
});

describe("fs-utils", () => {
  beforeEach(() => {
    // 각 테스트 전에 mock 초기화
    vi.clearAllMocks();
    // 모듈 캐시 초기화
    vi.resetModules();
  });

  describe("기본 존재 여부 체크", () => {
    test.each([
      {
        description: "파일이 존재하는 경우 true 반환",
        mockBehavior: "resolve",
        expected: true,
      },
      {
        description: "파일이 존재하지 않는 경우 false 반환",
        mockBehavior: "reject",
        expected: false,
      },
    ])("$description", async ({ mockBehavior, expected }) => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");

      const testPath = "/some/test/path";

      if (mockBehavior === "resolve") {
        mockAccess.mockResolvedValueOnce(undefined);
      } else {
        mockAccess.mockRejectedValueOnce(
          new Error("ENOENT: 파일이나 디렉토리가 존재하지 않습니다."),
        );
      }

      const result = await exists(testPath);

      expect(result).toBe(expected);
      expect(mockAccess).toHaveBeenCalledWith(testPath, 0); // F_OK = 0
    });
  });

  describe("실제 사용 패턴 테스트", () => {
    test("디렉토리가 없으면 생성하는 패턴", async () => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");
      const { mkdir } = await import("node:fs/promises");

      const dirPath = "/some/new/directory";

      // 디렉토리가 없는 상황 mock
      mockAccess.mockRejectedValueOnce(new Error("ENOENT: 디렉토리가 존재하지 않습니다."));
      mockMkdir.mockResolvedValueOnce(undefined);

      // 실제 사용 패턴 시뮬레이션
      if (!(await exists(dirPath))) {
        await mkdir(dirPath, { recursive: true });
      }

      // exists가 false를 반환했으므로 mkdir가 호출되어야 함
      expect(mockMkdir).toHaveBeenCalledWith(dirPath, { recursive: true });
      expect(mockMkdir).toHaveBeenCalledTimes(1);
    });

    test("디렉토리가 이미 있으면 생성하지 않는 패턴", async () => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");
      const { mkdir } = await import("node:fs/promises");

      const dirPath = "/existing/directory";

      // 디렉토리가 있는 상황 mock
      mockAccess.mockResolvedValueOnce(undefined);

      // 실제 사용 패턴 시뮬레이션
      if (!(await exists(dirPath))) {
        await mkdir(dirPath, { recursive: true });
      }

      // exists가 true를 반환했으므로 mkdir가 호출되지 않아야 함
      expect(mockMkdir).not.toHaveBeenCalled();
    });

    test("파일이 있으면 삭제하는 패턴", async () => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");
      const { rm } = await import("node:fs/promises");

      const filePath = "/some/file/to/delete.txt";

      // 파일이 있는 상황 mock
      mockAccess.mockResolvedValueOnce(undefined);
      mockRm.mockResolvedValueOnce(undefined);

      // 실제 사용 패턴 시뮬레이션
      if (await exists(filePath)) {
        await rm(filePath, { recursive: true, force: true });
      }

      // exists가 true를 반환했으므로 rm이 호출되어야 함
      expect(mockRm).toHaveBeenCalledWith(filePath, { recursive: true, force: true });
      expect(mockRm).toHaveBeenCalledTimes(1);
    });

    test("파일이 없으면 삭제하지 않는 패턴", async () => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");
      const { rm } = await import("node:fs/promises");

      const filePath = "/nonexistent/file.txt";

      // 파일이 없는 상황 mock
      mockAccess.mockRejectedValueOnce(new Error("ENOENT: 파일이 존재하지 않습니다."));

      // 실제 사용 패턴 시뮬레이션
      if (await exists(filePath)) {
        await rm(filePath, { recursive: true, force: true });
      }

      // exists가 false를 반환했으므로 rm이 호출되지 않아야 함
      expect(mockRm).not.toHaveBeenCalled();
    });

    test("파일이 있을 때만 읽는 패턴", async () => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");
      const { readFile } = await import("node:fs/promises");

      const configPath = "/config/app.config.json";
      const mockContent = Buffer.from('{"key": "value"}');

      // 파일이 있는 상황 mock
      mockAccess.mockResolvedValueOnce(undefined);
      mockReadFile.mockResolvedValueOnce(mockContent);

      // 실제 사용 패턴 시뮬레이션
      let content: Buffer | undefined;
      if (await exists(configPath)) {
        content = await readFile(configPath);
      }

      // exists가 true를 반환했으므로 readFile이 호출되어야 함
      expect(mockReadFile).toHaveBeenCalledWith(configPath);
      expect(mockReadFile).toHaveBeenCalledTimes(1);
      expect(content).toBe(mockContent);
    });

    test("파일이 없으면 읽지 않는 패턴", async () => {
      const { exists } = await import("../../../../../modules/sonamu/dist/utils/fs-utils");
      const { readFile } = await import("node:fs/promises");

      const configPath = "/nonexistent/config.json";

      // 파일이 없는 상황 mock
      mockAccess.mockRejectedValueOnce(new Error("ENOENT"));

      // 실제 사용 패턴 시뮬레이션
      let content: Buffer | undefined;
      if (await exists(configPath)) {
        content = await readFile(configPath);
      }

      // exists가 false를 반환했으므로 readFile이 호출되지 않아야 함
      expect(mockReadFile).not.toHaveBeenCalled();
      expect(content).toBeUndefined();
    });
  });
});
