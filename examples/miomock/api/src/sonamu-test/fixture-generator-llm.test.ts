import { DB, type DBPreset, EntityManager } from "sonamu";
import { bootstrap, FixtureGenerator, test } from "sonamu/test";
import { beforeEach, describe, expect, vi } from "vitest";

// ai 패키지의 generateText 모킹
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

bootstrap(vi);

// 모킹된 generateText 함수
let mockGenerateText: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  const ai = await import("ai");
  mockGenerateText = ai.generateText as ReturnType<typeof vi.fn>;
  mockGenerateText.mockClear(); // 각 테스트 전에 mock 초기화

  // 테스트에서 더미 API 키 설정
  process.env.ANTHROPIC_API_KEY = "test-api-key-for-mocking";
});

describe("FixtureGenerator LLM", () => {
  test("API 키 없을 때 fallback 동작", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
    });

    // fixtureHint가 있는 필드를 임시로 추가
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (bioProp) {
      const originalCone = bioProp.cone;
      bioProp.cone = { desc: originalCone?.desc, fixtureHint: "개발자 자기소개" };

      try {
        const overrides = {
          id: 999,
          role: "normal",
          is_verified: true,
          deleted_at: null,
          password: "test123",
        };
        const fixture = await generator.generate("User", overrides);
        // API 키가 없어도 fallback으로 정상 생성되어야 함
        expect(fixture).toBeDefined();
        expect(fixture.bio).toBeDefined();
        // LLM이 호출되지 않았는지 확인
        expect(mockGenerateText).not.toHaveBeenCalled();
      } finally {
        // 복원
        bioProp.cone = originalCone;
      }
    }

    // 환경변수 복원
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test("fixtureHint로 텍스트 생성", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "10년 경력 백엔드 개발자로 TypeScript와 Node.js를 주로 사용합니다.",
      usage: { totalTokens: 50 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
    });

    // bio 필드에 fixtureHint 추가 (테스트용)
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { desc: originalCone?.desc, fixtureHint: "개발자 자기소개" };

    try {
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
      };
      const fixture = await generator.generate("User", overrides);
      expect(fixture.bio).toBe("10년 경력 백엔드 개발자로 TypeScript와 Node.js를 주로 사용합니다.");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    } finally {
      // 복원
      bioProp.cone = originalCone;
    }
  });

  test("우선순위: fixtureGenerator > fixtureHint", async () => {
    // 이전 테스트에서 수정된 상태를 복원
    const userEntity = EntityManager.get("User");
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (bioProp) {
      // bio.cone의 fixtureHint를 제거하여 원래 상태로 복원
      if (bioProp.cone?.fixtureHint) {
        const { fixtureHint, ...rest } = bioProp.cone;
        bioProp.cone = Object.keys(rest).length > 0 ? rest : undefined;
      }
    }

    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
    });

    // fixtureHint가 있는 필드들을 override해서 LLM 호출 방지
    // (id, role, password 등)
    const fixture = await generator.generate("User", {
      id: 999,
      role: "normal",
      is_verified: true,
      deleted_at: null,
      password: "test123",
    });

    // email은 fixtureGenerator가 있음 → LLM 안 씀
    expect(fixture.email).toBeDefined();
    expect(typeof fixture.email).toBe("string");
    expect((fixture.email as string).includes("@")).toBe(true);

    // username도 fixtureGenerator가 있음
    expect(fixture.username).toBeDefined();

    // LLM이 호출되지 않았는지 확인 (모든 필드가 fixtureGenerator 또는 override)
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  test("LLM 캐싱", async () => {
    mockGenerateText.mockResolvedValue({
      text: "캐싱 테스트 데이터",
      usage: { totalTokens: 30 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      enableLLMCache: true,
    });

    // bio 필드에 fixtureHint 추가
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { desc: originalCone?.desc, fixtureHint: "간단한 자기소개" };

    try {
      // 공통 override (fixtureHint만 있는 필드들을 제공)
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
      };

      // 2번 생성
      await generator.generate("User", overrides);
      await generator.generate("User", overrides);

      // LLM은 1번만 호출되어야 함 (캐싱)
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

      // 캐시 통계 확인
      const stats = generator.getLLMCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.enabled).toBe(true);
    } finally {
      bioProp.cone = originalCone;
    }
  });

  test("타입별 파싱 - integer", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "42",
      usage: { totalTokens: 10 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
    });

    // age 필드를 integer로 가정하고 fixtureHint 추가
    const ageProp = userEntity.props.find((p) => p.name === "age" || p.type === "integer");
    if (!ageProp) {
      // age가 없으면 테스트 스킵
      return;
    }

    const originalCone = ageProp.cone;
    ageProp.cone = { ...originalCone, fixtureHint: "성인 나이" };

    try {
      const fixture = await generator.generate("User", {});
      expect(fixture[ageProp.name]).toBe(42);
      expect(typeof fixture[ageProp.name]).toBe("number");
    } finally {
      ageProp.cone = originalCone;
    }
  });

  test("타입별 파싱 - 배열 (integer[])", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "[1, 2, 3]",
      usage: { totalTokens: 15 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
    });

    // integer[] 타입 필드 찾기
    const arrayProp = userEntity.props.find((p) => p.type === "integer[]");
    if (!arrayProp) {
      // 배열 필드가 없으면 테스트 스킵
      return;
    }

    const originalCone = arrayProp.cone;
    arrayProp.cone = { ...originalCone, fixtureHint: "정수 배열" };

    try {
      const fixture = await generator.generate("User", {});
      const value = fixture[arrayProp.name];
      expect(Array.isArray(value)).toBe(true);
      expect((value as number[]).length).toBe(3);
      expect((value as number[])[0]).toBe(1);
    } finally {
      arrayProp.cone = originalCone;
    }
  });

  test("LLM 실패시 fallback", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("LLM API Error"));

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
    });

    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { desc: originalCone?.desc, fixtureHint: "자기소개" };

    try {
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
      };
      // LLM 실패해도 에러 없이 fallback으로 진행되어야 함
      const fixture = await generator.generate("User", overrides);
      expect(fixture.bio).toBeDefined();
      // fixtureDefault나 기본값이 들어가야 함
    } finally {
      bioProp.cone = originalCone;
    }
  });

  test("캐시 초기화", async () => {
    mockGenerateText.mockResolvedValue({
      text: "테스트 데이터",
      usage: { totalTokens: 20 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture" as DBPreset);
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      enableLLMCache: true,
    });

    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { desc: originalCone?.desc, fixtureHint: "자기소개" };

    try {
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
      };

      // 첫 번째 생성
      await generator.generate("User", overrides);
      expect(generator.getLLMCacheStats().size).toBeGreaterThan(0);

      // 캐시 초기화
      generator.clearLLMCache();
      expect(generator.getLLMCacheStats().size).toBe(0);

      // 두 번째 생성 - LLM 다시 호출되어야 함
      await generator.generate("User", overrides);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    } finally {
      bioProp.cone = originalCone;
    }
  });
});
