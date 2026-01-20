import inflection from "inflection";
import { diff, unique } from "radashi";
import { apiParamToTsCode, apiParamTypeToTsType } from "../../api/code-converters";
import type { ExtendedApi } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import type { TemplateOptions } from "../../types/types";
import { ApiParamType } from "../../types/types";
import { Template } from "../template";

export class Template__queries extends Template {
  constructor() {
    super("queries");
  }

  getTargetAndPath() {
    const { dir } = Sonamu.config.api;
    return {
      target: `${dir}/src/application`,
      path: `queries.generated.ts`,
    };
  }

  render({}: TemplateOptions["queries"]) {
    const { apis } = Sonamu.syncer;

    // tanstack-query를 포함한 API만 필터링
    const queryApis = apis.filter((api) => api.options.clients?.includes("tanstack-query"));

    // 모델별로 그룹화
    const apisByModel = new Map<string, ExtendedApi[]>();
    for (const api of queryApis) {
      const modelName = api.modelName.replace(/Model$/, "").replace(/Frame$/, "");
      if (!apisByModel.has(modelName)) {
        apisByModel.set(modelName, []);
      }
      apisByModel.get(modelName)?.push(api);
    }

    const namespaces: string[] = [];
    const importKeys: string[] = [];
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

        // 타입 파라미터 이름 수집
        typeParamNames = typeParamNames.concat(api.typeParameters.map((tp) => tp.id));

        // 타입 파라미터 정의
        const typeParametersAsTsType = api.typeParameters
          .map((typeParam) => {
            return apiParamTypeToTsType(typeParam, importKeys);
          })
          .join(", ");
        const typeParamsDef = typeParametersAsTsType ? `<${typeParametersAsTsType}>` : "";

        // 파라미터 정의
        const paramsDef = apiParamToTsCode(paramsWithoutContext, importKeys);
        const paramNames = paramsWithoutContext.map((p) => p.name).join(", ");

        // serviceMethodName 계산 (services.template.ts와 동일한 로직)
        const serviceMethodName = api.options.resourceName
          ? `get${inflection.camelize(api.options.resourceName)}`
          : api.methodName;

        // SSRQuery 함수 생성 (함수명도 serviceMethodName 사용)
        functions.push(
          `
  export const ${serviceMethodName} = ${typeParamsDef}(${paramsDef}): SSRQuery =>
    createSSRQuery('${api.modelName}', '${api.methodName}', [${paramNames}], ['${modelName}', '${serviceMethodName}']);
          `.trim(),
        );
      }

      namespaces.push(
        `
export namespace ${modelName}Service {
${functions.join("\n\n")}
}
      `.trim(),
      );
    }

    // tanstack-query API가 없으면 헬퍼 함수와 import를 포함하지 않습니다.
    // 새 프로젝트에서 첫 빌드 시 sync가 아직 안 되어 namespace가 비어있을 수 있고,
    // 이때 createSSRQuery가 unused로 빌드 에러가 발생하는 것을 방지합니다.
    const hasQueries = namespaces.length > 0;

    return {
      ...this.getTargetAndPath(),
      body: namespaces.join("\n\n"),
      importKeys: diff(unique(importKeys), typeParamNames),
      customHeaders: hasQueries
        ? [
            "/** biome-ignore-all lint: generated는 무시 */",
            "/** biome-ignore-all assist: generated는 무시 */",
            "",
            `import type { SSRQuery } from 'sonamu/ssr';`,
            "",
            `// SSRQuery 헬퍼 함수`,
            `function createSSRQuery(modelName: string, methodName: string, params: any[], serviceKey: [string, string]): SSRQuery {`,
            `  return { modelName, methodName, params, serviceKey, __brand: 'SSRQuery' } as SSRQuery;`,
            `}`,
            "",
          ]
        : [
            "/** biome-ignore-all lint: generated는 무시 */",
            "/** biome-ignore-all assist: generated는 무시 */",
            "",
          ],
    };
  }
}
