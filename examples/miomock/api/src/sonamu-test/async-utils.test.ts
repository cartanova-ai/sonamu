import path from "path";

import { describe, expect, test } from "vitest";

import {
  everyAsync,
  filterAsync,
  globAsync,
  mapAsync,
  reduceAsync,
} from "../../../../../modules/sonamu/dist/utils/async-utils";
import { exists } from "../../../../../modules/sonamu/dist/utils/fs-utils";

const delayedEven = async (value: number) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return value % 2 === 0;
};
const positive = async (value: number) => value > 0;
const even = async (value: number) => value % 2 === 0;
const throwOnTwoPredicate = async (value: number) => {
  if (value === 2) throw new Error("Test error");
  return true;
};
const delayedDouble = async (value: number) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return value * 2;
};
const delayedDoubleInParallel = async (value: number) => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return value * 2;
};
const double = async (value: number) => value * 2;
const numberLabel = async (value: number) => `number: ${value}`;
const throwOnTwoMapper = async (value: number) => {
  if (value === 2) throw new Error("Test error");
  return value * 2;
};
const delayedSum = async (total: number, value: number) => {
  await new Promise((resolve) => setTimeout(resolve, 10));
  return total + value;
};
const sum = async (total: number, value: number) => total + value;
const collectKeyValues = async (
  result: Record<string, number>,
  item: { key: string; value: number },
) => {
  result[item.key] = item.value;
  return result;
};
const throwOnTwoReducer = async (total: number, value: number) => {
  if (value === 2) throw new Error("Test error");
  return total + value;
};

describe("async-utils", () => {
  describe("filterAsync 테스트", () => {
    test("비동기 조건으로 배열 필터링", async () => {
      // 짝수만 필터링하는 비동기 조건 함수
      const arr = [1, 2, 3, 4, 5];
      const predicate = delayedEven;

      const result = await filterAsync(arr, predicate);

      // 짝수만 반환되어야 함
      expect(result).toEqual([2, 4]);
    });

    test("빈 배열을 처리한다", async () => {
      // 빈 배열과 조건 함수
      const arr: number[] = [];
      const predicate = positive;

      const result = await filterAsync(arr, predicate);

      // 빈 배열이 반환되어야 함
      expect(result).toEqual([]);
    });

    test("모든 요소가 조건을 만족하는 경우", async () => {
      // 모두 짝수인 배열
      const arr = [2, 4, 6, 8];
      const predicate = even;

      const result = await filterAsync(arr, predicate);

      // 모든 요소가 그대로 반환되어야 함
      expect(result).toEqual([2, 4, 6, 8]);
    });

    test("모든 요소가 조건을 만족하지 않는 경우", async () => {
      // 모두 홀수인 배열
      const arr = [1, 3, 5, 7];
      const predicate = even;

      const result = await filterAsync(arr, predicate);

      // 빈 배열이 반환되어야 함
      expect(result).toEqual([]);
    });

    test("비동기 에러를 올바르게 전파", async () => {
      // 특정 값에서 에러를 던지는 조건 함수
      const arr = [1, 2, 3];
      const predicate = throwOnTwoPredicate;

      // 에러가 전파되어야 함
      await expect(filterAsync(arr, predicate)).rejects.toThrow("Test error");
    });

    test("index와 array 파라미터를 올바르게 전달", async () => {
      // index로 필터링하는 조건 함수
      const arr = [10, 20, 30];
      const predicate = async (_item: number, index: number, array: number[]) => {
        expect(array).toBe(arr);
        return index < 2;
      };

      const result = await filterAsync(arr, predicate);

      // 처음 두 요소만 반환되어야 함
      expect(result).toEqual([10, 20]);
    });
  });

  describe("everyAsync 테스트", () => {
    test("모든 요소가 조건을 만족하면 true를 반환", async () => {
      // 모두 짝수인 배열과 짝수 검사 조건
      const arr = [2, 4, 6, 8];
      const predicate = delayedEven;

      const result = await everyAsync(arr, predicate);

      // true가 반환되어야 함
      expect(result).toBe(true);
    });

    test("하나라도 조건을 만족하지 않으면 false를 반환", async () => {
      // 홀수가 하나 포함된 배열
      const arr = [2, 4, 5, 8];
      const predicate = even;

      const result = await everyAsync(arr, predicate);

      // false가 반환되어야 함
      expect(result).toBe(false);
    });

    test("빈 배열은 true를 반환 (JavaScript 표준 동작)", async () => {
      // 빈 배열
      const arr: number[] = [];
      const predicate = positive;

      const result = await everyAsync(arr, predicate);

      // true가 반환되어야 함 (JavaScript 표준)
      expect(result).toBe(true);
    });

    test("순차적으로 실행되며 false를 만나면 즉시 중단 (early exit)", async () => {
      // 실행 순서를 기록하는 배열
      const arr = [1, 2, 3, 4, 5];
      const callOrder: number[] = [];
      const predicate = async (x: number) => {
        callOrder.push(x);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return x < 3; // 3에서 false 반환
      };

      const result = await everyAsync(arr, predicate);

      // false가 반환되고, 3까지만 실행되어야 함
      expect(result).toBe(false);
      expect(callOrder).toEqual([1, 2, 3]);
    });

    test("비동기 에러를 올바르게 전파", async () => {
      // 특정 값에서 에러를 던지는 조건 함수
      const arr = [1, 2, 3];
      const predicate = throwOnTwoPredicate;

      // 에러가 전파되어야 함
      await expect(everyAsync(arr, predicate)).rejects.toThrow("Test error");
    });
  });

  describe("filterAsync + everyAsync - 실제 사용 예시", () => {
    test("파일이 존재하지 않는 경로만 필터링 (code-generator 패턴)", async () => {
      // 생성할 파일 경로 목록 (실제로는 PathAndCode 객체)
      const pathAndCodes = [
        { path: "api/src/test1.ts", code: "content1" },
        { path: "api/src/test2.ts", code: "content2" },
        { path: "api/src/test3.ts", code: "content3" },
      ];
      const targets = ["web", "mobile"];
      const appRootPath = process.cwd();

      // 모든 target 경로에 파일이 없는 것만 필터링
      const result = await filterAsync(pathAndCodes, async (pathAndCode) => {
        const filePath = `${appRootPath}/${pathAndCode.path}`;
        const dstFilePaths = targets.map((target) => filePath.replace("/api/", `/${target}/`));
        // 모든 경로에 파일이 없어야 true (생성 가능)
        return await everyAsync(dstFilePaths, async (dstPath) => !(await exists(dstPath)));
      });

      // 실제로 존재하지 않는 파일들만 반환되어야 함
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("mapAsync 테스트", () => {
    test("비동기 변환 함수를 배열의 각 요소에 적용", async () => {
      // 각 요소를 2배로 변환하는 비동기 함수
      const arr = [1, 2, 3];
      const mapper = delayedDouble;

      const result = await mapAsync(arr, mapper);

      // 모든 요소가 2배가 되어야 함
      expect(result).toEqual([2, 4, 6]);
    });

    test("빈 배열 처리", async () => {
      // 빈 배열
      const arr: number[] = [];
      const mapper = double;

      const result = await mapAsync(arr, mapper);

      // 빈 배열이 반환되어야 함
      expect(result).toEqual([]);
    });

    test("타입 변환 수행", async () => {
      // 숫자를 문자열로 변환하는 함수
      const arr = [1, 2, 3];
      const mapper = numberLabel;

      const result = await mapAsync(arr, mapper);

      // 문자열 배열이 반환되어야 함
      expect(result).toEqual(["number: 1", "number: 2", "number: 3"]);
    });

    test("병렬로 실행", async () => {
      // 각각 100ms가 걸리는 변환 함수
      const arr = [1, 2, 3];
      const startTime = Date.now();
      const mapper = delayedDoubleInParallel;

      await mapAsync(arr, mapper);
      const duration = Date.now() - startTime;

      // 병렬 실행으로 200ms 미만이어야 함 (순차면 300ms 이상)
      expect(duration).toBeLessThan(200);
    });

    test("비동기 에러를 올바르게 전파", async () => {
      // 특정 값에서 에러를 던지는 변환 함수
      const arr = [1, 2, 3];
      const mapper = throwOnTwoMapper;

      // 에러가 전파되어야 함
      await expect(mapAsync(arr, mapper)).rejects.toThrow("Test error");
    });

    test("index와 array 파라미터를 올바르게 전달", async () => {
      // 값과 인덱스를 더하는 변환 함수
      const arr = [10, 20, 30];
      const mapper = async (item: number, index: number, array: number[]) => {
        expect(array).toBe(arr);
        return item + index;
      };

      const result = await mapAsync(arr, mapper);

      // 각 요소에 인덱스가 더해져야 함
      expect(result).toEqual([10, 21, 32]);
    });
  });

  describe("mapAsync - 실제 사용 예시", () => {
    test("여러 파일 경로의 존재 여부를 병렬로 확인 (syncer 패턴)", async () => {
      // 여러 target에 대해 파일 존재 여부 확인
      const targets = ["web", "mobile", "admin"];
      const basePath = process.cwd();
      const fileName = "package.json";

      // 각 target의 package.json 존재 여부를 병렬로 확인
      const results = await mapAsync(targets, async (target) => {
        const filePath = path.join(basePath, target, fileName);
        return {
          target,
          exists: await exists(filePath),
        };
      });

      // 각 target별 결과가 반환되어야 함
      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty("target");
      expect(results[0]).toHaveProperty("exists");
    });
  });

  describe("reduceAsync 테스트", () => {
    test("비동기 리듀서로 배열 축약", async () => {
      // 배열의 합을 구하는 비동기 리듀서
      const arr = [1, 2, 3, 4];
      const reducer = delayedSum;

      const result = await reduceAsync(arr, reducer, 0);

      // 합계 10이 반환되어야 함
      expect(result).toBe(10);
    });

    test("빈 배열은 initialValue 반환", async () => {
      // 빈 배열과 초기값 100
      const arr: number[] = [];
      const reducer = sum;

      const result = await reduceAsync(arr, reducer, 100);

      // 초기값 100이 그대로 반환되어야 함
      expect(result).toBe(100);
    });

    test("객체 축약", async () => {
      // 배열을 객체로 변환하는 리듀서
      const arr = [
        { key: "a", value: 1 },
        { key: "b", value: 2 },
        { key: "c", value: 3 },
      ];
      const reducer = collectKeyValues;

      const result = await reduceAsync(arr, reducer, {});

      // key-value 쌍의 객체가 반환되어야 함
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    test("순차적으로 실행", async () => {
      // 실행 순서를 기록하는 리듀서
      const arr = [1, 2, 3];
      const callOrder: number[] = [];
      const reducer = async (acc: number[], x: number) => {
        callOrder.push(x);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [...acc, x];
      };

      await reduceAsync(arr, reducer, []);

      // 순차적으로 실행되어야 함
      expect(callOrder).toEqual([1, 2, 3]);
    });

    test("비동기 에러를 올바르게 전파", async () => {
      // 특정 값에서 에러를 던지는 리듀서
      const arr = [1, 2, 3];
      const reducer = throwOnTwoReducer;

      // 에러가 전파되어야 함
      await expect(reduceAsync(arr, reducer, 0)).rejects.toThrow("Test error");
    });

    test("index와 array 파라미터를 올바르게 전달", async () => {
      // 값과 인덱스를 모두 더하는 리듀서
      const arr = [10, 20, 30];
      const reducer = async (acc: number, item: number, index: number, array: number[]) => {
        expect(array).toBe(arr);
        return acc + item + index;
      };

      const result = await reduceAsync(arr, reducer, 0);

      // 값과 인덱스의 합이 반환되어야 함 (10+0 + 20+1 + 30+2 = 63)
      expect(result).toBe(63);
    });
  });

  describe("reduceAsync - 실제 사용 예시", () => {
    test("템플릿 키별 파일 존재 여부를 객체로 축약 (syncer.checkExists 패턴)", async () => {
      // 템플릿 키 목록
      const templateKeys = ["entity", "model", "service"];
      const basePath = process.cwd();

      // 각 템플릿 키에 대해 파일 존재 여부를 확인하고 객체로 축약
      const result = await reduceAsync(
        templateKeys,
        async (acc, key) => {
          const filePath = path.join(basePath, "src", `${key}.ts`);
          acc[key] = await exists(filePath);
          return acc;
        },
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        {} as Record<string, boolean>,
      );

      // { entity: true/false, model: true/false, service: true/false } 형태
      expect(result).toHaveProperty("entity");
      expect(result).toHaveProperty("model");
      expect(result).toHaveProperty("service");
      expect(result.entity).toEqual(expect.any(Boolean));
    });

    test("중첩된 mapAsync를 포함한 reduceAsync (syncer.checkExists 실제 패턴)", async () => {
      // 템플릿 키와 target 조합으로 파일 존재 여부 확인
      const templateKeys = ["service", "types", "view"];
      const targets = ["web", "mobile"];
      const basePath = process.cwd();

      const result = await reduceAsync(
        templateKeys,
        async (acc, key) => {
          // 케이스 1: 특정 키는 단일 경로만 체크 (view_enums 패턴 모방)
          if (key === "view") {
            const filePath = path.join(basePath, "src", `${key}.ts`);
            acc[key] = await exists(filePath);
            return acc;
          }

          // 케이스 2: 여러 target에 대해 병렬로 확인 (:target 패턴 모방)
          await mapAsync(targets, async (target) => {
            const filePath = path.join(basePath, target, "src", `${key}.ts`);
            acc[`${key}__${target}`] = await exists(filePath);
          });
          return acc;
          // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        },
        // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
        {} as Record<string, boolean>,
      );

      // { service__web: true/false, service__mobile: true/false, ... } 형태
      // 단일 키 검증
      expect(result).toHaveProperty("view");
      expect(result.view).toEqual(expect.any(Boolean));

      // target별 키 검증
      expect(result).toHaveProperty("service__web");
      expect(result).toHaveProperty("service__mobile");
      expect(result).toHaveProperty("types__web");
      expect(result).toHaveProperty("types__mobile");
    });
  });

  describe("globAsync 테스트", () => {
    test("glob 패턴으로 파일 찾기", async () => {
      // 테스트 파일 패턴
      const testPattern = path.join(process.cwd(), "src/sonamu-test/*.test.ts");

      const result = await globAsync(testPattern);

      // 테스트 파일들이 찾아져야 함
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((p) => p.endsWith(".test.ts"))).toBe(true);
    });

    test("재귀적으로 파일 찾기", async () => {
      // 모든 하위 디렉토리의 TypeScript 파일 패턴
      const testPattern = path.join(process.cwd(), "src/**/*.ts");

      const result = await globAsync(testPattern);

      // 모든 .ts 파일이 찾아져야 함
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((p) => p.endsWith(".ts"))).toBe(true);
    });

    test("특정 확장자 파일만 찾기", async () => {
      // .test.ts 확장자만 찾는 패턴
      const testPattern = path.join(process.cwd(), "src/sonamu-test/*.test.ts");

      const result = await globAsync(testPattern);

      // .test.ts 파일만 반환되어야 함
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((p) => p.endsWith(".test.ts"))).toBe(true);
    });

    test("매칭되는 파일이 없으면 빈 배열 반환", async () => {
      // 존재하지 않는 확장자 패턴
      const testPattern = path.join(process.cwd(), "src/**/*.nonexistent-extension");

      const result = await globAsync(testPattern);

      // 빈 배열이 반환되어야 함
      expect(result).toEqual([]);
    });

    test("절대 경로 반환", async () => {
      // 테스트 파일 패턴
      const testPattern = path.join(process.cwd(), "src/sonamu-test/*.test.ts");

      const result = await globAsync(testPattern);

      // 모든 경로가 절대 경로여야 함
      expect(result.length).toBeGreaterThan(0);
      for (const filePath of result) {
        expect(path.isAbsolute(filePath)).toBe(true);
      }
    });
  });

  describe("globAsync - 실제 사용 예시", () => {
    test("모델 파일 찾기 (module-loader 패턴)", async () => {
      // src/application/**/*.model.ts 패턴으로 모델 파일 찾기
      const pattern = path.join(process.cwd(), "src/**/*.model.ts");

      const modelPaths = await globAsync(pattern);

      // 모델 파일들이 찾아져야 함
      expect(Array.isArray(modelPaths)).toBe(true);
      // 모든 경로가 .model.ts로 끝나야 함
      if (modelPaths.length > 0) {
        expect(modelPaths.every((p) => p.endsWith(".model.ts"))).toBe(true);
      }
    });

    test("여러 패턴을 병렬로 검색 (module-loader.loadTypes 패턴)", async () => {
      // 여러 타입 파일 패턴을 동시에 검색
      const patterns = [
        path.join(process.cwd(), "src/**/*.types.ts"),
        path.join(process.cwd(), "src/**/*.generated.ts"),
      ];

      // Promise.all로 병렬 실행
      const results = await Promise.all(patterns.map((p) => globAsync(p)));
      const allTypePaths = results.flat();

      // 두 패턴의 결과가 합쳐져야 함
      expect(Array.isArray(allTypePaths)).toBe(true);
      // 모든 경로가 .ts로 끝나야 함
      if (allTypePaths.length > 0) {
        expect(allTypePaths.every((p) => p.endsWith(".ts"))).toBe(true);
      }
    });

    test("템플릿 구현체 찾기 (template.autoload 패턴)", async () => {
      // implementations/*.template.js 패턴으로 템플릿 찾기
      const pattern = path.join(
        process.cwd(),
        "../../modules/sonamu/dist/template/implementations/*.template.js",
      );

      const templateFiles = await globAsync(pattern);

      // 템플릿 파일들이 찾아져야 함
      expect(Array.isArray(templateFiles)).toBe(true);
      if (templateFiles.length > 0) {
        expect(templateFiles.every((p) => p.endsWith(".template.js"))).toBe(true);
      }
    });

    test("체크섬 대상 파일 찾기 (checksum 패턴)", async () => {
      // 여러 파일 타입별 패턴으로 검색
      const patterns = {
        model: path.join(process.cwd(), "src/**/*.model.ts"),
        types: path.join(process.cwd(), "src/**/*.types.ts"),
        entity: path.join(process.cwd(), "src/**/*.entity.ts"),
      };

      // 각 패턴별로 파일 찾기
      const results = await Promise.all(
        Object.entries(patterns).map(async ([fileType, pattern]) => {
          const files = await globAsync(pattern);
          return { fileType, files };
        }),
      );

      // 각 파일 타입별 결과가 있어야 함
      expect(results).toHaveLength(3);
      expect(results[0]).toHaveProperty("fileType");
      expect(results[0]).toHaveProperty("files");
      expect(Array.isArray(results[0]?.files)).toBe(true);
    });
  });

  describe("복합 사용 예시", () => {
    test("파일 찾기 → 필터링 → 변환 파이프라인", async () => {
      // 1. globAsync로 모든 테스트 파일 찾기
      const allTestFiles = await globAsync(path.join(process.cwd(), "src/**/*.test.ts"));

      // 2. filterAsync로 특정 조건의 파일만 필터링
      const recentFiles = await filterAsync(allTestFiles, async (filePath) => {
        const stats = await import("fs/promises").then((fs) => fs.stat(filePath));
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        return stats.mtimeMs > oneWeekAgo;
      });

      // 3. mapAsync로 파일 정보 추출
      const fileInfos = await mapAsync(recentFiles, async (filePath) => {
        const stats = await import("fs/promises").then((fs) => fs.stat(filePath));
        return {
          path: filePath,
          size: stats.size,
          modified: stats.mtime,
        };
      });

      // 4. reduceAsync로 통계 계산
      const stats = await reduceAsync(
        fileInfos,
        async (acc, info) => {
          acc.totalSize += info.size;
          acc.count += 1;
          return acc;
        },
        { totalSize: 0, count: 0 },
      );

      // 결과 검증
      expect(stats).toHaveProperty("totalSize");
      expect(stats).toHaveProperty("count");
      expect(stats.count).toBe(fileInfos.length);
    });
  });
});
