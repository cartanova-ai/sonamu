import { type ExtendedApi } from "../../api/decorators";
import {
  getHttpValidatorFingerprint,
  getHttpValidatorRouteIdentifier,
  getHttpValidatorRouteKey,
} from "../../api/http-validator";
import { Sonamu } from "../../api/sonamu";
import { type ApiParamType, type TemplateOptions } from "../../types/types";
import { Template } from "../template";

function collectReferencedTypes(type: ApiParamType, result: Set<string>): void {
  if (typeof type === "string") {
    return;
  }
  switch (type.t) {
    case "ref":
      result.add(type.id);
      for (const argument of type.args ?? []) {
        collectReferencedTypes(argument, result);
      }
      return;
    case "array":
      collectReferencedTypes(type.elementsType, result);
      return;
    case "object":
      for (const prop of type.props) {
        collectReferencedTypes(prop.type, result);
      }
      return;
    case "union":
    case "intersection":
      for (const member of type.types) {
        collectReferencedTypes(member, result);
      }
      return;
    case "tuple-type":
      for (const element of type.elements) {
        collectReferencedTypes(element, result);
      }
      return;
    case "indexed-access":
      collectReferencedTypes(type.object, result);
      collectReferencedTypes(type.index, result);
      return;
    case "type-param":
      if (type.constraint !== undefined) {
        collectReferencedTypes(type.constraint, result);
      }
      return;
    case "function":
      for (const parameter of type.parameters) {
        collectReferencedTypes(parameter.type, result);
      }
      collectReferencedTypes(type.returnType, result);
      return;
    case "string-literal":
    case "numeric-literal":
      return;
  }
}

export class Template__http_validators extends Template {
  constructor() {
    super("http_validators");
  }

  getTargetAndPath() {
    return {
      target: `${Sonamu.config.api.dir}/src/application`,
      path: "sonamu.validators.generated.ts",
    };
  }

  render(_: TemplateOptions["http_validators"]) {
    const apis = [...Sonamu.syncer.apis]
      .filter((api) => api.websocketOptions === undefined)
      .toSorted((left, right) =>
        getHttpValidatorRouteKey(left).localeCompare(getHttpValidatorRouteKey(right)),
      );
    const routeKeys = apis.map(getHttpValidatorRouteKey);
    const duplicateKey = routeKeys.find((key, index) => routeKeys.indexOf(key) !== index);
    if (duplicateKey !== undefined) {
      throw new Error(`중복된 HTTP validator route key: ${duplicateKey}`);
    }

    const fingerprint = getHttpValidatorFingerprint(apis);
    const policy = Sonamu.config.validation?.zodCompiler;
    const isAot = typeof policy === "object" && policy !== null && policy.api === "aot";
    const hasAotValidators = isAot && apis.length > 0;
    const referencedTypes = new Set<string>();
    for (const api of apis) {
      for (const typeParameter of api.typeParameters) {
        collectReferencedTypes(typeParameter, referencedTypes);
      }
      for (const parameter of api.parameters) {
        collectReferencedTypes(parameter.type, referencedTypes);
      }
    }
    const importKeys = [...referencedTypes]
      .filter((typeName) => Sonamu.syncer.types[typeName] !== undefined)
      .toSorted();
    const body = isAot
      ? this.renderAotRegistry(apis, fingerprint, importKeys)
      : this.renderPlainStub(apis, fingerprint);

    return {
      ...this.getTargetAndPath(),
      body,
      importKeys,
      customHeaders: [
        "/**",
        " * @generated",
        " * 직접 수정하지 마세요.",
        " */",
        "",
        "/* oxlint-disable */",
        "",
        ...(hasAotValidators
          ? [
              `import { compile } from "zod-compiler";`,
              `import { fastifyCaster, getZodObjectFromApi } from "sonamu";`,
            ]
          : []),
      ],
    };
  }

  private renderAotRegistry(
    apis: ExtendedApi[],
    fingerprint: string,
    importKeys: string[],
  ): string {
    const declarations = apis.map((api) => {
      const identifier = `validator_${getHttpValidatorRouteIdentifier(api)}`;
      const schemaApi = {
        modelName: api.modelName,
        methodName: api.methodName,
        path: api.path,
        options: { httpMethod: api.options.httpMethod ?? "GET" },
        typeParameters: api.typeParameters,
        parameters: api.parameters,
        returnType: "unknown",
      } satisfies ExtendedApi;
      return `export const ${identifier} = compile(fastifyCaster(getZodObjectFromApi(${JSON.stringify(schemaApi)}, { ...types })));`;
    });
    const routeIds = Object.fromEntries(
      apis.map((api) => [getHttpValidatorRouteKey(api), getHttpValidatorRouteIdentifier(api)]),
    );

    return [
      `export const fingerprint = ${JSON.stringify(fingerprint)};`,
      `export const routeIds = ${JSON.stringify(routeIds)};`,
      `const types = { ${importKeys.join(", ")} };`,
      ...declarations,
      `export const validators = new Map([`,
      ...apis.map((api) => {
        const routeKey = getHttpValidatorRouteKey(api);
        return `  [${JSON.stringify(routeKey)}, validator_${getHttpValidatorRouteIdentifier(api)}],`;
      }),
      `]);`,
    ].join("\n");
  }

  private renderPlainStub(apis: ExtendedApi[], fingerprint: string): string {
    const routeIds = Object.fromEntries(
      apis.map((api) => [getHttpValidatorRouteKey(api), getHttpValidatorRouteIdentifier(api)]),
    );
    return [
      `export const fingerprint = ${JSON.stringify(fingerprint)};`,
      `export const routeIds = ${JSON.stringify(routeIds)};`,
      `export const validators = new Map();`,
    ].join("\n");
  }
}
