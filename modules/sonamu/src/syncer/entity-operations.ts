import chalk from "chalk";

import { Sonamu } from "../api/sonamu";
import { SD } from "../dict/sd";
import { EntityManager } from "../entity/entity-manager";
import { BadRequestException } from "../exceptions/so-exceptions";
import { type TemplateOptions } from "../types/types";
import { isTest } from "../utils/controller";
import { generateTemplate } from "./code-generator";
import { syncerFileExists, syncerFilesystem } from "./filesystem-dependencies";

/**
 * 새로운 엔티티를 생성합니다.
 * entityId는 반드시 CamelCase 형식이어야 합니다.
 */
export async function createEntity(
  form: Omit<TemplateOptions["entity"], "title"> & { title: string },
) {
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(form.entityId)) {
    throw new BadRequestException(SD("sonamu.error.entityIdCamelCase"));
  }

  await generateTemplate("entity", form);

  // reload entities
  await EntityManager.reload();
}

/**
 * 엔티티를 삭제합니다.
 * parentId가 있는 서브 엔티티의 경우 entity.json만 삭제하고,
 * 루트 엔티티의 경우 디렉토리 전체와 타겟 디렉토리를 삭제합니다.
 */
export async function delEntity(entityId: string): Promise<{ delPaths: string[] }> {
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
        ...Sonamu.config.sync.targets.flatMap((target) => [
          `${Sonamu.appRootPath}/${target}/src/services/${entity.names.fs}`,
        ]),
      ];
    }
  })(); // iife

  for (const delPath of delPaths) {
    if (await syncerFileExists(delPath)) {
      !isTest() && console.log(chalk.red(`DELETE ${delPath}`));
      await syncerFilesystem.rm(delPath, { recursive: true, force: true });
    } else {
      !isTest() && console.log(chalk.yellow(`NOT_EXISTS ${delPath}`));
    }
  }

  // reload entities
  await EntityManager.reload();

  return { delPaths };
}
