import chalk from "chalk";

import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import { type EntityIndex, type EntityJson, type EntityProp } from "../types/types";
import { betterAuthV1 } from "./better-auth-entities";
import { ENTITY_DEFINITIONS, isValidPluginId } from "./plugins/entity-definitions";
import { type BetterAuthPluginId } from "./plugins/entity-definitions";

interface SubsetFields {
  [subsetKey: string]: string[];
}

/**
 * 누락된 props 찾기
 */
function findMissingProps(existingProps: EntityProp[], requiredProps: EntityProp[]): EntityProp[] {
  const existingNames = new Set(existingProps.map((p) => p.name));
  return requiredProps.filter((p) => !existingNames.has(p.name));
}

/**
 * 타입이 변경된 props 찾기 (동일 name, 다른 type)
 * @returns [기존 prop index, 새 prop][]
 */
function findPropsToUpdate(
  existingProps: EntityProp[],
  requiredProps: EntityProp[],
): { index: number; newProp: EntityProp }[] {
  const result: { index: number; newProp: EntityProp }[] = [];

  for (const requiredProp of requiredProps) {
    const existingIndex = existingProps.findIndex((p) => p.name === requiredProp.name);
    if (existingIndex === -1) continue;

    const existingProp = existingProps[existingIndex];
    // type이 다르거나 cone.fixtureStrategy가 다르면 업데이트 대상
    const coneChanged = requiredProp.cone?.fixtureStrategy !== existingProp?.cone?.fixtureStrategy;
    if (existingProp?.type !== requiredProp.type || coneChanged) {
      result.push({ index: existingIndex, newProp: requiredProp });
    }
  }

  return result;
}

/**
 * 누락된 indexes 찾기
 */
function findMissingIndexes(
  existingIndexes: EntityIndex[],
  requiredIndexes: EntityIndex[],
): EntityIndex[] {
  const existingNames = new Set(existingIndexes.map((i) => i.name));
  return requiredIndexes.filter((i) => !existingNames.has(i.name));
}

/**
 * 누락된 subsets 찾기
 */
function findMissingSubsets(
  existingSubsets: SubsetFields,
  requiredSubsets: SubsetFields,
): SubsetFields {
  const missing: SubsetFields = {};
  for (const [key, fields] of Object.entries(requiredSubsets)) {
    if (!existingSubsets[key]) {
      missing[key] = fields;
    }
  }
  return missing;
}

/**
 * 엔티티를 생성하거나 업데이트합니다.
 */
async function createOrUpdateEntity(entityJson: EntityJson): Promise<void> {
  const exists = EntityManager.exists(entityJson.id);

  if (!exists) {
    // 새 엔티티 생성
    await Sonamu.syncer.createEntity({
      entityId: entityJson.id,
      table: entityJson.table,
      title: entityJson.title ?? entityJson.id,
      props: entityJson.props ?? [],
      indexes: entityJson.indexes ?? [],
      subsets: entityJson.subsets ?? {},
      enums: entityJson.enums ?? {},
    });

    const entity = EntityManager.get(entityJson.id);
    await entity.save();
    console.log(chalk.green(`[CREATED] ${entityJson.id}`));
    return;
  }

  // 기존 엔티티 업데이트
  const entity = EntityManager.get(entityJson.id);
  let hasChanges = false;

  // 누락된 props 추가
  const missingProps = findMissingProps(entity.props, entityJson.props ?? []);
  for (const prop of missingProps) {
    await entity.createProp(prop);
    console.log(chalk.green(`[ADD PROP] ${entityJson.id}.${prop.name}`));
    hasChanges = true;
  }

  // 타입이 변경된 props 업데이트
  const propsToUpdate = findPropsToUpdate(entity.props, entityJson.props ?? []);
  for (const { index, newProp } of propsToUpdate) {
    const oldType = entity.props[index]?.type;
    await entity.modifyProp(newProp, index);
    console.log(
      chalk.yellow(`[UPDATE PROP] ${entityJson.id}.${newProp.name}: ${oldType} → ${newProp.type}`),
    );
    hasChanges = true;
  }

  // 누락된 indexes 추가
  const missingIndexes = findMissingIndexes(entity.indexes, entityJson.indexes ?? []);
  for (const index of missingIndexes) {
    entity.indexes.push(index);
    console.log(chalk.green(`[ADD INDEX] ${entityJson.id}.${index.name}`));
    hasChanges = true;
  }

  // 누락된 subsets 추가
  const missingSubsets = findMissingSubsets(
    entity.subsets,
    /* SAFETY: better-auth 훅과 어댑터 계약이 이 값의 타입을 보장한다. */ (entityJson.subsets ??
      {}) as { [key: string]: string[] },
  );
  for (const [key, fields] of Object.entries(missingSubsets)) {
    entity.subsets[key] = fields;
    console.log(chalk.green(`[ADD SUBSET] ${entityJson.id}.${key}`));
    hasChanges = true;
  }

  // 변경사항 저장
  if (hasChanges) {
    await entity.save();
    console.log(chalk.blue(`[UPDATED] ${entityJson.id}`));
  } else {
    console.log(chalk.dim(`[SKIP] ${entityJson.id} - no changes`));
  }
}

/**
 * 기존 엔티티에 props를 추가합니다.
 */
async function addPropsToEntity(entityId: string, props: EntityProp[]): Promise<void> {
  if (!EntityManager.exists(entityId)) {
    console.log(chalk.yellow(`[SKIP] ${entityId} - entity not found, cannot add props`));
    return;
  }

  const entity = EntityManager.get(entityId);
  let hasChanges = false;

  const missingProps = findMissingProps(entity.props, props);
  for (const prop of missingProps) {
    await entity.createProp(prop);
    console.log(chalk.green(`[ADD PROP] ${entityId}.${prop.name}`));
    hasChanges = true;
  }

  if (hasChanges) {
    await entity.save();
  }
}

/**
 * 기존 엔티티에 indexes를 추가합니다.
 */
async function addIndexesToEntity(entityId: string, indexes: EntityIndex[]): Promise<void> {
  if (!EntityManager.exists(entityId)) {
    console.log(chalk.yellow(`[SKIP] ${entityId} - entity not found, cannot add indexes`));
    return;
  }

  const entity = EntityManager.get(entityId);
  let hasChanges = false;

  const missingIndexes = findMissingIndexes(entity.indexes, indexes);
  for (const index of missingIndexes) {
    entity.indexes.push(index);
    console.log(chalk.green(`[ADD INDEX] ${entityId}.${index.name}`));
    hasChanges = true;
  }

  if (hasChanges) {
    await entity.save();
  }
}

export interface GenerateBetterAuthEntitiesOptions {
  /**
   * 활성화할 플러그인 ID 목록
   * 예: ["phone-number", "2fa"]
   */
  plugins?: BetterAuthPluginId[];
}

/**
 * 기존 프로젝트의 entity.json에 fixtureCompanions를 소급 추가합니다.
 *
 * betterAuthV1 기준으로 fixtureCompanions가 정의된 entity를 찾아
 * 프로젝트 내 entity.json에 해당 prop의 cone에 fixtureCompanions가
 * 없을 때만 추가합니다. 이미 있으면 스킵합니다.
 */
export async function addCompanionsToEntities(): Promise<void> {
  for (const entityJson of betterAuthV1) {
    const idProp = entityJson.props?.find((p) => p.name === "id");
    if (!idProp?.cone?.fixtureCompanions) continue;

    if (!EntityManager.exists(entityJson.id)) {
      console.log(chalk.yellow(`[SKIP] ${entityJson.id} - not found`));
      continue;
    }

    const entity = EntityManager.get(entityJson.id);
    const existingIdProp = entity.props.find((p) => p.name === "id");
    if (!existingIdProp) {
      console.log(chalk.yellow(`[SKIP] ${entityJson.id}.id - prop not found`));
      continue;
    }

    if (existingIdProp.cone?.fixtureCompanions) {
      console.log(chalk.dim(`[SKIP] ${entityJson.id}.id - fixtureCompanions already exists`));
      continue;
    }

    existingIdProp.cone = {
      ...existingIdProp.cone,
      fixtureCompanions: idProp.cone.fixtureCompanions,
    };
    await entity.save();
    console.log(chalk.green(`[UPDATED] ${entityJson.id}.id - fixtureCompanions added`));
  }
}

/**
 * better-auth 엔티티들을 Sonamu에 생성/업데이트
 *
 * @param options 생성 옵션
 * @param options.plugins 활성화할 플러그인 ID 목록
 */
export async function generateBetterAuthEntities(
  options: GenerateBetterAuthEntitiesOptions = {},
): Promise<void> {
  const { plugins = [] } = options;

  // 1. 기본 엔티티 생성/업데이트
  console.log(chalk.cyan("\n📦 Processing core entities...\n"));
  for (const entityJson of betterAuthV1) {
    await createOrUpdateEntity(entityJson);
  }

  // 2. 플러그인 처리
  if (plugins.length > 0) {
    console.log(chalk.cyan("\n🔌 Processing plugins...\n"));

    for (const pluginId of plugins) {
      if (!isValidPluginId(pluginId)) {
        console.log(chalk.red(`[ERROR] Unknown plugin: ${pluginId}`));
        continue;
      }

      const entityDef = ENTITY_DEFINITIONS[pluginId];
      console.log(chalk.magenta(`[PLUGIN] ${entityDef.name}`));

      // 플러그인의 새 엔티티 생성
      for (const entityJson of entityDef.entities) {
        await createOrUpdateEntity(entityJson);
      }

      // 기존 엔티티에 필드 추가
      for (const [entityId, props] of Object.entries(entityDef.additionalProps)) {
        await addPropsToEntity(entityId, props);
      }

      // 기존 엔티티에 인덱스 추가
      if (entityDef.additionalIndexes) {
        for (const [entityId, indexes] of Object.entries(entityDef.additionalIndexes)) {
          await addIndexesToEntity(entityId, indexes);
        }
      }
    }
  }

  console.log(chalk.bold("\n✅ Done! better-auth entities generated."));
}
