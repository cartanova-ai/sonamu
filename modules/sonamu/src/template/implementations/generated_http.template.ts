import qs from "qs";
import { z } from "zod";

import { getZodObjectFromApi } from "../../api/code-converters";
import { type ExtendedApi } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import { Template } from "../template";

type RequestDefaultValue =
  | null
  | undefined
  | bigint
  | boolean
  | number
  | string
  | RequestDefaultValue[]
  | RequestDefaultObject;

interface RequestDefaultObject {
  [key: string]: RequestDefaultValue;
}

export class Template__generated_http extends Template {
  constructor() {
    super("generated_http");
  }

  getTargetAndPath() {
    const { dir } = Sonamu.config.api;

    return {
      target: `${dir}/src/application`,
      path: `sonamu.generated.http`,
    };
  }

  async render() {
    const {
      syncer: { types, apis },
      config: {
        api: {
          route: { prefix },
        },
      },
    } = Sonamu;

    const lines = await Promise.all(
      apis.map(async (api) => {
        const reqObject = this.resolveApiParams(api, types);

        const dataLines = await (async () => {
          if ((api.options.httpMethod ?? "GET") === "GET") {
            return {
              querystring: [qs.stringify(reqObject, { encode: false }).split("&").join("\n\t&")],
              body: [],
            };
          } else {
            return {
              querystring: [],
              body: ["", JSON.stringify(reqObject, null, 2)],
            };
          }
        })();

        return [
          [
            `${api.options.httpMethod ?? "GET"} {{baseUrl}}${prefix}${api.path}`,
            ...dataLines.querystring,
          ].join("\n\t?"),
          `Content-Type: ${api.options.contentType ?? "application/json"}`,
          ...dataLines.body,
        ].join("\n");
      }),
    );

    return {
      ...this.getTargetAndPath(),
      body: lines.join("\n\n###\n\n"),
      importKeys: [],
      customHeaders: ["# @generated", "# 직접 수정하지 마세요."],
    };
  }

  zodTypeToReqDefault(zodType: z.ZodType, name: string): RequestDefaultValue {
    if (zodType instanceof z.ZodObject) {
      return Object.fromEntries(
        Object.keys(zodType["shape"]).map((key) => [
          key,
          this.zodTypeToReqDefault(zodType["shape"][key], key),
        ]),
      );
    } else if (zodType instanceof z.ZodArray) {
      return [
        this.zodTypeToReqDefault(
          /* SAFETY: ZodArray 분기이므로 element가 배열 원소 스키마다. */ (
            zodType as z.ZodArray<z.ZodType>
          ).element,
          name,
        ),
      ];
    } else if (zodType instanceof z.core.$ZodString) {
      // NOTE: z.ZodString으로 비교하면 z.url(), z.email() 등의 타입에서 문제가 생기므로 z.core.$ZodString으로 비교함
      if (name.endsWith("_at") || name.endsWith("_date") || name === "range") {
        return "2000-01-01";
      } else {
        return name.toUpperCase();
      }
    } else if (zodType instanceof z.ZodNumber) {
      if (name === "num") {
        return 24;
      }

      const minValue = zodType.minValue ?? 0;
      return minValue > Number.MIN_SAFE_INTEGER ? minValue : 0;
    } else if (zodType instanceof z.ZodBoolean) {
      return false;
    } else if (zodType instanceof z.ZodEnum) {
      return zodType.options[0];
    } else if (zodType instanceof z.ZodOptional) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodOptional 분기이므로 innerType이 선택 속성의 스키마다. */ (
          zodType as z.ZodOptional<z.ZodType>
        ).def.innerType,
        name,
      );
    } else if (zodType instanceof z.ZodNullable) {
      return null;
    } else if (zodType instanceof z.ZodUnion) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodUnion 분기이므로 options의 첫 항목이 유효한 대안 스키마다. */ (
          zodType as z.ZodUnion<z.ZodType[]>
        ).def.options[0],
        name,
      );
    } else if (zodType instanceof z.ZodUnknown) {
      return "unknown";
    } else if (zodType instanceof z.ZodTuple) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ZodTuple 타입 사용
      return zodType.def.items.map((item: any) => this.zodTypeToReqDefault(item, name));
    } else if (zodType instanceof z.ZodDate) {
      return "2000-01-01";
    } else if (zodType instanceof z.ZodLiteral) {
      return zodType.value;
    } else if (zodType instanceof z.ZodRecord || zodType instanceof z.ZodMap) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ZodRecord 타입 사용
      const kvDef = /* SAFETY: ZodRecord/ZodMap 분기이므로 def가 키-값 스키마 정의다. */ (
        zodType as z.ZodRecord<any, z.ZodType> | z.ZodMap<z.ZodType, z.ZodType>
      ).def;
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ZodIntersection 타입 사용
      const key = String(this.zodTypeToReqDefault(kvDef.keyType, name));
      const value = this.zodTypeToReqDefault(kvDef.valueType, name);
      return { [key]: value };
    } else if (zodType instanceof z.ZodSet) {
      return [
        this.zodTypeToReqDefault(
          /* SAFETY: ZodSet 분기이므로 valueType이 집합 원소 스키마다. */ (
            zodType as z.ZodSet<z.ZodType>
          ).def.valueType,
          name,
        ),
      ];
    } else if (zodType instanceof z.ZodIntersection) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodIntersection 분기이므로 right가 교차 타입의 우측 스키마다. */ (
          zodType as z.ZodIntersection<z.ZodType, z.ZodType>
        ).def.right,
        name,
      );
    } else if (zodType instanceof z.ZodDefault) {
      return this.zodTypeToReqDefault(
        /* SAFETY: ZodDefault 분기이므로 innerType이 기본값 적용 전 스키마다. */ (
          zodType as z.ZodDefault<z.ZodType>
        ).def.innerType,
        name,
      );
    } else {
      // console.log(zodType);
      return `unknown-${zodType.type}`;
    }
  }

  resolveApiParams(
    api: ExtendedApi,
    references: { [typeName: string]: z.ZodType },
  ): RequestDefaultObject {
    const reqType = getZodObjectFromApi(api, references);
    try {
      // SAFETY: getZodObjectFromApi는 객체 스키마를 반환하므로 기본값도 객체이다.
      const def = this.zodTypeToReqDefault(reqType, "unknownName") as RequestDefaultObject;
      return def;
    } catch (error) {
      console.error(error);
      throw new Error(`Invalid zod type detected on ${api.modelName}:${api.methodName}`, {
        cause: error,
      });
    }
  }
}
