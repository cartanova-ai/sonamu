import path, { dirname } from "path";
import { globAsync, importMultiple } from "../utils/utils";
import fs from "fs-extra";
import crypto from "crypto";
import equal from "fast-deep-equal";
import _ from "lodash";
import inflection from "inflection";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import ts from "typescript";
import {
  ApiParam,
  ApiParamType,
  isBelongsToOneRelationProp,
  isBigIntegerProp,
  isBooleanProp,
  isDateProp,
  isDateTimeProp,
  isDecimalProp,
  isDoubleProp,
  isEnumProp,
  isFloatProp,
  isIntegerProp,
  isJsonProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringProp,
  isTextProp,
  isTimeProp,
  isTimestampProp,
  isUuidProp,
  isVirtualProp,
  EntityProp,
  EntityPropNode,
  SQLDateTimeString,
} from "../types/types";
import {
  ApiDecoratorOptions,
  registeredApis,
  ExtendedApi,
} from "../api/decorators";
import { z } from "zod";
import chalk from "chalk";
import {
  TemplateKey,
  PathAndCode,
  TemplateOptions,
  GenerateOptions,
  RenderingNode,
} from "../types/types";
import {
  AlreadyProcessedException,
  BadRequestException,
  ServiceUnavailableException,
} from "../exceptions/so-exceptions";
import { wrapIf } from "../utils/lodash-able";
import { getTextTypeLength } from "../api/code-converters";
import { Template } from "../templates/base-template";
import { Template__generated } from "../templates/generated.template";
import { Template__init_types } from "../templates/init_types.template";
import { Template__entity } from "../templates/entity.template";
import { Template__model } from "../templates/model.template";
import { Template__model_test } from "../templates/model_test.template";
import { Template__service } from "../templates/service.template";
import { Template__view_form } from "../templates/view_form.template";
import { Template__view_list } from "../templates/view_list.template";
import prettier from "prettier";
import { Template__view_id_all_select } from "../templates/view_id_all_select.template";
import { Template__view_id_async_select } from "../templates/view_id_async_select.template";
import { Template__view_enums_dropdown } from "../templates/view_enums_dropdown.template";
import { Template__view_enums_select } from "../templates/view_enums_select.template";
import { Template__view_enums_buttonset } from "../templates/view_enums_buttonset.template";
import { Template__view_search_input } from "../templates/view_search_input.template";
import { Template__view_list_columns } from "../templates/view_list_columns.template";
import { Template__generated_http } from "../templates/generated_http.template";
import { Sonamu } from "../api/sonamu";
import { execSync } from "child_process";
import { Template__generated_sso } from "../templates/generated_sso.template";
import { setTimeout as setTimeoutPromises } from "timers/promises";

type FileType =
  | "model"
  | "types"
  | "functions"
  | "generated"
  | "entity"
  | "frame";
type GlobPattern = {
  [key in FileType]: string;
};
type PathAndChecksum = {
  path: string;
  checksum: string;
};
type DiffGroups = {
  [key in FileType]: string[];
};
export type RenderedTemplate = {
  target: string;
  path: string;
  body: string;
  importKeys: string[];
  customHeaders?: string[];
  preTemplates?: {
    key: TemplateKey;
    options: TemplateOptions[TemplateKey];
  }[];
};

export class Syncer {
  apis: {
    typeParameters: ApiParamType.TypeParam[];
    parameters: ApiParam[];
    returnType: ApiParamType;
    modelName: string;
    methodName: string;
    path: string;
    options: ApiDecoratorOptions;
  }[] = [];
  types: { [typeName: string]: z.ZodObject<any> } = {};
  models: { [modelName: string]: unknown } = {};
  isSyncing: boolean = false;

  get checksumsPath(): string {
    return path.join(Sonamu.apiRootPath, "/.so-checksum");
  }
  public constructor() {}

  async sync(): Promise<void> {
    const { targets } = Sonamu.config.sync;

    // 번들러 여부에 따라 현재 디렉토리가 바뀌므로
    const currentDirname = __dirname.endsWith("/syncer")
      ? __dirname
      : path.join(__dirname, "./syncer");

    // 트리거와 무관하게 shared 분배
    await Promise.all(
      targets.map(async (target) => {
        const srcCodePath = path
          .join(currentDirname, `../shared/${target}.shared.ts.txt`)
          .replace("/dist/", "/src/");
        if (!fs.existsSync(srcCodePath)) {
          return;
        }

        const dstCodePath = path.join(
          Sonamu.appRootPath,
          target,
          "src/services/sonamu.shared.ts"
        );

        const srcChecksum = await this.getChecksumOfFile(srcCodePath);
        const dstChecksum = await (async () => {
          if (fs.existsSync(dstCodePath) === false) {
            return "";
          }
          return this.getChecksumOfFile(dstCodePath);
        })();

        if (srcChecksum === dstChecksum) {
          return;
        }
        fs.writeFileSync(dstCodePath, fs.readFileSync(srcCodePath));
        console.log(chalk.blue("shared.ts is synced"));
      })
    );

    // 현재 checksums
    let currentChecksums = await this.getCurrentChecksums();
    // 이전 checksums
    const previousChecksums = await this.getPreviousChecksums();

    // 비교
    const isSame = equal(currentChecksums, previousChecksums);
    if (isSame) {
      const msg = "Every files are synced!";
      const margin = (process.stdout.columns - msg.length) / 2;
      console.log(
        chalk.black.bgGreen(" ".repeat(margin) + msg + " ".repeat(margin))
      );
      return;
    }

    const abc = new AbortController();
    this.isSyncing = true;
    const onSIGUSR2 = async () => {
      if (this.isSyncing === false) {
        process.exit(0);
      }
      console.log(chalk.magentaBright(`wait for syncing done....`));

      // 싱크 완료 대기
      try {
        await setTimeoutPromises(20000, "waiting-sync", { signal: abc.signal });
      } catch {}
      console.log(chalk.magentaBright(`Syncing DONE!`));
      process.exit(0);
    };
    process.on("SIGUSR2", onSIGUSR2);

    // 변경된 파일 찾기
    const diff = _.differenceWith(
      currentChecksums,
      previousChecksums,
      _.isEqual
    );
    const diffFiles = diff.map((r) => r.path);
    console.log("Changed Files: ", diffFiles);

    // 다른 부분 찾아 액션
    const diffGroups = _.groupBy(diffFiles, (r) => {
      const matched = r.match(
        /\.(model|types|functions|entity|generated|frame)\.[tj]s/
      );
      return matched![1];
    }) as unknown as DiffGroups;

    // 변경된 파일들을 타입별로 분리하여 각 타입별 액션 처리
    const diffTypes = Object.keys(diffGroups);

    // 트리거: entity, types
    // 액션: 스키마 생성
    if (diffTypes.includes("entity") || diffTypes.includes("types")) {
      console.log("// 액션: 스키마 생성");
      await this.actionGenerateSchemas();

      // generated 싱크까지 동시에 처리 후 체크섬 갱신
      diffGroups["generated"] = _.uniq([
        ...(diffGroups["generated"] ?? []),
        "/src/application/sonamu.generated.ts",
      ]);
      diffTypes.push("generated");
      currentChecksums = await this.getCurrentChecksums();
    }

    // 트리거: types, enums, generated 변경시
    // 액션: 파일 싱크 types, enums, generated
    if (
      diffTypes.includes("types") ||
      diffTypes.includes("functions") ||
      diffTypes.includes("generated")
    ) {
      console.log("// 액션: 파일 싱크 types / functions / generated");

      const tsPaths = _.uniq(
        [
          ...(diffGroups["types"] ?? []),
          ...(diffGroups["functions"] ?? []),
          ...(diffGroups["generated"] ?? []),
        ].map((p) => p.replace("/dist/", "/src/").replace(".js", ".ts"))
      );
      await this.actionSyncFilesToTargets(tsPaths);
    }

    // 트리거: model
    if (diffTypes.includes("model") || diffTypes.includes("frame")) {
      console.log("// 액션: 서비스 생성");
      const mergedGroup = [
        ...(diffGroups["model"] ?? []),
        ...(diffGroups["frame"] ?? []),
      ];
      const params: { namesRecord: EntityNamesRecord; modelTsPath: string }[] =
        mergedGroup.map((modelPath) => {
          if (modelPath.endsWith(".model.js")) {
            const entityId = this.getEntityIdFromPath([modelPath])[0];
            return {
              namesRecord: EntityManager.getNamesFromId(entityId),
              modelTsPath: path.join(
                Sonamu.apiRootPath,
                modelPath
                  .replace("/dist/", "/src/")
                  .replace(".model.js", ".model.ts")
              ),
            };
          }
          if (modelPath.endsWith("frame.js")) {
            const [, frameName] = modelPath.match(/.+\/(.+)\.frame.js$/) ?? [];
            return {
              namesRecord: EntityManager.getNamesFromId(frameName),
              modelTsPath: path.join(
                Sonamu.apiRootPath,
                modelPath
                  .replace("/dist/", "/src/")
                  .replace(".frame.js", ".frame.ts")
              ),
            };
          }
          throw new Error("not reachable");
        });
      await this.actionGenerateServices(params);

      console.log("// 액션: HTTP파일 생성");
      await this.actionGenerateHttps();
    }

    // 저장
    await this.saveChecksums(currentChecksums);

    // 싱크 종료
    this.isSyncing = false;
    abc.abort();
    process.off("SIGUSR2", onSIGUSR2);
  }

  getEntityIdFromPath(filePaths: string[]): string[] {
    return _.uniq(
      filePaths.map((p) => {
        const matched = p.match(/application\/(.+)\//);
        return inflection.camelize(matched![1].replace(/\-/g, "_"));
      })
    );
  }

  async actionGenerateSchemas(): Promise<string[]> {
    return (
      await Promise.all([
        this.generateTemplate("generated_sso", {}, { overwrite: true }),
        this.generateTemplate("generated", {}, { overwrite: true }),
      ])
    )
      .flat()
      .flat();
  }

  async actionGenerateServices(
    paramsArray: {
      namesRecord: EntityNamesRecord;
      modelTsPath: string;
    }[]
  ): Promise<string[]> {
    return (
      await Promise.all(
        paramsArray.map(async (params) =>
          this.generateTemplate("service", params, {
            overwrite: true,
          })
        )
      )
    )
      .flat()
      .flat();
  }

  async actionGenerateHttps(): Promise<string[]> {
    const [res] = await this.generateTemplate(
      "generated_http",
      {},
      { overwrite: true }
    );
    return res;
  }

  async copyFileWithReplaceCoreToShared(fromPath: string, toPath: string) {
    if (!fs.existsSync(fromPath)) {
      return;
    }

    const oldFileContent = fs.readFileSync(fromPath).toString();

    const newFileContent = (() => {
      const nfc = oldFileContent.replace(
        /from "sonamu"/g,
        `from "src/services/sonamu.shared"`
      );

      if (toPath.includes("/web/")) {
        return nfc.replace(/from "lodash";/g, `from "lodash-es";`);
      } else {
        return nfc;
      }
    })();
    return fs.writeFile(toPath, newFileContent);
  }

  async actionSyncFilesToTargets(tsPaths: string[]): Promise<string[]> {
    const { targets } = Sonamu.config.sync;
    const { dir: apiDir } = Sonamu.config.api;
    const { appRootPath } = Sonamu;

    return (
      await Promise.all(
        targets.map(async (target) =>
          Promise.all(
            tsPaths.map(async (src) => {
              const realSrc = Sonamu.apiRootPath + src;
              const dst = realSrc
                .replace(`/${apiDir}/`, `/${target}/`)
                .replace("/application/", "/services/");
              const dir = dirname(dst);
              if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
              }
              console.log(
                "COPIED ",
                chalk.blue(dst.replace(appRootPath + "/", ""))
              );
              await this.copyFileWithReplaceCoreToShared(realSrc, dst);
              return dst;
            })
          )
        )
      )
    ).flat();
  }

  async getCurrentChecksums(): Promise<PathAndChecksum[]> {
    const PatternGroup: GlobPattern = {
      /* 원본 체크 */
      entity: Sonamu.apiRootPath + "/src/application/**/*.entity.json",
      types: Sonamu.apiRootPath + "/src/application/**/*.types.ts",
      generated: Sonamu.apiRootPath + "/src/application/sonamu.generated.ts",
      functions: Sonamu.apiRootPath + "/src/application/**/*.functions.ts",
      /* compiled-JS 체크 */
      model: Sonamu.apiRootPath + "/dist/application/**/*.model.js",
      frame: Sonamu.apiRootPath + "/dist/application/**/*.frame.js",
    };

    const filePaths = (
      await Promise.all(
        Object.entries(PatternGroup).map(async ([_fileType, pattern]) => {
          return globAsync(pattern);
        })
      )
    )
      .flat()
      .sort();

    const fileChecksums: {
      path: string;
      checksum: string;
    }[] = await Promise.all(
      filePaths.map(async (filePath) => {
        return {
          path: filePath.substring(Sonamu.apiRootPath.length),
          checksum: await this.getChecksumOfFile(filePath),
        };
      })
    );
    return fileChecksums;
  }

  async getPreviousChecksums(): Promise<PathAndChecksum[]> {
    if (fs.existsSync(this.checksumsPath) === false) {
      return [];
    }

    const previousChecksums = (await fs.readJSON(
      this.checksumsPath
    )) as PathAndChecksum[];
    return previousChecksums;
  }

  async saveChecksums(checksums: PathAndChecksum[]): Promise<void> {
    await fs.writeJSON(this.checksumsPath, checksums, {
      spaces: 2,
    });
    console.log("checksum saved", this.checksumsPath);
  }

  async getChecksumOfFile(filePath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash("sha1");
      const input = fs.createReadStream(filePath);
      input.on("error", reject);
      input.on("data", function (chunk: any) {
        hash.update(chunk);
      });
      input.on("close", function () {
        resolve(hash.digest("hex"));
      });
    });
  }

  async readApisFromFile(filePath: string) {
    const sourceFile = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath).toString(),
      ts.ScriptTarget.Latest
    );

    const methods: Omit<ExtendedApi, "path" | "options">[] = [];
    let modelName: string = "UnknownModel";
    let methodName: string = "unknownMethod";
    const visitor = (node: ts.Node) => {
      if (ts.isClassDeclaration(node)) {
        if (node.name && ts.isIdentifier(node.name)) {
          modelName = node.name.escapedText.toString().replace(/Class$/, "");
        }
      }
      if (ts.isMethodDeclaration(node)) {
        if (ts.isIdentifier(node.name)) {
          methodName = node.name.escapedText.toString();
        }

        const typeParameters: ApiParamType.TypeParam[] = (
          node.typeParameters ?? []
        ).map((typeParam) => {
          const tp = typeParam as ts.TypeParameterDeclaration;

          return {
            t: "type-param",
            id: tp.name.escapedText.toString(),
            constraint: tp.constraint
              ? this.resolveTypeNode(tp.constraint)
              : undefined,
          };
        });
        const parameters: ApiParam[] = node.parameters.map(
          (paramDec, index) => {
            const defaultDef = this.printNode(paramDec.initializer, sourceFile);

            // 기본값이 있는 경우 paramDec.type가 undefined로 나옴

            return this.resolveParamDec(
              {
                name: paramDec.name,
                type: paramDec.type as ts.TypeNode,
                optional:
                  paramDec.questionToken !== undefined ||
                  paramDec.initializer !== undefined,
                defaultDef,
              },
              index
            );
          }
        );
        if (node.type === undefined) {
          throw new Error(
            `리턴 타입이 기재되지 않은 메소드 ${modelName}.${methodName}`
          );
        }
        const returnType = this.resolveTypeNode(node.type!);

        methods.push({
          modelName,
          methodName,
          typeParameters,
          parameters,
          returnType,
        });
      }
      ts.forEachChild(node, visitor);
    };
    visitor(sourceFile);

    if (methods.length === 0) {
      return [];
    }

    // 현재 파일의 등록된 API 필터
    const currentModelApis = registeredApis.filter((api) => {
      return methods.find(
        (method) =>
          method.modelName === api.modelName &&
          method.methodName === api.methodName
      );
    });
    if (currentModelApis.length === 0) {
      // const p = path.join(tmpdir(), "sonamu-syncer-error.json");
      // writeFileSync(p, JSON.stringify(registeredApis, null, 2));
      // execSync(`open ${p}`);
      throw new Error(`현재 파일에 사전 등록된 API가 없습니다. ${filePath}`);
    }

    // 등록된 API에 현재 메소드 타입 정보 확장
    const extendedApis = currentModelApis.map((api) => {
      const foundMethod = methods.find(
        (method) =>
          method.modelName === api.modelName &&
          method.methodName === api.methodName
      );
      return {
        ...api,
        typeParameters: foundMethod!.typeParameters,
        parameters: foundMethod!.parameters,
        returnType: foundMethod!.returnType,
      };
    });
    return extendedApis;
  }

  resolveTypeNode(typeNode: ts.TypeNode): ApiParamType {
    switch (typeNode?.kind) {
      case ts.SyntaxKind.AnyKeyword:
        return "any";
      case ts.SyntaxKind.UnknownKeyword:
        return "unknown";
      case ts.SyntaxKind.StringKeyword:
        return "string";
      case ts.SyntaxKind.NumberKeyword:
        return "number";
      case ts.SyntaxKind.BooleanKeyword:
        return "boolean";
      case ts.SyntaxKind.UndefinedKeyword:
        return "undefined";
      case ts.SyntaxKind.NullKeyword:
        return "null";
      case ts.SyntaxKind.VoidKeyword:
        return "void";
      case ts.SyntaxKind.LiteralType:
        const literal = (typeNode as ts.LiteralTypeNode).literal;
        if (ts.isStringLiteral(literal)) {
          return {
            t: "string-literal",
            value: literal.text,
          };
        } else if (ts.isNumericLiteral(literal)) {
          return {
            t: "numeric-literal",
            value: Number(literal.text),
          };
        } else {
          if (literal.kind === ts.SyntaxKind.NullKeyword) {
            return "null";
          } else if (literal.kind === ts.SyntaxKind.UndefinedKeyword) {
            return "undefined";
          } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
            return "true";
          } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
            return "false";
          }
          throw new Error("알 수 없는 리터럴");
        }
      case ts.SyntaxKind.ArrayType:
        const arrNode = typeNode as ts.ArrayTypeNode;
        return {
          t: "array",
          elementsType: this.resolveTypeNode(arrNode.elementType),
        };
      case ts.SyntaxKind.TypeLiteral:
        const literalNode = typeNode as ts.TypeLiteralNode;
        return {
          t: "object",
          props: literalNode.members.map((member) => {
            if (ts.isIndexSignatureDeclaration(member)) {
              const res = this.resolveParamDec({
                name: member.parameters[0].name as ts.Identifier,
                type: member.parameters[0].type as ts.TypeNode,
              });

              return this.resolveParamDec({
                name: {
                  escapedText: `[${res.name}${res.optional ? "?" : ""}: ${
                    res.type
                  }]`,
                } as ts.Identifier,
                type: member.type as ts.TypeNode,
              });
            } else {
              return this.resolveParamDec({
                name: (member as ts.PropertySignature).name as ts.Identifier,
                type: (member as ts.PropertySignature).type as ts.TypeNode,
                optional:
                  (member as ts.PropertySignature).questionToken !== undefined,
              });
            }
          }),
        };
      case ts.SyntaxKind.TypeReference:
        return {
          t: "ref",
          id: (
            (typeNode as ts.TypeReferenceNode).typeName as ts.Identifier
          ).escapedText.toString(),
          args: (typeNode as ts.TypeReferenceNode).typeArguments?.map(
            (typeArg) => this.resolveTypeNode(typeArg)
          ),
        };
      case ts.SyntaxKind.UnionType:
        return {
          t: "union",
          types: (typeNode as ts.UnionTypeNode).types.map((type) =>
            this.resolveTypeNode(type)
          ),
        };
      case ts.SyntaxKind.IntersectionType:
        return {
          t: "intersection",
          types: (typeNode as ts.IntersectionTypeNode).types.map((type) =>
            this.resolveTypeNode(type)
          ),
        };
      case ts.SyntaxKind.IndexedAccessType:
        return {
          t: "indexed-access",
          object: this.resolveTypeNode(
            (typeNode as ts.IndexedAccessTypeNode).objectType
          ),
          index: this.resolveTypeNode(
            (typeNode as ts.IndexedAccessTypeNode).indexType
          ),
        };
      case ts.SyntaxKind.TupleType:
        if (ts.isTupleTypeNode(typeNode)) {
          return {
            t: "tuple-type",
            elements: typeNode.elements.map((elem) =>
              this.resolveTypeNode(elem)
            ),
          };
        }
        break;
      case undefined:
        throw new Error(`typeNode undefined`);
    }

    console.debug(typeNode);
    throw new Error(`알 수 없는 SyntaxKind ${typeNode.kind}`);
  }

  resolveParamDec = (
    paramDec: {
      name: ts.BindingName;
      type: ts.TypeNode;
      optional?: boolean;
      defaultDef?: string;
    },
    index: number = 0
  ): ApiParam => {
    const name = paramDec.name as ts.Identifier;
    const type = this.resolveTypeNode(paramDec.type);

    if (name === undefined) {
      console.debug({ name, type, paramDec });
    }

    const result: ApiParam = {
      name: name.escapedText ? name.escapedText.toString() : `nonameAt${index}`,
      type,
      optional: paramDec.optional === true,
      defaultDef: paramDec?.defaultDef,
    };

    // 구조분해할당의 경우 타입이름 사용
    if (
      ts.isObjectBindingPattern(name) &&
      ts.isTypeReferenceNode(paramDec.type) &&
      ts.isIdentifier(paramDec.type.typeName)
    ) {
      result.name = inflection.camelize(paramDec.type.typeName.text, true);
    }

    return result;
  };

  printNode(
    node: ts.Node | undefined,
    sourceFile: ts.SourceFile
  ): string | undefined {
    if (node === undefined) {
      return undefined;
    }

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  }

  async autoloadApis() {
    const pathPattern = path.join(
      Sonamu.apiRootPath,
      "/src/application/**/*.{model,frame}.ts"
    );
    // console.debug(chalk.yellow(`autoload:APIs @ ${pathPattern}`));

    const filePaths = await globAsync(pathPattern);
    const result = await Promise.all(
      filePaths.map((filePath) => this.readApisFromFile(filePath))
    );
    this.apis = result.flat();
    return this.apis;
  }

  async autoloadModels(): Promise<{ [modelName: string]: unknown }> {
    const pathPattern = path.join(
      Sonamu.apiRootPath,
      "dist/application/**/*.{model,frame}.js"
    );
    // console.debug(chalk.yellow(`autoload:models @ ${pathPattern}`));

    const filePaths = (await globAsync(pathPattern)).filter((path) => {
      // src 디렉터리 내에 있는 해당 파일이 존재할 경우에만 로드
      // 삭제된 파일이지만 dist에 남아있는 경우 BaseSchema undefined 에러 방지
      const srcPath = path.replace("/dist/", "/src/").replace(".js", ".ts");
      return fs.existsSync(srcPath);
    });
    const modules = await importMultiple(filePaths);
    const functions = modules
      .map(({ imported }) => Object.entries(imported))
      .flat();
    this.models = Object.fromEntries(
      functions.filter(
        ([name]) => name.endsWith("Model") || name.endsWith("Frame")
      )
    );
    return this.models;
  }

  async autoloadTypes(
    doRefresh: boolean = false
  ): Promise<{ [typeName: string]: z.ZodObject<any> }> {
    if (!doRefresh && Object.keys(this.types).length > 0) {
      return this.types;
    }

    const pathPatterns = [
      path.join(Sonamu.apiRootPath, "/dist/application/**/*.types.js"),
      path.join(Sonamu.apiRootPath, "/dist/application/**/*.generated.js"),
    ];
    // console.debug(chalk.magenta(`autoload:types @ ${pathPatterns.join("\n")}`));

    const filePaths = (
      await Promise.all(pathPatterns.map((pattern) => globAsync(pattern)))
    )
      .flat()
      .filter((path) => {
        // src 디렉터리 내에 있는 해당 파일이 존재할 경우에만 로드
        // 삭제된 파일이지만 dist에 남아있는 경우 BaseSchema undefined 에러 방지
        const srcPath = path.replace("/dist/", "/src/").replace(".js", ".ts");
        return fs.existsSync(srcPath);
      });
    const modules = await importMultiple(filePaths, doRefresh);
    const functions = modules
      .map(({ imported }) => Object.entries(imported))
      .flat();
    this.types = Object.fromEntries(
      functions.filter(([, f]) => f instanceof z.ZodType)
    ) as typeof this.types;
    return this.types;
  }

  getTemplate(key: TemplateKey): Template {
    if (key === "entity") {
      return new Template__entity();
    } else if (key === "init_types") {
      return new Template__init_types();
    } else if (key === "generated") {
      return new Template__generated();
    } else if (key === "generated_sso") {
      return new Template__generated_sso();
    } else if (key === "generated_http") {
      return new Template__generated_http();
    } else if (key === "model") {
      return new Template__model();
    } else if (key === "model_test") {
      return new Template__model_test();
    } else if (key === "service") {
      return new Template__service();
    } else if (key === "view_list") {
      return new Template__view_list();
    } else if (key === "view_list_columns") {
      return new Template__view_list_columns();
    } else if (key === "view_search_input") {
      return new Template__view_search_input();
    } else if (key === "view_form") {
      return new Template__view_form();
    } else if (key === "view_id_all_select") {
      return new Template__view_id_all_select();
    } else if (key === "view_id_async_select") {
      return new Template__view_id_async_select();
    } else if (key === "view_enums_select") {
      return new Template__view_enums_select();
    } else if (key === "view_enums_dropdown") {
      return new Template__view_enums_dropdown();
    } else if (key === "view_enums_buttonset") {
      return new Template__view_enums_buttonset();
    } else {
      throw new BadRequestException(`잘못된 템플릿 키 ${key}`);
    }
  }

  async renderTemplate<T extends keyof TemplateOptions>(
    key: T,
    options: TemplateOptions[T]
  ): Promise<PathAndCode[]> {
    const template: Template = this.getTemplate(key);

    let extra: unknown[] = [];
    if (key === "service") {
      // service 필요 정보 (API 리스트)
      const { modelTsPath } = options as TemplateOptions["service"];
      extra = [await this.readApisFromFile(modelTsPath)];
    } else if (["model", "view_list", "view_form"].includes(key)) {
      const entityId = (options as TemplateOptions["model"]).entityId;
      if (key === "view_list" || key === "model") {
        // view_list 필요 정보 (컬럼 노드, 리스트파라미터 노드)
        const columnsNode = await this.getColumnsNode(entityId, "A");
        const listParamsZodType = await this.getZodTypeById(
          `${entityId}ListParams`
        );
        const listParamsNode = this.zodTypeToRenderingNode(listParamsZodType);
        extra = [columnsNode, listParamsNode];
      } else if (key === "view_form") {
        // view_form 필요 정보 (세이브파라미터 노드)
        const saveParamsZodType = await this.getZodTypeById(
          `${entityId}SaveParams`
        );
        const saveParamsNode = this.zodTypeToRenderingNode(saveParamsZodType);
        extra = [saveParamsNode];
      }
    }

    const rendered = await template.render(options, ...extra);
    const resolved = await this.resolveRenderedTemplate(key, rendered);

    let preTemplateResolved: PathAndCode[] = [];
    if (rendered.preTemplates) {
      preTemplateResolved = (
        await Promise.all(
          rendered.preTemplates.map(({ key, options }) => {
            return this.renderTemplate(key, options);
          })
        )
      ).flat();
    }

    return [resolved, ...preTemplateResolved];
  }

  async resolveRenderedTemplate(
    key: TemplateKey,
    result: RenderedTemplate
  ): Promise<PathAndCode> {
    const { target, path: filePath, body, importKeys, customHeaders } = result;

    // import 할 대상의 대상 path 추출
    const importDefs = importKeys
      .reduce(
        (r, importKey) => {
          const modulePath = EntityManager.getModulePath(importKey);
          let importPath = modulePath;
          if (modulePath.includes("/") || modulePath.includes(".")) {
            importPath = wrapIf(
              path.relative(path.dirname(filePath), modulePath),
              (p) => [p.startsWith(".") === false, "./" + p]
            );
          }

          // 같은 파일에서 import 하는 경우 keys 로 나열 처리
          const existsOne = r.find(
            (importDef) => importDef.from === importPath
          );
          if (existsOne) {
            existsOne.keys = _.uniq(existsOne.keys.concat(importKey));
          } else {
            r.push({
              keys: [importKey],
              from: importPath,
            });
          }
          return r;
        },
        [] as {
          keys: string[];
          from: string;
        }[]
      )
      // 셀프 참조 방지
      .filter(
        (importDef) =>
          filePath.endsWith(importDef.from.replace("./", "") + ".ts") === false
      );

    // 커스텀 헤더 포함하여 헤더 생성
    const header = [
      ...(customHeaders ?? []),
      ...importDefs.map(
        (importDef) =>
          `import { ${importDef.keys.join(", ")} } from '${importDef.from}'`
      ),
    ].join("\n");

    const formatted = await (async () => {
      if (key === "generated_http") {
        return [header, body].join("\n\n");
      } else {
        return prettier.format([header, body].join("\n\n"), {
          parser: key === "entity" ? "json" : "typescript",
        });
      }
    })();

    return {
      path: target + "/" + filePath,
      code: formatted,
    };
  }

  async writeCodeToPath(pathAndCode: PathAndCode): Promise<string[]> {
    const { targets } = Sonamu.config.sync;
    const { appRootPath } = Sonamu;
    const filePath = `${Sonamu.appRootPath}/${pathAndCode.path}`;

    const dstFilePaths = _.uniq(
      targets.map((target) => filePath.replace("/:target/", `/${target}/`))
    );
    return await Promise.all(
      dstFilePaths.map(async (dstFilePath) => {
        const dir = path.dirname(dstFilePath);
        if (fs.existsSync(dir) === false) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dstFilePath, pathAndCode.code);
        console.log(
          "GENERATED ",
          chalk.blue(dstFilePath.replace(appRootPath + "/", ""))
        );
        return dstFilePath;
      })
    );
  }

  async generateTemplate(
    key: TemplateKey,
    templateOptions: any,
    _generateOptions?: GenerateOptions
  ) {
    const generateOptions = {
      overwrite: false,
      ..._generateOptions,
    };

    // 키 children
    const keys: TemplateKey[] = [key];

    // 템플릿 렌더
    const pathAndCodes = (
      await Promise.all(
        keys.map(async (key) => {
          return await this.renderTemplate(key, templateOptions);
        })
      )
    ).flat();

    const filteredPathAndCodes: PathAndCode[] = (() => {
      if (generateOptions.overwrite === true) {
        return pathAndCodes;
      } else {
        return pathAndCodes.filter((pathAndCode) => {
          const { targets } = Sonamu.config.sync;
          const filePath = `${Sonamu.appRootPath}/${pathAndCode.path}`;
          const dstFilePaths = targets.map((target) =>
            filePath.replace("/:target/", `/${target}/`)
          );
          return dstFilePaths.every(
            (dstPath) => fs.existsSync(dstPath) === false
          );
        });
      }
    })();
    if (filteredPathAndCodes.length === 0) {
      throw new AlreadyProcessedException(
        "이미 경로에 모든 파일이 존재합니다."
      );
    }

    return Promise.all(
      filteredPathAndCodes.map((pathAndCode) =>
        this.writeCodeToPath(pathAndCode)
      )
    );
  }

  checkExistsGenCode(
    entityId: string,
    templateKey: TemplateKey,
    enumId?: string
  ): { subPath: string; fullPath: string; isExists: boolean } {
    const { target, path: genPath } = this.getTemplate(
      templateKey
    ).getTargetAndPath(EntityManager.getNamesFromId(entityId), enumId);

    const fullPath = path.join(Sonamu.appRootPath, target, genPath);
    const subPath = path.join(target, genPath);
    return {
      subPath,
      fullPath,
      isExists: fs.existsSync(fullPath),
    };
  }

  checkExists(
    entityId: string,
    enums: {
      [name: string]: z.ZodEnum<any>;
    }
  ): Record<`${TemplateKey}${string}`, boolean> {
    const keys: TemplateKey[] = TemplateKey.options;
    const names = EntityManager.getNamesFromId(entityId);
    const enumsKeys = Object.keys(enums).filter(
      (name) => name !== names.constant
    );

    return keys.reduce(
      (result, key) => {
        const tpl = this.getTemplate(key);
        if (key.startsWith("view_enums")) {
          enumsKeys.map((componentId) => {
            const { target, path: p } = tpl.getTargetAndPath(
              names,
              componentId
            );
            result[`${key}__${componentId}`] = fs.existsSync(
              path.join(Sonamu.appRootPath, target, p)
            );
          });
          return result;
        }

        const { target, path: p } = tpl.getTargetAndPath(names);
        const { targets } = Sonamu.config.sync;
        if (target.includes(":target")) {
          targets.map((t) => {
            result[`${key}__${t}`] = fs.existsSync(
              path.join(Sonamu.appRootPath, target.replace(":target", t), p)
            );
          });
        } else {
          result[key] = fs.existsSync(path.join(Sonamu.appRootPath, target, p));
        }

        return result;
      },
      {} as Record<`${TemplateKey}${string}`, boolean>
    );
  }

  async getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
    const modulePath = EntityManager.getModulePath(zodTypeId);
    const moduleAbsPath = path.join(
      Sonamu.apiRootPath,
      "dist",
      "application",
      modulePath + ".js"
    );
    const importPath = "./" + path.relative(__dirname, moduleAbsPath);
    const imported = await import(importPath);

    if (!imported[zodTypeId]) {
      throw new Error(`존재하지 않는 zodTypeId ${zodTypeId}`);
    }
    return imported[zodTypeId].describe(zodTypeId);
  }

  async propNodeToZodType(propNode: EntityPropNode): Promise<z.ZodTypeAny> {
    if (propNode.nodeType === "plain") {
      return this.propToZodType(propNode.prop);
    } else if (propNode.nodeType === "array") {
      if (propNode.prop === undefined) {
        throw new Error();
      } else if (propNode.children.length > 0) {
        return (
          await this.propNodeToZodType({
            ...propNode,
            nodeType: "object",
          })
        ).array();
      } else {
        const innerType = await this.propToZodType(propNode.prop);
        if (propNode.prop.nullable === true) {
          return z.array(innerType).nullable();
        } else {
          return z.array(innerType);
        }
      }
    } else if (propNode.nodeType === "object") {
      const obj = await propNode.children.reduce(
        async (promise, childPropNode) => {
          const result = await promise;
          result[childPropNode.prop!.name] =
            await this.propNodeToZodType(childPropNode);
          return result;
        },
        {} as any
      );

      if (propNode.prop?.nullable === true) {
        return z.object(obj).nullable();
      } else {
        return z.object(obj);
      }
    } else {
      throw Error;
    }
  }
  async propToZodType(prop: EntityProp): Promise<z.ZodTypeAny> {
    let zodType: z.ZodTypeAny = z.unknown();
    if (isIntegerProp(prop)) {
      zodType = z.number().int();
    } else if (isBigIntegerProp(prop)) {
      zodType = z.bigint();
    } else if (isTextProp(prop)) {
      zodType = z.string().max(getTextTypeLength(prop.textType));
    } else if (isEnumProp(prop)) {
      zodType = await this.getZodTypeById(prop.id);
    } else if (isStringProp(prop)) {
      zodType = z.string().max(prop.length);
    } else if (isFloatProp(prop) || isDoubleProp(prop)) {
      zodType = z.number();
    } else if (isDecimalProp(prop)) {
      zodType = z.string();
    } else if (isBooleanProp(prop)) {
      zodType = z.boolean();
    } else if (isDateProp(prop)) {
      zodType = z.string().length(10);
    } else if (isTimeProp(prop)) {
      zodType = z.string().length(8);
    } else if (isDateTimeProp(prop)) {
      zodType = SQLDateTimeString;
    } else if (isTimestampProp(prop)) {
      zodType = SQLDateTimeString;
    } else if (isJsonProp(prop)) {
      zodType = await this.getZodTypeById(prop.id);
    } else if (isUuidProp(prop)) {
      zodType = z.string().uuid();
    } else if (isVirtualProp(prop)) {
      zodType = await this.getZodTypeById(prop.id);
    } else if (isRelationProp(prop)) {
      if (
        isBelongsToOneRelationProp(prop) ||
        (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
      ) {
        zodType = z.number().int();
      }
    } else {
      throw new Error(`prop을 zodType으로 변환하는데 실패 ${prop}}`);
    }

    if ((prop as { unsigned?: boolean }).unsigned) {
      zodType = (zodType as z.ZodNumber).nonnegative();
    }
    if (prop.nullable) {
      zodType = zodType.nullable();
    }

    return zodType;
  }

  resolveRenderType(
    key: string,
    zodType: z.ZodTypeAny
  ): RenderingNode["renderType"] {
    if (zodType instanceof z.ZodString) {
      if (key.includes("img") || key.includes("image")) {
        return "string-image";
      } else if (zodType.description === "SQLDateTimeString") {
        return "string-datetime";
      } else if (key.endsWith("date")) {
        return "string-date";
      } else {
        return "string-plain";
      }
    } else if (zodType instanceof z.ZodNumber) {
      if (key === "id") {
        return "number-id";
      } else if (key.endsWith("_id")) {
        return "number-fk_id";
      } else {
        return "number-plain";
      }
    } else if (zodType instanceof z.ZodBoolean) {
      return "boolean";
    } else if (zodType instanceof z.ZodEnum) {
      return "enums";
    } else if (zodType instanceof z.ZodRecord) {
      return "record";
    } else if (zodType instanceof z.ZodAny || zodType instanceof z.ZodUnknown) {
      return "string-plain";
    } else if (zodType instanceof z.ZodUnion) {
      return "string-plain";
    } else if (zodType instanceof z.ZodLiteral) {
      return "string-plain";
    } else {
      throw new Error(`타입 파싱 불가 ${key} ${zodType._def.typeName}`);
    }
  }
  zodTypeToRenderingNode(
    zodType: z.ZodTypeAny,
    baseKey: string = "root"
  ): RenderingNode {
    const def = {
      name: baseKey,
      label: inflection.camelize(baseKey, false),
      zodType,
    };
    if (zodType instanceof z.ZodObject) {
      const columnKeys = Object.keys(zodType.shape);
      const children = columnKeys.map((key) => {
        const innerType = zodType.shape[key];
        return this.zodTypeToRenderingNode(innerType, key);
      });
      return {
        ...def,
        renderType: "object",
        children,
      };
    } else if (zodType instanceof z.ZodArray) {
      const innerType = zodType._def.type;
      if (innerType instanceof z.ZodString && baseKey.includes("images")) {
        return {
          ...def,
          renderType: "array-images",
        };
      }
      return {
        ...def,
        renderType: "array",
        element: this.zodTypeToRenderingNode(innerType, baseKey),
      };
    } else if (zodType instanceof z.ZodUnion) {
      const optionNodes = zodType._def.options.map((opt: z.ZodTypeAny) =>
        this.zodTypeToRenderingNode(opt, baseKey)
      );
      // TODO: ZodUnion이 들어있는 경우 핸들링
      return optionNodes[0];
    } else if (zodType instanceof z.ZodOptional) {
      return {
        ...this.zodTypeToRenderingNode(zodType._def.innerType, baseKey),
        optional: true,
      };
    } else if (zodType instanceof z.ZodNullable) {
      return {
        ...this.zodTypeToRenderingNode(zodType._def.innerType, baseKey),
        nullable: true,
      };
    } else {
      return {
        ...def,
        renderType: this.resolveRenderType(baseKey, zodType),
      };
    }
  }

  async getColumnsNode(
    entityId: string,
    subsetKey: string
  ): Promise<RenderingNode> {
    const entity = await EntityManager.get(entityId);
    const subsetA = entity.subsets[subsetKey];
    if (subsetA === undefined) {
      throw new ServiceUnavailableException("SubsetA 가 없습니다.");
    }
    const propNodes = entity.fieldExprsToPropNodes(subsetA);
    const rootPropNode: EntityPropNode = {
      nodeType: "object",
      children: propNodes,
    };

    const columnsZodType = (await this.propNodeToZodType(
      rootPropNode
    )) as z.ZodObject<any>;

    const columnsNode = this.zodTypeToRenderingNode(columnsZodType);
    columnsNode.children = columnsNode.children!.map((child) => {
      if (child.renderType === "object") {
        const pickedCol = child.children!.find((cc) =>
          ["title", "name"].includes(cc.name)
        );
        if (pickedCol) {
          return {
            ...child,
            renderType: "object-pick",
            config: {
              picked: pickedCol.name,
            },
          };
        } else {
          return child;
        }
      } else if (
        child.renderType === "array" &&
        child.element &&
        child.element.renderType === "object"
      ) {
        const pickedCol = child.element!.children!.find((cc) =>
          ["title", "name"].includes(cc.name)
        );
        if (pickedCol) {
          return {
            ...child,
            element: {
              ...child.element,
              renderType: "object-pick",
              config: {
                picked: pickedCol.name,
              },
            },
          };
        } else {
          return child;
        }
      }
      return child;
    });

    return columnsNode;
  }

  async createEntity(
    form: Omit<TemplateOptions["entity"], "title"> & { title?: string }
  ) {
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(form.entityId)) {
      throw new BadRequestException("entityId는 CamelCase 형식이어야 합니다.");
    }

    await this.generateTemplate("entity", form);

    // reload entities
    await EntityManager.reload();

    // generate schemas, types
    await Promise.all([
      this.actionGenerateSchemas(),
      ...(form.parentId === undefined
        ? [
            this.generateTemplate("init_types", {
              entityId: form.entityId,
            }),
          ]
        : []),
    ]);
  }

  async delEntity(entityId: string): Promise<{ delPaths: string[] }> {
    const entity = EntityManager.get(entityId);

    const delPaths = (() => {
      if (entity.parentId) {
        return [
          `${Sonamu.apiRootPath}/src/application/${entity.names.parentFs}/${entity.names.fs}.entity.json`,
        ];
      } else {
        return [
          `${Sonamu.apiRootPath}/src/application/${entity.names.fs}`,
          `${Sonamu.apiRootPath}/dist/application/${entity.names.fs}`,
          ...Sonamu.config.sync.targets
            .map((target) => [
              `${Sonamu.appRootPath}/${target}/src/services/${entity.names.fs}`,
            ])
            .flat(),
        ];
      }
    })(); // iife

    for await (const delPath of delPaths) {
      if (fs.existsSync(delPath)) {
        console.log(chalk.red(`DELETE ${delPath}`));
        execSync(`rm -rf ${delPath}`);
      } else {
        console.log(chalk.yellow(`NOT_EXISTS ${delPath}`));
      }
    }

    // reload entities
    await EntityManager.reload();

    return { delPaths };
  }
}
