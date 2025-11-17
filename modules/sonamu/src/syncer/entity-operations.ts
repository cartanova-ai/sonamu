import { rm } from "fs/promises";
import { exists } from "../utils/fs-utils";
import chalk from "chalk";
import { EntityManager } from "../entity/entity-manager";
import { TemplateOptions } from "../types/types";
import { BadRequestException } from "../exceptions/so-exceptions";
import { Sonamu } from "../api/sonamu";
import { generateTemplate } from "./code-generator";

/**
 * 새로운 엔티티를 생성합니다.
 * entityId는 반드시 CamelCase 형식이어야 합니다.
 */
export async function createEntity(
  form: Omit<TemplateOptions["entity"], "title"> & { title?: string }
) {
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(form.entityId)) {
    throw new BadRequestException("entityId는 CamelCase 형식이어야 합니다.");
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
export async function delEntity(
  entityId: string
): Promise<{ delPaths: string[] }> {
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
    if (await exists(delPath)) {
      console.log(chalk.red(`DELETE ${delPath}`));
      await rm(delPath, { recursive: true, force: true });
    } else {
      console.log(chalk.yellow(`NOT_EXISTS ${delPath}`));
    }
  }

  // reload entities
  await EntityManager.reload();

  return { delPaths };
}
