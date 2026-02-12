import type { Cone } from "sonamu";
import { EntityManager } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { describe, expect, vi } from "vitest";

bootstrap(vi);

// Entity private 메서드 접근을 위한 타입
type EntityWithPrivateMethods = {
  collectExistingCones(): Record<string, Cone>;
  applyCones(result: {
    entityCone?: Cone;
    propCones: Record<string, Cone>;
    subsetCones: Record<string, Cone>;
    enumCones: Record<string, Cone>;
    tokensUsed: number;
  }): void;
};

// Prop cone 접근을 위한 타입
type PropWithCone = {
  cone?: Cone;
};

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
      }),
    ).rejects.toThrow("ANTHROPIC_API_KEY not found");

    // 환경변수 복원
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  test.skip("User entity cone 생성 (API 키 필요)", async () => {
    // 이 테스트는 ANTHROPIC_API_KEY가 설정되어 있을 때만 실행됩니다
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("ANTHROPIC_API_KEY not set, skipping LLM test");
      return;
    }

    const userEntity = EntityManager.get("User");

    // 기존 cone 백업
    const originalCone = userEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of userEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    try {
      // Cone 생성
      const result = await userEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
      });

      // 결과 검증
      expect(result).toBeDefined();
      expect(result.propCones).toBeDefined();
      expect(typeof result.propCones).toBe("object");

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
          (prop as unknown as PropWithCone).cone = originalPropCones[prop.name];
        } else {
          delete (prop as unknown as PropWithCone).cone;
        }
      }
    }
  });

  test("기존 cone 보존 테스트", async () => {
    const userEntity = EntityManager.get("User");

    // collectExistingCones 메서드 테스트
    const existingCones = (
      userEntity as unknown as EntityWithPrivateMethods
    ).collectExistingCones();

    // User entity는 이미 cone이 있으므로 수집되어야 함
    expect(existingCones).toBeDefined();
    expect(typeof existingCones).toBe("object");

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
      (userEntity as unknown as EntityWithPrivateMethods).applyCones(testResult);

      // 검증
      expect(userEntity.cone).toEqual(testResult.entityCone);

      const emailProp = userEntity.props.find((p) => p.name === "email");
      expect(emailProp?.cone).toEqual(testResult.propCones.email);
    } finally {
      // 복원
      userEntity.cone = originalEntityCone;
      const emailProp = userEntity.props.find((p) => p.name === "email");
      if (emailProp) {
        (emailProp as unknown as PropWithCone).cone = originalEmailCone;
      }
    }
  });

  test.skip("관계 필드 테스트 - BelongsToOne dataSource 자동 설정 (API 키 필요)", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("ANTHROPIC_API_KEY not set, skipping LLM test");
      return;
    }

    const employeeEntity = EntityManager.get("Employee");

    const originalCone = employeeEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of employeeEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    try {
      const result = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
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
          (prop as unknown as PropWithCone).cone = originalPropCones[prop.name];
        } else {
          delete (prop as unknown as PropWithCone).cone;
        }
      }
    }
  });

  test.skip("한국어 필드명 테스트 - 적절한 faker 생성 확인 (API 키 필요)", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("ANTHROPIC_API_KEY not set, skipping LLM test");
      return;
    }

    const employeeEntity = EntityManager.get("Employee");

    const originalCone = employeeEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of employeeEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    try {
      const result = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
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
          (prop as unknown as PropWithCone).cone = originalPropCones[prop.name];
        } else {
          delete (prop as unknown as PropWithCone).cone;
        }
      }
    }
  });

  test.skip("Locale 변경 테스트 - ko/en/ja 언어별 desc 생성 (API 키 필요)", async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log("ANTHROPIC_API_KEY not set, skipping LLM test");
      return;
    }

    const employeeEntity = EntityManager.get("Employee");

    const originalCone = employeeEntity.cone;
    const originalPropCones: Record<string, Cone> = {};
    for (const prop of employeeEntity.props) {
      if (prop.cone) {
        originalPropCones[prop.name] = prop.cone;
      }
    }

    try {
      // 한국어
      const resultKo = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ko",
      });

      // 영어
      const resultEn = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "en",
      });

      // 일본어
      const resultJa = await employeeEntity.generateCones({
        preserveExisting: false,
        locale: "ja",
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
          (prop as unknown as PropWithCone).cone = originalPropCones[prop.name];
        } else {
          delete (prop as unknown as PropWithCone).cone;
        }
      }
    }
  });
});
