import inflection from "inflection";
import { diff, unique } from "radashi";
import {
  apiParamToTsCode,
  apiParamTypeToTsType,
  unwrapPromiseOnce,
} from "../../api/code-converters";
import type { ExtendedApi } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import type { TemplateOptions } from "../../types/types";
import { ApiParamType } from "../../types/types";
import { assertDefined } from "../../utils/utils";
import { Template } from "../template";

export class Template__services extends Template {
  constructor() {
    super("services");
  }

  getTargetAndPath() {
    return {
      target: ":target/src/services",
      path: `services.generated.ts`,
    };
  }

  render({}: TemplateOptions["services"]) {
    const { apis } = Sonamu.syncer;

    // 모델별로 그룹화
    const apisByModel = new Map<string, ExtendedApi[]>();
    for (const api of apis) {
      const modelName = api.modelName.replace(/Model$/, "").replace(/Frame$/, "");
      if (!apisByModel.has(modelName)) {
        apisByModel.set(modelName, []);
      }
      apisByModel.get(modelName)?.push(api);
    }

    const importKeys: string[] = [];
    const namespaces: string[] = [];
    let typeParamNames: string[] = [];

    for (const [modelName, modelApis] of apisByModel) {
      const functions: string[] = [];

      for (const api of modelApis) {
        // Context 제외한 파라미터
        const paramsWithoutContext = api.parameters.filter(
          (param) =>
            !ApiParamType.isContext(param.type) &&
            !ApiParamType.isRefKnex(param.type) &&
            !(param.optional === true && param.name.startsWith("_")),
        );

        // 타입 파라미터 정의
        const typeParametersAsTsType = api.typeParameters
          .map((typeParam) => apiParamTypeToTsType(typeParam, importKeys))
          .join(", ");
        const typeParamsDef = typeParametersAsTsType ? `<${typeParametersAsTsType}>` : "";
        typeParamNames = typeParamNames.concat(api.typeParameters.map((tp) => tp.id));

        // 파라미터 정의
        const paramsDef = apiParamToTsCode(paramsWithoutContext, importKeys);
        const paramNames = paramsWithoutContext.map((p) => p.name).join(", ");

        // 리턴 타입 정의
        const returnTypeDef = apiParamTypeToTsType(
          assertDefined(unwrapPromiseOnce(api.returnType)),
          importKeys,
        );

        // 기본 URL
        const apiBaseUrl = `${Sonamu.config.api.route.prefix}${api.path}`;

        const clients = api.options.clients || [];

        // 1. axios 함수 생성
        // resourceName이 있으면 get + resourceName 형태로 함수명 생성
        const methodName = api.options.resourceName
          ? `get${inflection.camelize(api.options.resourceName)}`
          : api.methodName;

        // axios-multipart 처리 (파일 업로드)
        if (clients.includes("axios-multipart")) {
          const isMultiple = api.uploadOptions?.mode === "multiple";
          const fileParamName = isMultiple ? "files" : "file";
          const fileParamType = isMultiple ? "File[]" : "File";

          const formDataAppend = isMultiple
            ? `${fileParamName}.forEach(f => { formData.append("${fileParamName}", f); });`
            : `formData.append("${fileParamName}", ${fileParamName});`;

          const otherParamsAppend = paramsWithoutContext
            .map((param) => `formData.append('${param.name}', String(${param.name}));`)
            .join("\n    ");

          const paramsDefComma = paramsDef !== "" ? ", " : "";
          functions.push(
            `
export async function ${methodName}${typeParamsDef}(
  ${paramsDef}${paramsDefComma}
  ${fileParamName}: ${fileParamType},
  onUploadProgress?: (pe: AxiosProgressEvent) => void
): Promise<${returnTypeDef}> {
  const formData = new FormData();
  ${formDataAppend}
  ${otherParamsAppend}
  return fetch({
    method: 'POST',
    url: \`${apiBaseUrl}\`,
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress,
    data: formData,
    ${api.options.timeout ? `signal: AbortSignal.timeout(${api.options.timeout}),` : ""}
  });
}
          `.trim(),
          );
        } else if (api.options.httpMethod === "GET") {
          const hasParams = paramsWithoutContext.length > 0;
          functions.push(
            `
export async function ${methodName}${typeParamsDef}(${paramsDef}): Promise<${returnTypeDef}> {
  return fetch({
    method: "GET",
    url: \`${apiBaseUrl}${hasParams ? `?\${qs.stringify({ ${paramNames} })}` : ""}\`,
    ${api.options.timeout ? `signal: AbortSignal.timeout(${api.options.timeout}),` : ""}
  });
}
          `.trim(),
          );
        } else {
          const hasParams = paramsWithoutContext.length > 0;
          functions.push(
            `
export async function ${methodName}${typeParamsDef}(${paramsDef}): Promise<${returnTypeDef}> {
  return fetch({
    method: "${api.options.httpMethod}",
    url: \`${apiBaseUrl}\`,
    ${hasParams ? `data: { ${paramNames} },` : ""}
    ${api.options.timeout ? `signal: AbortSignal.timeout(${api.options.timeout}),` : ""}
  });
}
          `.trim(),
          );
        }

        // 2. queryOptions + useQuery (tanstack-query)
        if (clients.includes("tanstack-query")) {
          const hookName = api.options.resourceName
            ? inflection.camelize(api.options.resourceName, true)
            : inflection.camelize(api.methodName, true);

          // queryOptions
          functions.push(
            `
export const ${methodName}QueryOptions = ${typeParamsDef}(${paramsDef}) => queryOptions({
  queryKey: ['${modelName}', '${methodName}'${paramNames ? `, ${paramNames}` : ""}],
  queryFn: () => ${methodName}(${paramNames})
});
          `.trim(),
          );

          // useQuery hook
          functions.push(
            `
export const use${inflection.camelize(hookName)} = ${typeParamsDef}(${paramsDef}${
              paramsDef ? ", " : ""
            }options?: { enabled?: boolean }) =>
  useQuery({
    ...${methodName}QueryOptions(${paramNames}),
    ...options
  });
          `.trim(),
          );
        }

        // 3. useMutation (tanstack-mutation)
        if (clients.includes("tanstack-mutation")) {
          const hookName = inflection.camelize(api.methodName);
          const mutationParamType =
            paramsWithoutContext.length > 0
              ? `{ ${paramsWithoutContext
                  .map((p) => `${p.name}: ${apiParamTypeToTsType(p.type, [])}`)
                  .join(", ")} }`
              : "void";
          const mutationParamNames =
            paramsWithoutContext.length > 0
              ? paramsWithoutContext.map((p) => `params.${p.name}`).join(", ")
              : "";

          functions.push(
            `
export const use${hookName}Mutation = ${typeParamsDef}() => useMutation({
  mutationFn: (params: ${mutationParamType}) => ${methodName}(${mutationParamNames})
});
          `.trim(),
          );
        }
      }

      namespaces.push(
        `
export namespace ${modelName}Service {
${functions.join("\n\n")}
}
      `.trim(),
      );
    }

    return {
      ...this.getTargetAndPath(),
      body: namespaces.join("\n\n"),
      importKeys: diff(unique(importKeys), [...typeParamNames, "ListResult"]),
      customHeaders: [
        `import { queryOptions, useQuery, useMutation } from '@tanstack/react-query';`,
        `import type { AxiosProgressEvent } from 'axios';`,
        `import qs from 'qs';`,
        `import { type ListResult, fetch } from './sonamu.shared';`,
      ],
    };
  }
}
