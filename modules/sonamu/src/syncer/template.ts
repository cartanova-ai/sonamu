import path from "path";
import { Sonamu } from "../api/sonamu";
import {
  AlreadyProcessedException,
  BadRequestException,
  ServiceUnavailableException,
} from "../exceptions/so-exceptions";
import {
  EntityPropNode,
  GenerateOptions,
  PathAndCode,
  RenderingNode,
  TemplateKey,
  TemplateOptions,
} from "../types/types";
import { everyAsync, filterAsync } from "../utils/async-utils";
import { exists } from "../utils/fs-utils";
import chalk from "chalk";
import { mkdir, writeFile } from "fs/promises";
import * as _ from "lodash-es";
import { Template } from "../templates";
import { RenderedTemplate } from "../templates/base-template";
import { EntityManager } from "../entity/entity-manager";
import { wrapIf } from "../utils/lodash-able";
import prettier from "prettier";
import { Template__entity } from "../templates/entity.template";
import { Template__init_types } from "../templates/init_types.template";
import { Template__generated } from "../templates/generated.template";
import { Template__generated_sso } from "../templates/generated_sso.template";
import { Template__generated_http } from "../templates/generated_http.template";
import { Template__model } from "../templates/model.template";
import { Template__model_test } from "../templates/model_test.template";
import { Template__service } from "../templates/service.template";
import { Template__view_list } from "../templates/view_list.template";
import { Template__view_list_columns } from "../templates/view_list_columns.template";
import { Template__view_search_input } from "../templates/view_search_input.template";
import { Template__view_form } from "../templates/view_form.template";
import { Template__view_id_all_select } from "../templates/view_id_all_select.template";
import { Template__view_id_async_select } from "../templates/view_id_async_select.template";
import z from "zod";
import { Template__view_enums_select } from "../templates/view_enums_select.template";
import { Template__view_enums_dropdown } from "../templates/view_enums_dropdown.template";
import { Template__view_enums_buttonset } from "../templates/view_enums_buttonset.template";
import {
  getZodTypeById,
  propNodeToZodType,
  zodTypeToRenderingNode,
} from "./ast-parsing";

export async function generateTemplate(
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
        return await renderTemplate(key, templateOptions);
      })
    )
  ).flat();

  const filteredPathAndCodes: PathAndCode[] = await (async () => {
    if (generateOptions.overwrite === true) {
      return pathAndCodes;
    } else {
      return await filterAsync(pathAndCodes, async (pathAndCode) => {
        const { targets } = Sonamu.config.sync;
        const filePath = `${Sonamu.appRootPath}/${pathAndCode.path}`;
        const dstFilePaths = targets.map((target) =>
          filePath.replace("/:target/", `/${target}/`)
        );
        return await everyAsync(
          dstFilePaths,
          async (dstPath) => !(await exists(dstPath))
        );
      });
    }
  })();
  if (filteredPathAndCodes.length === 0) {
    throw new AlreadyProcessedException("이미 경로에 모든 파일이 존재합니다.");
  }

  return Promise.all(
    filteredPathAndCodes.map((pathAndCode) => writeCodeToPath(pathAndCode))
  );
}

export async function renderTemplate<T extends keyof TemplateOptions>(
  key: T,
  options: TemplateOptions[T]
): Promise<PathAndCode[]> {
  const template: Template = getTemplate(key);

  let extra: unknown[] = [];
  if (["model", "view_list", "view_form"].includes(key)) {
    const entityId = (options as TemplateOptions["model"]).entityId;
    if (key === "view_list" || key === "model") {
      // view_list 필요 정보 (컬럼 노드, 리스트파라미터 노드)
      const columnsNode = await getColumnsNode(entityId, "A");
      const listParamsZodType = await getZodTypeById(`${entityId}ListParams`);
      const listParamsNode = zodTypeToRenderingNode(listParamsZodType);
      extra = [columnsNode, listParamsNode];
    } else if (key === "view_form") {
      // view_form 필요 정보 (세이브파라미터 노드)
      const saveParamsZodType = await getZodTypeById(`${entityId}SaveParams`);
      const saveParamsNode = zodTypeToRenderingNode(saveParamsZodType);
      extra = [saveParamsNode];
    }
  }

  const rendered = await template.render(options, ...extra);
  const resolved = await resolveRenderedTemplate(key, rendered);

  let preTemplateResolved: PathAndCode[] = [];
  if (rendered.preTemplates) {
    preTemplateResolved = (
      await Promise.all(
        rendered.preTemplates.map(({ key, options }) => {
          return renderTemplate(key, options);
        })
      )
    ).flat();
  }

  return [resolved, ...preTemplateResolved];
}

async function getColumnsNode(
  entityId: string,
  subsetKey: string
): Promise<RenderingNode> {
  const entity = EntityManager.get(entityId);
  const subsetA = entity.subsets[subsetKey];
  if (subsetA === undefined) {
    throw new ServiceUnavailableException("SubsetA 가 없습니다.");
  }
  const propNodes = entity.fieldExprsToPropNodes(subsetA);
  const rootPropNode: EntityPropNode = {
    nodeType: "object",
    children: propNodes,
  };

  const columnsZodType = (await propNodeToZodType(
    rootPropNode
  )) as z.ZodObject<any>;

  const columnsNode = zodTypeToRenderingNode(columnsZodType);
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

export function getTemplate(key: TemplateKey): Template {
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

async function resolveRenderedTemplate(
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
        const existsOne = r.find((importDef) => importDef.from === importPath);
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

async function writeCodeToPath(pathAndCode: PathAndCode): Promise<string[]> {
  const { targets } = Sonamu.config.sync;
  const { appRootPath } = Sonamu;
  const filePath = `${Sonamu.appRootPath}/${pathAndCode.path}`;

  const dstFilePaths = _.uniq(
    targets.map((target) => filePath.replace("/:target/", `/${target}/`))
  );
  return await Promise.all(
    dstFilePaths.map(async (dstFilePath) => {
      const dir = path.dirname(dstFilePath);
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      await writeFile(dstFilePath, pathAndCode.code);
      console.log(
        chalk.bold("Generated: ") +
          chalk.blue(`${dstFilePath.replace(appRootPath + "/", "")}`)
      );
      return dstFilePath;
    })
  );
}
