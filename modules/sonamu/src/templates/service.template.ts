import { camelize } from "inflection";
import { groupBy, sortBy, difference, uniq } from "lodash";
import { TemplateOptions } from "../types/types";
import { SMDManager, SMDNamesRecord } from "../smd/smd-manager";
import { ApiParamType, ApiParam } from "../types/types";
import {
  apiParamTypeToTsType,
  apiParamToTsCode,
  unwrapPromiseOnce,
} from "../api/code-converters";
import { ExtendedApi } from "../api/decorators";
import { Template } from "./base-template";
import { Sonamu } from "../api/sonamu";

export class Template__service extends Template {
  constructor() {
    super("service");
  }

  getTargetAndPath(names: SMDNamesRecord) {
    return {
      target: ":target/src/services",
      path: `${names.fs}/${names.fs}.service.ts`,
    };
  }

  render({ smdId }: TemplateOptions["service"], apis: ExtendedApi[]) {
    const names = SMDManager.getNamesFromId(smdId);

    // 서비스 TypeSource
    const { lines, importKeys } = this.getTypeSource(apis);

    return {
      ...this.getTargetAndPath(names),
      body: lines.join("\n"),
      importKeys: importKeys.filter(
        (key) => ["ListResult"].includes(key) === false
      ),
      customHeaders: [
        `import { z } from 'zod';`,
        `import qs from "qs";`,
        `import useSWR, { SWRResponse } from "swr";`,
        `import { fetch, ListResult, SWRError, SwrOptions, handleConditional } from '../sonamu.shared';`,
      ],
    };
  }

  getTypeSource(apis: ExtendedApi[]): {
    lines: string[];
    importKeys: string[];
  } {
    const importKeys: string[] = [];

    // 제네릭에서 선언한 타입, importKeys에서 제외 필요
    let typeParamNames: string[] = [];

    const groups = groupBy(apis, (api) => api.modelName);
    const body = Object.keys(groups)
      .map((modelName) => {
        const methods = groups[modelName];
        const methodCodes = methods
          .map((api) => {
            // 컨텍스트 제외된 파라미터 리스트
            const paramsWithoutContext = api.parameters.filter(
              (param) => !ApiParamType.isContext(param.type)
            );

            // 파라미터 타입 정의
            const typeParamsDef = api.typeParameters
              .map((typeParam) => {
                return apiParamTypeToTsType(typeParam, importKeys);
              })
              .join(", ");
            typeParamNames = typeParamNames.concat(
              api.typeParameters.map((typeParam) => typeParam.id)
            );

            // 파라미터 정의
            const paramsDef = apiParamToTsCode(
              paramsWithoutContext,
              importKeys
            );

            // 리턴 타입 정의
            const returnTypeDef = apiParamTypeToTsType(
              unwrapPromiseOnce(api.returnType),
              importKeys
            );

            // 페이로드 데이터 정의
            const payloadDef = `{ ${paramsWithoutContext
              .map((param) => param.name)
              .join(", ")} }`;

            return sortBy(api.options.clients, (client) =>
              client === "swr" ? 0 : 1
            )
              .map((client) => {
                const apiBaseUrl = `${Sonamu.config.route.prefix}${api.path}`;
                switch (client) {
                  case "axios":
                    return this.renderAxios(
                      api,
                      apiBaseUrl,
                      typeParamsDef,
                      paramsDef,
                      returnTypeDef,
                      payloadDef
                    );
                  case "axios-multipart":
                    return this.renderAxiosMultipart(
                      api,
                      apiBaseUrl,
                      typeParamsDef,
                      paramsDef,
                      returnTypeDef,
                      paramsWithoutContext
                    );
                  case "swr":
                    return this.renderSwr(
                      api,
                      apiBaseUrl,
                      typeParamsDef,
                      paramsDef,
                      returnTypeDef,
                      payloadDef
                    );
                  case "window-fetch":
                    return this.renderWindowFetch(
                      api,
                      apiBaseUrl,
                      typeParamsDef,
                      paramsDef,
                      payloadDef
                    );
                  case "socketio":
                  default:
                    return `// Not supported ${camelize(client, true)} yet.`;
                }
              })
              .join("\n");
          })
          .join("\n\n");

        return `export namespace ${modelName.replace(/Model$/, "Service")} {
${methodCodes}
}`;
      })
      .join("\n\n");
    return {
      lines: [body],
      importKeys: difference(uniq(importKeys), typeParamNames),
    };
  }

  renderAxios(
    api: ExtendedApi,
    apiBaseUrl: string,
    typeParamsDef: string,
    paramsDef: string,
    returnTypeDef: string,
    payloadDef: string
  ) {
    const methodNameAxios = api.options.resourceName
      ? "get" + camelize(api.options.resourceName)
      : api.methodName;

    if (api.options.httpMethod === "GET") {
      return `
export async function ${methodNameAxios}${typeParamsDef}(${paramsDef}): Promise<${returnTypeDef}> {
    return fetch({
      method: "GET",
      url: \`${apiBaseUrl}?\${qs.stringify(${payloadDef})}\`,
    });
}
    `.trim();
    } else {
      return `
export async function ${methodNameAxios}${typeParamsDef}(${paramsDef}): Promise<${returnTypeDef}> {
    return fetch({
      method: '${api.options.httpMethod}',
      url: \`${apiBaseUrl}\`,
      data: ${payloadDef},
    });
}
      `.trim();
    }
  }

  renderAxiosMultipart(
    api: ExtendedApi,
    apiBaseUrl: string,
    typeParamsDef: string,
    paramsDef: string,
    returnTypeDef: string,
    paramsWithoutContext: ApiParam[]
  ) {
    const formDataDef = [
      'formData.append("file", file);',
      ...paramsWithoutContext.map(
        (param) => `formData.append('${param.name}', ${param.name});`
      ),
    ].join("\n");

    const paramsDefComma = paramsDef !== "" ? ", " : "";
    return `
export async function ${api.methodName}${typeParamsDef}(
  ${paramsDef}${paramsDefComma}
  file: File,
  onUploadProgress?: (pe:ProgressEvent) => void
  ): Promise<${returnTypeDef}> {
    const formData = new FormData();
    ${formDataDef}
    return fetch({
      method: 'POST',
      url: \`${apiBaseUrl}\`,
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
      data: formData,
    });
  }
  `.trim();
  }

  renderSwr(
    api: ExtendedApi,
    apiBaseUrl: string,
    typeParamsDef: string,
    paramsDef: string,
    returnTypeDef: string,
    payloadDef: string
  ) {
    const methodNameSwr = api.options.resourceName
      ? "use" + camelize(api.options.resourceName)
      : "use" + camelize(api.methodName);
    return `  export function ${camelize(
      methodNameSwr,
      true
    )}${typeParamsDef}(${[paramsDef, "options?: SwrOptions"]
      .filter((p) => p !== "")
      .join(",")}, ): SWRResponse<${returnTypeDef}, SWRError> {
    return useSWR<${returnTypeDef}, SWRError>(handleConditional([
      \`${apiBaseUrl}\`,
      qs.stringify(${payloadDef}),
    ], options?.conditional));
  }`;
  }

  renderWindowFetch(
    api: ExtendedApi,
    apiBaseUrl: string,
    typeParamsDef: string,
    paramsDef: string,
    payloadDef: string
  ) {
    return `
export async function ${api.methodName}${typeParamsDef}(${paramsDef}): Promise<Response> {
    return window.fetch(\`${apiBaseUrl}?\${qs.stringify(${payloadDef})}\`);
}
    `.trim();
  }
}
