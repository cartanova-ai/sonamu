import qs from "qs";
import { z } from "zod";
import { TemplateOptions } from "../types/types";
import { getZodObjectFromApi } from "../api/code-converters";
import { ExtendedApi } from "../api/decorators";
import { Template } from "./base-template";
import prettier from "prettier";
import { Sonamu } from "../api/sonamu";

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

  async render({}: TemplateOptions["generated_http"]) {
    const {
      syncer: { types, apis },
      config: {
        route: { prefix },
      },
    } = Sonamu;

    const lines = await Promise.all(
      apis.map(async (api) => {
        const reqObject = this.resolveApiParams(api, types);

        const dataLines = await (async () => {
          if ((api.options.httpMethod ?? "GET") === "GET") {
            return {
              querystring: [
                qs
                  .stringify(reqObject, { encode: false })
                  .split("&")
                  .join("\n\t&"),
              ],
              body: [],
            };
          } else {
            return {
              querystring: [],
              body: [
                "",
                await prettier.format(JSON.stringify(reqObject), {
                  parser: "json",
                }),
              ],
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
      })
    );

    return {
      ...this.getTargetAndPath(),
      body: lines.join("\n\n###\n\n"),
      importKeys: [],
    };
  }

  zodTypeToReqDefault(zodType: z.ZodType<unknown>, name: string): unknown {
    if (zodType instanceof z.ZodObject) {
      return Object.fromEntries(
        Object.keys(zodType.shape).map((key) => [
          key,
          this.zodTypeToReqDefault(zodType.shape[key], key),
        ])
      );
    } else if (zodType instanceof z.ZodArray) {
      return [this.zodTypeToReqDefault((zodType as z.ZodArray<z.ZodType>).element, name)];
    } else if (zodType instanceof z.ZodString) {
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
      return minValue > Number.MIN_SAFE_INTEGER  ? minValue : 0;
    } else if (zodType instanceof z.ZodBoolean) {
      return false;
    } else if (zodType instanceof z.ZodEnum) {
      return zodType.options[0];
    } else if (zodType instanceof z.ZodOptional) {
      return this.zodTypeToReqDefault((zodType as z.ZodOptional<z.ZodType>).def.innerType, name);
    } else if (zodType instanceof z.ZodNullable) {
      return null;
    } else if (zodType instanceof z.ZodUnion) {
      return this.zodTypeToReqDefault((zodType as z.ZodUnion<z.ZodType[]>).def.options[0], name);
    } else if (zodType instanceof z.ZodUnknown) {
      return "unknown";
    } else if (zodType instanceof z.ZodTuple) {
      return zodType.def.items.map((item: any) =>
        this.zodTypeToReqDefault(item, name)
      );
    } else if (zodType instanceof z.ZodDate) {
      return "2000-01-01";
    } else if (zodType instanceof z.ZodLiteral) {
      return zodType.value;
    } else if (zodType instanceof z.ZodRecord || zodType instanceof z.ZodMap) {
      const kvDef = (zodType as z.ZodRecord<any, z.ZodType> | z.ZodMap<z.ZodType, z.ZodType>).def
      const key = this.zodTypeToReqDefault(kvDef.keyType, name) as any;
      const value = this.zodTypeToReqDefault(kvDef.valueType, name);
      return { [key]: value };
    } else if (zodType instanceof z.ZodSet) {
      return [this.zodTypeToReqDefault((zodType as z.ZodSet<z.ZodType>).def.valueType, name)];
    } else if (zodType instanceof z.ZodIntersection) {
      return this.zodTypeToReqDefault((zodType as z.ZodIntersection<z.ZodType, z.ZodType>).def.right, name);
    } else if (zodType instanceof z.ZodDefault) {
      return this.zodTypeToReqDefault((zodType as z.ZodDefault<z.ZodType>).def.innerType, name);
    } else {
      // console.log(zodType);
      return `unknown-${zodType.type}`;
    }
  }

  resolveApiParams(
    api: ExtendedApi,
    references: { [typeName: string]: z.ZodObject<any> }
  ): { [key: string]: unknown } {
    const reqType = getZodObjectFromApi(api, references);
    return this.zodTypeToReqDefault(reqType, "unknownName") as {
      [key: string]: unknown;
    };
  }
}
