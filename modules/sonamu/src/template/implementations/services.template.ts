import inflection from "inflection";
import { diff, unique } from "radashi";

import {
  apiParamToTsCode,
  apiParamTypeToTsType,
  unwrapPromiseOnce,
} from "../../api/code-converters";
import { type ExtendedApi } from "../../api/decorators";
import { Sonamu } from "../../api/sonamu";
import { EntityManager } from "../../entity/entity-manager";
import { type TemplateOptions } from "../../types/types";
import { ApiParamType } from "../../types/types";
import { assertDefined } from "../../utils/utils";
import { Template } from "../template";
import { BUILT_IN_TYPES, zodTypeToTsTypeDef } from "../zod-converter";

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
    const resolveWebSocketEventTypeDef = (
      typeRef: ApiParamType.Ref | undefined,
      schema: Parameters<typeof zodTypeToTsTypeDef>[0],
    ): string => {
      if (typeRef) {
        const candidateImportKeys: string[] = [];
        const candidateTypeDef = apiParamTypeToTsType(typeRef, candidateImportKeys);

        try {
          for (const key of unique(candidateImportKeys)) {
            EntityManager.getModulePath(key);
          }
          importKeys.push(...candidateImportKeys);
          return candidateTypeDef;
        } catch {
          // 로컬 const 등 import 가능한 심볼이 아니면 기존 inline 생성으로 후퇴
        }
      }

      return zodTypeToTsTypeDef(schema);
    };

    for (const [modelName, modelApis] of apisByModel) {
      const functions: string[] = [];

      for (const api of modelApis) {
        // @stream 데코레이터가 있으면 SSE 스트림 함수 생성
        if (api.streamOptions) {
          const paramsWithoutContext = api.parameters.filter(
            (param) =>
              !ApiParamType.isContext(param.type) &&
              !ApiParamType.isRefKnex(param.type) &&
              !(param.optional && param.name.startsWith("_")),
          );

          const apiBaseUrl = `${Sonamu.config.api.route.prefix}${api.path}`;

          const methodNameStream = api.options.resourceName
            ? `use${inflection.camelize(api.options.resourceName)}`
            : `use${inflection.camelize(api.methodName)}`;
          const methodNameStreamCamelized = inflection.camelize(methodNameStream, true);

          const eventsTypeDef = zodTypeToTsTypeDef(api.streamOptions.events);

          // 파라미터를 객체 형태로 정의 (타입과 실제 값 모두에 사용)
          const paramsDefAsObject =
            paramsWithoutContext.length > 0
              ? `{ ${paramsWithoutContext.map((p) => `${p.name}: ${apiParamTypeToTsType(p.type, importKeys)}`).join(", ")} }`
              : "{}";

          functions.push(
            `
export function ${methodNameStreamCamelized}(
  params: ${paramsDefAsObject},
  handlers: EventHandlers<${eventsTypeDef} & { end?: () => void }>,
  options: SSEStreamOptions
) {
  return useSSEStream<${eventsTypeDef}>(\`${apiBaseUrl}\`, params, handlers, options);
}
            `.trim(),
          );
          continue;
        }

        if (api.websocketOptions) {
          // websocket surface는 fetch 함수 대신 typed hook을 생성함
          const paramsWithoutContext = api.parameters.filter(
            (param) =>
              !ApiParamType.isContext(param.type) &&
              !ApiParamType.isRefKnex(param.type) &&
              !(param.optional && param.name.startsWith("_")),
          );

          const apiBaseUrl = `${Sonamu.config.api.route.prefix}${api.path}`;

          const methodNameWebSocket = api.options.resourceName
            ? `use${inflection.camelize(api.options.resourceName)}`
            : `use${inflection.camelize(api.methodName)}`;
          const methodNameWebSocketCamelized = inflection.camelize(methodNameWebSocket, true);

          // outEvents는 수신 타입, inEvents는 send() 입력 타입으로 사용함
          const outEventsTypeDef = resolveWebSocketEventTypeDef(
            api.websocketOptions.outEventsTypeRef,
            api.websocketOptions.outEvents,
          );
          const inEventsTypeDef = resolveWebSocketEventTypeDef(
            api.websocketOptions.inEventsTypeRef,
            api.websocketOptions.inEvents,
          );

          // context/refKnex/internal optional 파라미터는 클라이언트 입력에서 제외함
          const paramsDefAsObject =
            paramsWithoutContext.length > 0
              ? `{ ${paramsWithoutContext.map((p) => `${p.name}: ${apiParamTypeToTsType(p.type, importKeys)}`).join(", ")} }`
              : "{}";

          functions.push(
            `
export function ${methodNameWebSocketCamelized}(
  params: ${paramsDefAsObject},
  handlers: EventHandlers<${outEventsTypeDef}>,
  options: WebSocketChannelOptions = {}
) {
  return useWebSocketChannel<${outEventsTypeDef}, ${inEventsTypeDef}>(\`${apiBaseUrl}\`, params, handlers, options);
}
            `.trim(),
          );
          continue;
        }

        // Context 제외한 파라미터
        const paramsWithoutContext = api.parameters.filter(
          (param) =>
            !ApiParamType.isContext(param.type) &&
            !ApiParamType.isRefKnex(param.type) &&
            !(param.optional && param.name.startsWith("_")),
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
          const formDataAppend = `files.forEach(f => { formData.append("files", f); });`;

          const otherParamsAppend = paramsWithoutContext
            .map((param) => {
              // primitive 타입인지 체크
              const isPrimitive =
                typeof param.type === "string" &&
                ["string", "number", "boolean"].includes(param.type);

              if (isPrimitive) {
                // primitive: 직접 formData.append
                return `formData.append('${param.name}', String(${param.name}));`;
              } else {
                // object: toFormData 사용
                return `toFormData(${param.name}, formData, '${param.name}');`;
              }
            })
            .join("\n    ");

          const paramsDefComma = paramsDef !== "" ? ", " : "";
          functions.push(
            `
export async function ${methodName}${typeParamsDef}(
  ${paramsDef}${paramsDefComma}
  files: File[],
  onUploadProgress?: (pe: AxiosProgressEvent) => void
): Promise<${returnTypeDef}> {
  const formData = new FormData();
  ${formDataAppend}
  ${otherParamsAppend}
  return fetch({
    method: 'POST',
    url: \`${apiBaseUrl}\`,
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

          // useQuery hook (useRefreshable로 래핑해 refresh/isRefreshing을 기본 제공)
          functions.push(
            `
export const use${inflection.camelize(hookName)} = ${typeParamsDef}(${paramsDef}${
              paramsDef ? ", " : ""
            }options?: { enabled?: boolean }) =>
  useRefreshable(useQuery({
    ...${methodName}QueryOptions(${paramNames}),
    ...options
  }));
          `.trim(),
          );

          // infiniteQueryOptions + useInfiniteQuery (AsyncIdConfig.useListInfinite 대상 조건)
          // 조건: resourceName이 복수형이고 methodName === "findMany"
          const resourceName = api.options.resourceName;
          const isInfiniteTarget =
            !!resourceName &&
            inflection.pluralize(resourceName) === resourceName &&
            api.methodName === "findMany";

          if (isInfiniteTarget) {
            const infiniteMethodName = `${methodName}Infinite`;
            const infiniteHookName = `use${inflection.camelize(hookName)}Infinite`;

            functions.push(
              `
export const ${infiniteMethodName}QueryOptions = ${typeParamsDef}(${paramsDef}) => infiniteQueryOptions({
  queryKey: ['${modelName}', '${methodName}', 'infinite'${paramNames ? `, ${paramNames}` : ""}],
  queryFn: ({ pageParam }) => ${methodName}(${
    paramNames ? paramNames.replace(/\brawParams\b/, "{ ...rawParams, page: pageParam }") : ""
  }),
  initialPageParam: 1 as number,
  getNextPageParam: (lastPage, allPages) => {
    const total = (lastPage as { total?: number })?.total ?? 0;
    const loaded = allPages.reduce(
      (sum, p) => sum + ((p as { rows?: unknown[] })?.rows?.length ?? 0),
      0,
    );
    return loaded < total ? allPages.length + 1 : undefined;
  },
  select: dedupeAndFlatten,
});
          `.trim(),
            );

            functions.push(
              `
export const ${infiniteHookName} = ${typeParamsDef}(${paramsDef}${
                paramsDef ? ", " : ""
              }options?: { enabled?: boolean }) =>
  useRefreshable(useInfiniteQuery({
    ...${infiniteMethodName}QueryOptions(${paramNames}),
    ...options
  }));
          `.trim(),
            );
          }
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
  mutationFn: (params: ${mutationParamType}) => ${modelName}Service.${methodName}(${mutationParamNames})
});
          `.trim(),
          );
        }

        // 4. useMutation with multipart (tanstack-mutation-multipart)
        if (clients.includes("tanstack-mutation-multipart")) {
          const hookName = inflection.camelize(api.methodName);

          // 파라미터 타입 정의: paramsDef에서 타입만 추출
          // paramsDef 예: "params: { category: string }" → "{ category: string }"
          const paramsTypeDef =
            paramsWithoutContext.length > 0
              ? paramsDef.split(":").slice(1).join(":").trim() // "params: { category: string }" → "{ category: string }"
              : "";

          const mutationParamType =
            paramsWithoutContext.length > 0
              ? `{ params: ${paramsTypeDef}, files: File[] }`
              : `{ files: File[] }`;

          // mutationFn 호출 파라미터
          const mutationFnCall =
            paramsWithoutContext.length > 0
              ? `${modelName}Service.${methodName}(params.params, params.files)`
              : `${modelName}Service.${methodName}(params.files)`;

          functions.push(
            `
export const use${hookName}Mutation = ${typeParamsDef}(
  options?: UseMutationOptions<${returnTypeDef}, Error, ${mutationParamType}> & {
    onUploadProgress?: (e: AxiosProgressEvent) => void;
  }
) => useMutation({
  mutationFn: (params: ${mutationParamType}) => ${mutationFnCall},
  retry: false,
  ...options,
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

    // AsyncIdConfig 생성 (Entity별로)
    const entityIds = EntityManager.getAllIds();
    const asyncIdConfigs: string[] = [];

    for (const entityId of entityIds) {
      const names = EntityManager.getNamesFromId(entityId);

      // AsyncIdConfig용 리스트 조회 API 찾기
      const listApi = apisByModel.get(names.capital)?.find((api) => {
        // resourceName이 없거나 tanstack-query를 사용하지 않는 API는 제외
        if (!api.options.resourceName || !api.options.clients?.includes("tanstack-query")) {
          return false;
        }
        // resourceName이 복수형이고 메서드명이 findMany인 API
        const resourceName = api.options.resourceName;
        return inflection.pluralize(resourceName) === resourceName && api.methodName === "findMany";
      });

      if (listApi) {
        // resourceName에서 hook 이름 생성 (기존 로직과 동일)
        const hookName = inflection.camelize(assertDefined(listApi.options.resourceName), true);
        const useHookName = `use${inflection.camelize(hookName)}`;
        const useHookInfiniteName = `${useHookName}Infinite`;

        // ListParams 타입명 구성
        const listParamsType = `${names.capital}ListParams`;

        asyncIdConfigs.push(
          `
// AsyncIdConfig: ${names.capital}
export const ${names.capital}AsyncIdConfig: AsyncIdConfig<${names.capital}SubsetKey, ${names.capital}SubsetMapping, ${listParamsType}> = {
  placeholderKey: "entity.${names.capital}",
  useList: ${names.capital}Service.${useHookName},
  useListInfinite: ${names.capital}Service.${useHookInfiniteName},
};
          `.trim(),
        );
      }
    }

    // BUILT_IN_TYPES에서 사용되는 타입들을 확인하여 동적으로 import 구성
    const builtInTypeImports = Object.keys(BUILT_IN_TYPES)
      .filter((typeKey) => importKeys.includes(typeKey))
      .map((typeKey) => `type ${typeKey}`);

    // sonamu.shared에서 import할 항목들을 동적으로 구성
    // body 문자열을 기준으로 infinite 훅 생성 여부 판단 (findMany 복수형 분기에서만 참조됨)
    const bodyForImportCheck = namespaces.join("\n\n");
    const needsDedupeAndFlatten = bodyForImportCheck.includes("dedupeAndFlatten");
    const needsUseRefreshable = bodyForImportCheck.includes("useRefreshable");

    const sonamuSharedImports = [
      "type ListResult",
      "type FilterQuery",
      ...builtInTypeImports,
      "fetch",
      "type EventHandlers",
      "type SSEStreamOptions",
      "type WebSocketChannelOptions",
      "useSSEStream",
      "useWebSocketChannel",
      "toFormData",
      ...(needsDedupeAndFlatten ? ["dedupeAndFlatten"] : []),
      ...(needsUseRefreshable ? ["useRefreshable"] : []),
    ].join(", ");

    // body 구성: namespaces + asyncIdConfigs
    const bodyParts = [...namespaces, ...asyncIdConfigs];

    return {
      ...this.getTargetAndPath(),
      body: bodyParts.join("\n\n"),
      importKeys: diff(unique(importKeys), [
        ...typeParamNames,
        "ListResult",
        ...Object.keys(BUILT_IN_TYPES),
      ]),
      customHeaders: [
        "/**",
        " * @generated",
        " * 직접 수정하지 마세요.",
        " */",
        "",
        "/* oxlint-disable */",
        "",
        `import { queryOptions, useQuery, useInfiniteQuery, infiniteQueryOptions, useMutation, type UseMutationOptions } from '@tanstack/react-query';`,
        `import { type AxiosProgressEvent } from 'axios';`,
        `import qs from 'qs';`,
        `import { ${sonamuSharedImports} } from './sonamu.shared';`,
        `import { type AsyncIdConfig } from '@sonamu-kit/react-components/components';`,
      ],
    };
  }
}
