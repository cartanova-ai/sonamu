import { type Cone, DB, EntityManager } from "sonamu";
import { bootstrap, FixtureGenerator, type FixtureTextGenerator, test } from "sonamu/test";
import { afterAll, beforeAll, beforeEach, describe, expect, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

// 테스트용 generateText 함수
const mockGenerateText = vi.fn<FixtureTextGenerator>();

beforeEach(() => {
  mockGenerateText.mockReset(); // 각 테스트 전에 mock 완전 초기화 (once 큐 포함)

  // 테스트에서 더미 API 키 설정
  process.env.ANTHROPIC_API_KEY = "test-api-key-for-mocking";
});

describe("FixtureGenerator LLM", () => {
  // User 엔티티의 bio 필드 원본 cone을 저장하여 모든 테스트 후 복원
  let savedOriginalCone: Cone | undefined;

  beforeAll(() => {
    const userEntity = EntityManager.get("User");
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (bioProp) {
      savedOriginalCone = bioProp.cone;
      // 모든 테스트에서 사용할 cone.note 설정 (entity 캐싱으로 모든 테스트가 이를 공유)
      bioProp.cone = { note: "자기소개" };
    }
  });

  afterAll(() => {
    // 모든 테스트 완료 후 원본 cone 복원
    const userEntity = EntityManager.get("User");
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (bioProp) {
      bioProp.cone = savedOriginalCone;
    }
  });

  test("API 키 없을 때 fallback 동작", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
    });

    // note가 있는 필드를 임시로 추가
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (bioProp) {
      const originalCone = bioProp.cone;
      bioProp.cone = { note: "개발자 자기소개" };

      try {
        const overrides = {
          id: 999,
          role: "normal",
          is_verified: true,
          deleted_at: null,
          password: "test123",
          created_at: new Date(),
          birth_date: new Date("1990-01-01"),
          last_login_at: new Date(),
          updated_at: new Date(),
          two_factor_enabled: false,
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

  test("note로 텍스트 생성", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: '{"bio": "10년 경력 백엔드 개발자로 TypeScript와 Node.js를 주로 사용합니다."}',
      usage: { totalTokens: 50 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
    });

    // bio 필드에 note 추가 (테스트용)
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { note: "개발자 자기소개" };

    try {
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
        created_at: new Date(),
        birth_date: new Date("1990-01-01"),
        last_login_at: new Date(),
        updated_at: new Date(),
        two_factor_enabled: false,
        email: "test@test.com",
        username: "테스트",
        image: null,
      };
      const fixture = await generator.generate("User", overrides);
      expect(fixture.bio).toBe("10년 경력 백엔드 개발자로 TypeScript와 Node.js를 주로 사용합니다.");
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    } finally {
      // 복원
      bioProp.cone = originalCone;
    }
  });

  test("우선순위: fixtureGenerator > note", async () => {
    // 이전 테스트에서 수정된 상태를 복원
    const userEntity = EntityManager.get("User");
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (bioProp) {
      // bio.cone의 note를 제거하여 원래 상태로 복원
      if (bioProp.cone?.note) {
        const { note: _note, ...rest } = bioProp.cone;
        bioProp.cone = Object.keys(rest).length > 0 ? rest : undefined;
      }
    }

    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
    });

    // note가 있는 필드들을 override해서 LLM 호출 방지
    // (id, role, password 등)
    const fixture = await generator.generate("User", {
      id: 999,
      role: "normal",
      is_verified: true,
      deleted_at: null,
      password: "test123",
      created_at: new Date(),
      birth_date: new Date("1990-01-01"),
      last_login_at: new Date(),
      updated_at: new Date(),
      two_factor_enabled: false,
      email: "test@test.com",
      username: "테스트",
      image: null,
    });

    // email은 fixtureGenerator가 있음 → LLM 안 씀
    expect(fixture.email).toBeDefined();
    const email = z.string().parse(fixture.email);
    expect(email.includes("@")).toBe(true);

    // username도 fixtureGenerator가 있음
    expect(fixture.username).toBeDefined();

    // LLM이 호출되지 않았는지 확인 (모든 필드가 fixtureGenerator 또는 override로 처리됨)
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  test("LLM 캐싱", async () => {
    mockGenerateText.mockResolvedValue({
      text: '{"bio": "캐싱 테스트 데이터"}',
      usage: { totalTokens: 30 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
      enableLLMCache: true,
    });

    // bio 필드에 note 추가
    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { note: "간단한 자기소개" };

    try {
      // 공통 override (fixtureHint만 있는 필드들을 제공)
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
        created_at: new Date(),
        birth_date: new Date("1990-01-01"),
        last_login_at: new Date(),
        updated_at: new Date(),
        two_factor_enabled: false,
        email: "test@test.com",
        username: "테스트",
        image: null,
      };

      // 2번 생성
      await generator.generate("User", overrides);
      await generator.generate("User", overrides);

      // row 단위 생성 방식: 각 generate() 호출마다 새 rowKey가 생성되므로 2번 호출됨
      expect(mockGenerateText).toHaveBeenCalledTimes(2);

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
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
    });

    // age 필드를 integer로 가정하고 fixtureHint 추가
    const ageProp = userEntity.props.find((p) => p.name === "age" || p.type === "integer");
    if (!ageProp) {
      // age가 없으면 테스트 스킵
      return;
    }

    const originalCone = ageProp.cone;
    ageProp.cone = { ...originalCone, scale: "성인 나이" };

    try {
      const fixture = await generator.generate("User", {});
      expect(fixture[ageProp.name]).toBe(42);
      z.number().parse(fixture[ageProp.name]);
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
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
    });

    // integer[] 타입 필드 찾기
    const arrayProp = userEntity.props.find((p) => p.type === "integer[]");
    if (!arrayProp) {
      // 배열 필드가 없으면 테스트 스킵
      return;
    }

    const originalCone = arrayProp.cone;
    arrayProp.cone = { ...originalCone, scale: "정수 배열" };

    try {
      const fixture = await generator.generate("User", {});
      const value = z.array(z.number()).parse(fixture[arrayProp.name]);
      expect(value).toHaveLength(3);
      expect(value[0]).toBe(1);
    } finally {
      arrayProp.cone = originalCone;
    }
  });

  test("LLM 실패시 fallback", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("LLM API Error"));

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
    });

    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { note: "자기소개" };

    try {
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
        created_at: new Date(),
        birth_date: new Date("1990-01-01"),
        last_login_at: new Date(),
        updated_at: new Date(),
        two_factor_enabled: false,
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
    // 이전 테스트의 mock 설정 완전히 초기화 (mockClear는 호출 기록만 지우고 설정은 남음)
    mockGenerateText.mockReset();
    mockGenerateText.mockResolvedValue({
      text: '{"bio": "테스트 데이터"}',
      usage: { totalTokens: 20 },
    });

    const userEntity = EntityManager.get("User");
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");

    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager, {
      useLLM: true,
      generateText: mockGenerateText,
      enableLLMCache: true,
    });

    const bioProp = userEntity.props.find((p) => p.name === "bio");
    if (!bioProp) {
      throw new Error("bio 필드를 찾을 수 없습니다");
    }

    const originalCone = bioProp.cone;
    bioProp.cone = { note: "자기소개" };

    try {
      const overrides = {
        id: 999,
        role: "normal",
        is_verified: true,
        deleted_at: null,
        password: "test123",
        created_at: new Date(),
        birth_date: new Date("1990-01-01"),
        last_login_at: new Date(),
        updated_at: new Date(),
        two_factor_enabled: false,
        email: "test@test.com",
        username: "테스트",
        image: null,
      };

      // 첫 번째 생성
      await generator.generate("User", overrides);
      // cache.size 대신 mock 호출 여부로 확인 (entity cone 상태에 더 견고)
      expect(mockGenerateText).toHaveBeenCalledTimes(1);

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

describe("executeGenerator 인자 파싱", () => {
  test("객체 인자: faker.number.int({ min: 1000, max: 9999 })", async () => {
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");
    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager);

    const employeeEntity = EntityManager.get("Employee");
    const salaryProp = employeeEntity.props.find((p) => p.name === "salary");
    if (!salaryProp) throw new Error("salary 필드를 찾을 수 없습니다");

    const originalCone = salaryProp.cone;
    salaryProp.cone = {
      ...originalCone,
      fixtureGenerator: "faker.number.int({ min: 1000, max: 9999 })",
    };

    try {
      const fixture = await generator.generate("Employee", {
        id: 999,
        employee_number: "12345678",
        user_id: "test-user-id",
      });
      const salary = z.number().parse(fixture.salary);
      expect(salary).toBeGreaterThanOrEqual(1000);
      expect(salary).toBeLessThanOrEqual(9999);
    } finally {
      salaryProp.cone = originalCone;
    }
  });

  test("배열 내 single-quote 문자열: faker.helpers.arrayElement(['a', 'b', 'c'])", async () => {
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");
    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager);

    const userEntity = EntityManager.get("User");
    const roleProp = userEntity.props.find((p) => p.name === "role");
    if (!roleProp) throw new Error("role 필드를 찾을 수 없습니다");

    const originalCone = roleProp.cone;
    roleProp.cone = {
      ...originalCone,
      fixtureGenerator: "faker.helpers.arrayElement(['a', 'b', 'c'])",
    };

    try {
      const fixture = await generator.generate("User", {
        id: 999,
        is_verified: true,
        deleted_at: null,
        password: "test123",
        created_at: new Date(),
        birth_date: new Date("1990-01-01"),
        last_login_at: new Date(),
        updated_at: new Date(),
        two_factor_enabled: false,
      });
      expect(["a", "b", "c"]).toContain(fixture.role);
    } finally {
      roleProp.cone = originalCone;
    }
  });

  test("객체 배열 (weighted): faker.helpers.weightedArrayElement", async () => {
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");
    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager);

    const userEntity = EntityManager.get("User");
    const roleProp = userEntity.props.find((p) => p.name === "role");
    if (!roleProp) throw new Error("role 필드를 찾을 수 없습니다");

    const originalCone = roleProp.cone;
    roleProp.cone = {
      ...originalCone,
      fixtureGenerator:
        "faker.helpers.weightedArrayElement([{ weight: 8, value: 'normal' }, { weight: 2, value: 'admin' }])",
    };

    try {
      const fixture = await generator.generate("User", {
        id: 999,
        is_verified: true,
        deleted_at: null,
        password: "test123",
        created_at: new Date(),
        birth_date: new Date("1990-01-01"),
        last_login_at: new Date(),
        updated_at: new Date(),
        two_factor_enabled: false,
      });
      expect(["normal", "admin"]).toContain(fixture.role);
    } finally {
      roleProp.cone = originalCone;
    }
  });

  test("날짜 객체 인자: faker.date.past({ years: 5 })", async () => {
    const sourceDb = DB.getDB("fixture");
    const targetDb = DB.testTransaction || DB.getDB("w");
    const generator = new FixtureGenerator(sourceDb, targetDb, "test", EntityManager);

    const employeeEntity = EntityManager.get("Employee");
    const hireDateProp = employeeEntity.props.find((p) => p.name === "hire_date");
    if (!hireDateProp) throw new Error("hire_date 필드를 찾을 수 없습니다");

    const fixture = await generator.generate("Employee", {
      id: 999,
      employee_number: "12345678",
      user_id: "test-user-id",
    });
    // hire_date는 이미 faker.date.past({ years: 5 })를 fixtureGenerator로 가짐
    expect(fixture.hire_date).toBeInstanceOf(Date);
  });
});
