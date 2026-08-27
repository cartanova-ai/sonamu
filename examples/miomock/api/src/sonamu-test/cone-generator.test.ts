import { type Cone } from "sonamu";
import { BaseModel, EntityManager } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { afterAll, beforeEach, describe, expect, vi } from "vitest";

bootstrap(vi);

type ConeTextGenerator = NonNullable<
  NonNullable<Parameters<ReturnType<typeof EntityManager.get>["generateCones"]>[0]>["generateText"]
>;

// 테스트용 generateText 함수
const mockGenerateText = vi.fn<ConeTextGenerator>();

beforeEach(() => {
  mockGenerateText.mockReset();

  // 테스트에서 더미 API 키 설정 (실제 호출은 모킹되므로 유효하지 않아도 됨)
  process.env.ANTHROPIC_API_KEY = "test-api-key-for-mocking";
});

// 모든 테스트 후 시퀀스 리셋
afterAll(async () => {
  const wdb = BaseModel.getDB("w");
  const entities = EntityManager.getAllEntities();

  for (const entity of entities) {
    const tableName = entity.table || entity.id.toLowerCase();

    // id 필드의 타입을 확인합니다
    const idProp = entity.props.find((p) => p.name === "id");
    const idType = idProp?.type;

    // integer나 bigInteger가 아닌 경우 sequence reset을 스킵합니다 (text, uuid 등)
    if (!idType || (idType !== "integer" && idType !== "bigInteger")) {
      console.log(`Skipping sequence reset for ${tableName} (id type: ${idType || "unknown"})`);
      continue;
    }

    // PostgreSQL 시퀀스를 현재 테이블의 MAX(id)로 리셋
    await wdb.raw(`
      SELECT setval(
        pg_get_serial_sequence('public.${tableName}', 'id'),
        COALESCE((SELECT MAX(id) FROM ${tableName}), 1)
      )
    `);
  }
});

describe("Cone Generator", () => {
  test("API 키 없을 때 에러 발생", async () => {
    // API 키 환경변수 제거
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const userEntity = EntityManager.get("User");

    await expect(
      userEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
        generateText: mockGenerateText,
        persist: false,
      }),
    ).rejects.toThrow("ANTHROPIC_API_KEY not found");

    // 환경변수 복원
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test("User entity cone 생성 (모킹)", async () => {
    const userEntity = EntityManager.get("User");

    // 기존 cone 백업
    const originalCone = userEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of userEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    // LLM 응답을 JSON으로 감싼 형태로 모킹
    const mockLLMResponse = JSON.stringify({
      entityCone: {
        desc: "사용자 관리",
        note: "시스템 사용자 정보",
      },
      propCones: {
        email: {
          desc: "이메일 주소",
          fixtureGenerator: "faker.internet.email()",
        },
        username: {
          desc: "사용자명",
          fixtureGenerator: "fakerKO.person.fullName()",
        },
        role: {
          desc: "사용자 역할",
          fixtureGenerator: "faker.helpers.arrayElement(['admin', 'user', 'guest'])",
        },
      },
      subsetCones: {},
      enumCones: {},
    });

    // generateText 모킹
    mockGenerateText.mockResolvedValueOnce({
      text: mockLLMResponse,
      usage: { totalTokens: 1500 },
    });

    try {
      // Cone 생성
      const result = await userEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
        generateText: mockGenerateText,
        persist: false,
      });

      // 결과 검증
      expect(result).toBeDefined();
      expect(result.propCones).toBeDefined();

      // email 필드 cone 확인
      const emailCone = result.propCones.email;
      expect(emailCone).toBeDefined();
      expect(emailCone?.desc).toBeDefined();
      expect(emailCone?.fixtureGenerator).toContain("faker");

      // 토큰 사용량 확인
      expect(result.tokensUsed).toBeGreaterThanOrEqual(0);

      console.log("Cone generation test passed");
      console.log("Generated cones for props:", Object.keys(result.propCones).slice(0, 5));
    } finally {
      // cone 복원 (entity.json 변경 방지)
      userEntity.cone = originalCone;
      for (const prop of userEntity.props) {
        if (originalPropCones[prop.name]) {
          prop.cone = originalPropCones[prop.name];
        } else {
          delete prop.cone;
        }
      }
    }
  });

  test("기존 cone 보존 테스트", async () => {
    const userEntity = EntityManager.get("User");

    // collectExistingCones 메서드 테스트
    const existingCones = userEntity.collectExistingCones();

    // User entity는 이미 cone이 있으므로 수집되어야 함
    expect(existingCones).toBeDefined();

    // entity cone이 있으면 수집되어야 함
    if (userEntity.cone) {
      const entityKey = `entity:${userEntity.id}`;
      expect(existingCones[entityKey]).toBeDefined();
    }

    // prop cone이 있으면 수집되어야 함
    for (const prop of userEntity.props) {
      if (prop.cone) {
        const propKey = `prop:${prop.name}`;
        expect(existingCones[propKey]).toBeDefined();
      }
    }
  });

  test("applyCones 메서드 테스트", () => {
    const userEntity = EntityManager.get("User");

    // 테스트용 cone 결과
    const testResult = {
      entityCone: {
        desc: "테스트 엔티티",
        note: "테스트용 노트",
      },
      propCones: {
        email: {
          desc: "이메일",
          fixtureGenerator: "faker.internet.email()",
        },
      },
      subsetCones: {},
      enumCones: {},
      tokensUsed: 100,
    };

    // 백업
    const originalEntityCone = userEntity.cone;
    const originalEmailCone = userEntity.props.find((p) => p.name === "email")?.cone;

    try {
      // applyCones 테스트
      userEntity.applyCones(testResult);

      // 검증
      expect(userEntity.cone).toEqual(testResult.entityCone);

      const emailProp = userEntity.props.find((p) => p.name === "email");
      expect(emailProp?.cone).toEqual(testResult.propCones.email);
    } finally {
      // 복원
      userEntity.cone = originalEntityCone;
      const emailProp = userEntity.props.find((p) => p.name === "email");
      if (emailProp) {
        emailProp.cone = originalEmailCone;
      }
    }
  });

  test("관계 필드 테스트 - BelongsToOne dataSource 자동 설정 (모킹)", async () => {
    const employeeEntity = EntityManager.get("Employee");

    const originalCone = employeeEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of employeeEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    // LLM 응답 모킹 - BelongsToOne 관계 필드 포함
    const mockLLMResponse = JSON.stringify({
      entityCone: {
        desc: "직원 정보",
        note: "회사 직원 관리",
      },
      propCones: {
        department: {
          desc: "소속 부서",
          fixtureHint: "최근 생성된 부서 중에서 랜덤하게 선택",
          dataSource: {
            strategy: "recent",
            limit: 10,
          },
        },
        employee_number: {
          desc: "사번",
          fixtureGenerator: "faker.string.numeric(8)",
        },
      },
      subsetCones: {},
      enumCones: {},
    });

    mockGenerateText.mockResolvedValueOnce({
      text: mockLLMResponse,
      usage: { totalTokens: 1200 },
    });

    try {
      const result = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
        generateText: mockGenerateText,
        persist: false,
      });

      // department 필드 (BelongsToOne)에 dataSource가 자동 설정되었는지 확인
      const deptCone = result.propCones.department;
      expect(deptCone).toBeDefined();
      expect(deptCone?.dataSource).toBeDefined();
      expect(deptCone?.dataSource?.strategy).toBe("recent");
      expect(deptCone?.fixtureHint).toBeDefined();

      console.log("관계 필드 테스트 통과");
      console.log("department cone:", deptCone);
    } finally {
      employeeEntity.cone = originalCone;
      for (const prop of employeeEntity.props) {
        if (originalPropCones[prop.name]) {
          prop.cone = originalPropCones[prop.name];
        } else {
          delete prop.cone;
        }
      }
    }
  });

  test("한국어 필드명 테스트 - 적절한 faker 생성 확인 (모킹)", async () => {
    const employeeEntity = EntityManager.get("Employee");

    const originalCone = employeeEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of employeeEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    // LLM 응답 모킹 - 한국어 desc와 적절한 faker 표현식
    const mockLLMResponse = JSON.stringify({
      entityCone: {
        desc: "직원 정보",
        note: "회사 직원 관리",
      },
      propCones: {
        employee_number: {
          desc: "사번",
          fixtureGenerator: "faker.string.numeric(8)",
        },
        hire_date: {
          desc: "입사일",
          fixtureGenerator: "faker.date.past()",
        },
      },
      subsetCones: {},
      enumCones: {},
    });

    mockGenerateText.mockResolvedValueOnce({
      text: mockLLMResponse,
      usage: { totalTokens: 1000 },
    });

    try {
      const result = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
        generateText: mockGenerateText,
        persist: false,
      });

      // "사번" 필드 - 한국어 desc 확인
      const empNumberCone = result.propCones.employee_number;
      expect(empNumberCone).toBeDefined();
      expect(empNumberCone?.desc).toBeDefined();

      // "입사일" 필드 - date faker 생성 확인
      const hireDateCone = result.propCones.hire_date;
      expect(hireDateCone).toBeDefined();
      expect(hireDateCone?.fixtureGenerator).toBeDefined();

      console.log("한국어 필드명 테스트 통과");
      console.log("employee_number cone:", empNumberCone);
      console.log("hire_date cone:", hireDateCone);
    } finally {
      employeeEntity.cone = originalCone;
      for (const prop of employeeEntity.props) {
        if (originalPropCones[prop.name]) {
          prop.cone = originalPropCones[prop.name];
        } else {
          delete prop.cone;
        }
      }
    }
  });

  test("Locale 변경 테스트 - ko/en/ja 언어별 desc 생성 (모킹)", async () => {
    const employeeEntity = EntityManager.get("Employee");

    const originalCone = employeeEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of employeeEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    // 한국어 LLM 응답
    const mockLLMResponseKo = JSON.stringify({
      entityCone: { desc: "직원 정보", note: "회사 직원 관리" },
      propCones: {
        employee_number: {
          desc: "사번",
          fixtureGenerator: "faker.string.numeric(8)",
        },
      },
      subsetCones: {},
      enumCones: {},
    });

    // 영어 LLM 응답
    const mockLLMResponseEn = JSON.stringify({
      entityCone: { desc: "Employee Information", note: "Company employee management" },
      propCones: {
        employee_number: {
          desc: "Employee Number",
          fixtureGenerator: "faker.string.numeric(8)",
        },
      },
      subsetCones: {},
      enumCones: {},
    });

    // 일본어 LLM 응답
    const mockLLMResponseJa = JSON.stringify({
      entityCone: { desc: "社員情報", note: "会社の社員管理" },
      propCones: {
        employee_number: {
          desc: "社員番号",
          fixtureGenerator: "faker.string.numeric(8)",
        },
      },
      subsetCones: {},
      enumCones: {},
    });

    // 3번의 호출에 대한 모킹 설정
    mockGenerateText
      .mockResolvedValueOnce({
        text: mockLLMResponseKo,
        usage: { totalTokens: 1000 },
      })
      .mockResolvedValueOnce({
        text: mockLLMResponseEn,
        usage: { totalTokens: 1000 },
      })
      .mockResolvedValueOnce({
        text: mockLLMResponseJa,
        usage: { totalTokens: 1000 },
      });

    try {
      // 한국어
      const resultKo = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
        generateText: mockGenerateText,
        persist: false,
      });

      // 영어
      const resultEn = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "en",
        generateText: mockGenerateText,
        persist: false,
      });

      // 일본어
      const resultJa = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ja",
        generateText: mockGenerateText,
        persist: false,
      });

      // employee_number 필드의 desc가 각 언어별로 다른지 확인
      const koDesc = resultKo.propCones.employee_number?.desc;
      const enDesc = resultEn.propCones.employee_number?.desc;
      const jaDesc = resultJa.propCones.employee_number?.desc;

      expect(koDesc).toBeDefined();
      expect(enDesc).toBeDefined();
      expect(jaDesc).toBeDefined();

      // 각 언어별로 다른 desc가 생성되어야 함
      expect(koDesc).not.toBe(enDesc);
      expect(enDesc).not.toBe(jaDesc);
      expect(koDesc).not.toBe(jaDesc);

      console.log("Locale 변경 테스트 통과");
      console.log("ko desc:", koDesc);
      console.log("en desc:", enDesc);
      console.log("ja desc:", jaDesc);
    } finally {
      employeeEntity.cone = originalCone;
      for (const prop of employeeEntity.props) {
        if (originalPropCones[prop.name]) {
          prop.cone = originalPropCones[prop.name];
        } else {
          delete prop.cone;
        }
      }
    }
  });
});
