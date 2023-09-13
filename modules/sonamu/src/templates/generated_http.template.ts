import qs from "qs";
import { z } from "zod";
import { TemplateOptions } from "../types/types";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { getZodObjectFromApi } from "../api/code-converters";
import { ExtendedApi } from "../api/decorators";
import { Template } from "./base-template";
import prettier from "prettier";
import { DateTime } from "luxon";
import { Sonamu } from "../api/sonamu";

export class Template__generated_http extends Template {
  constructor() {
    super("generated_http");
  }

  getTargetAndPath(names: EntityNamesRecord) {
    return {
      target: "api/src/application",
      path: `${names.fs}/${names.fs}.generated.http`,
    };
  }

  render({ entityId }: TemplateOptions["generated"], apis: ExtendedApi[]) {
    const names = EntityManager.getNamesFromId(entityId);
    const references = Sonamu.syncer.types;

    const lines = apis.map((api) => {
      const reqObject = this.resolveApiParams(api, references);

      let qsLines: string[] = [];
      let bodyLines: string[] = [];
      if ((api.options.httpMethod ?? "GET") === "GET") {
        qsLines = [
          qs.stringify(reqObject, { encode: false }).split("&").join("\n\t&"),
        ];
      } else {
        bodyLines = [
          "",
          prettier.format(JSON.stringify(reqObject), {
            parser: "json",
          }),
        ];
      }
      return [
        [
          `${api.options.httpMethod ?? "GET"} {{baseUrl}}/api${api.path}`,
          ...qsLines,
        ].join("\n\t?"),
        `Content-Type: ${api.options.contentType ?? "application/json"}`,
        ...bodyLines,
      ].join("\n");
    });

    return {
      ...this.getTargetAndPath(names),
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
      return [this.zodTypeToReqDefault(zodType.element, name)];
    } else if (zodType instanceof z.ZodString) {
      if (name.endsWith("_at") || name.endsWith("_date") || name === "range") {
        return DateTime.local().toSQL().slice(0, 10);
      } else {
        return name.toUpperCase();
      }
    } else if (zodType instanceof z.ZodNumber) {
      if (name === "num") {
        return 24;
      }
      return zodType.minValue ?? 0;
    } else if (zodType instanceof z.ZodBoolean) {
      return false;
    } else if (zodType instanceof z.ZodEnum) {
      return zodType.options[0];
    } else if (zodType instanceof z.ZodOptional) {
      return this.zodTypeToReqDefault(zodType._def.innerType, name);
    } else if (zodType instanceof z.ZodNullable) {
      return null;
    } else if (zodType instanceof z.ZodUnion) {
      return this.zodTypeToReqDefault(zodType._def.options[0], name);
    } else if (zodType instanceof z.ZodUnknown) {
      return "unknown";
    } else if (zodType instanceof z.ZodTuple) {
      return zodType._def.items.map((item: any) =>
        this.zodTypeToReqDefault(item, name)
      );
    } else {
      // console.log(zodType);
      return `unknown-${zodType._type}`;
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
