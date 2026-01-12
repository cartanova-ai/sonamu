/** biome-ignore-all lint/suspicious/noExplicitAny: 파싱 결과이므로 any 허용 */

import { get, set } from "radashi";
import { useState } from "react";
import { z } from "zod";
import { useSonamuContext } from "@/contexts/sonamu-context";
import type { ErrorObj } from "./types";

/**
 * traverseAndUploadFiles
 *
 * 폼 데이터 안에 중첩되어 있는 File 객체들을 재귀적으로 찾아서 업로드하고,
 * File 객체를 업로드된 URL 문자열로 변환하는 헬퍼 함수입니다.
 *
 * @param value - 검사할 값 (원시값, File, 배열, 객체 등 모든 타입 가능)
 * @param uploader - File 배열을 받아서 업로드된 URL 배열을 반환하는 함수
 * @returns 변환된 값 (File 객체는 URL 문자열로, 나머지는 원본 구조 유지)
 */
async function traverseAndUploadFiles(
  value: any,
  uploader: (files: File[]) => Promise<string[]>,
): Promise<any> {
  // 1. File 객체를 발견한 경우
  if (value instanceof File) {
    const [url] = await uploader([value]);
    return url;
  }

  // 2. 배열을 발견한 경우
  if (Array.isArray(value)) {
    // 2-1. 배열의 모든 요소가 File이면 일괄 업로드 (성능 최적화)
    if (value.length > 0 && value.every((item) => item instanceof File)) {
      return await uploader(value as File[]);
    }
    // 2-2. 배열에 File이 아닌 요소가 섞여 있으면 각 요소를 재귀적으로 처리
    return await Promise.all(value.map((item) => traverseAndUploadFiles(item, uploader)));
  }

  // 3. 일반 객체를 발견한 경우 (null, Date, RegExp 등 특수 객체 제외)
  if (
    value !== null &&
    typeof value === "object" &&
    Object.prototype.toString.call(value) === "[object Object]"
  ) {
    // 객체의 각 속성을 재귀적으로 순회하며 File 객체를 찾아서 업로드
    const result: any = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = await traverseAndUploadFiles(val, uploader);
    }
    return result;
  }

  // 4. 원시값(string, number, boolean 등)은 변환 없이 그대로 반환
  return value;
}

export function useTypeForm<T extends z.ZodObject<any> | z.ZodArray<any>, U extends z.infer<T>>(
  zType: T,
  defaultValue: U,
) {
  const [form, setForm] = useState<z.infer<T>>(defaultValue);
  const [errorObjs, setErrorObjs] = useState<Map<string, ErrorObj>>(new Map());
  const { uploader } = useSonamuContext();

  function getEmptyStringTo(zType: T, objPath: string): "normal" | "nullable" | "optional" {
    const zTypeObjPath = objPath
      .replace(/\./g, ".shape.")
      .replace(/\[[^\]]+\]/g, ".element")
      .replace(/^\.element/, "element");

    let targetZType: unknown;
    if (zType instanceof z.ZodObject) {
      targetZType = get(zType.shape, zTypeObjPath);
    } else if (zType instanceof z.ZodArray) {
      targetZType = get(zType, zTypeObjPath);
    }

    if (targetZType === undefined) {
      return "normal";
    } else if (targetZType instanceof z.ZodOptional) {
      return "optional";
    } else if (targetZType instanceof z.ZodNullable) {
      return "nullable";
    }
    return "normal";
  }

  return {
    form,
    setForm,
    register: (objPath: string, _emptyStringTo?: "normal" | "nullable" | "optional"): any => {
      const emptyStringTo = _emptyStringTo ?? getEmptyStringTo(zType, objPath);
      const srcValue = get(form, objPath) as unknown;

      const error = errorObjs.get(objPath);

      // 공통 업데이트 로직
      const updateValue = (newValue: any) => {
        if (error !== undefined) {
          setErrorObjs((p) => {
            const newP = new Map(p);
            newP.delete(objPath);
            return newP;
          });
        }

        let processedValue = newValue;
        if (emptyStringTo === "nullable") {
          processedValue = newValue === "" ? null : newValue;
        } else if (emptyStringTo === "optional") {
          processedValue = newValue === "" ? undefined : newValue;
        }

        setForm(set(form, objPath, processedValue));
      };

      const result: Record<string, any> = {
        value: srcValue === undefined || srcValue === null ? "" : srcValue,
        onValueChange: (value: any) => updateValue(value),
      };

      // error가 있으면 추가
      if (error) {
        result.error = error;
      }

      return result;
    },
    submit:
      <R>(callback: (formData: z.infer<T>) => Promise<R>) =>
      async () => {
        const transformedForm = await traverseAndUploadFiles(form, uploader);
        setForm(transformedForm);
        return await callback(transformedForm);
      },
    addError: (objPath: string, errorMessage: string | ErrorObj): void => {
      setErrorObjs((p) => {
        const newP = new Map(p);
        newP.set(
          objPath,
          typeof errorMessage === "string" ? { content: errorMessage } : errorMessage,
        );
        return newP;
      });
    },
    removeError: (objPath: string): void => {
      setErrorObjs((p) => {
        const newP = new Map(p);
        newP.delete(objPath);
        return newP;
      });
    },
    clearError: (): void => {
      setErrorObjs(new Map());
    },
    reset: (): void => {
      setForm(defaultValue);
    },
  };
}
